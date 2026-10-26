from __future__ import annotations

import argparse
import gzip
import json
import os
import sqlite3
import sys
from datetime import date, datetime, timedelta, timezone
from typing import Any

from pipeline.db import connect
from pipeline.regions import REGIONS, city_of
from pipeline.summary import apartment_summary

PREFIX = "v1"
RECENT_LIMIT = 6
TOP_N = 3


def write_gz(path: str, obj: Any) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(path, "wb") as raw, gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as f:  # 동일 내용 = 동일 바이트
        f.write(data)


def _region_name(conn: sqlite3.Connection, lawd_cd: str) -> str:
    row = conn.execute("SELECT city_name, district_name FROM regions WHERE code = ?", (lawd_cd,)).fetchone()
    return f"{row[0]} {row[1]}" if row else city_of(lawd_cd)


def _apartment_block(conn: sqlite3.Connection, s: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": s["id"], "name": s["name"], "dong": s["dong"], "lawd_cd": s["lawd_cd"],
        "region_name": _region_name(conn, s["lawd_cd"]), "city": s["city"], "jibun": s["jibun"],
        "build_year": s["build_year"], "apt_seq": s["apt_seq"], "lat": s["lat"], "lng": s["lng"],
    }


def build_apt_trade(
    conn: sqlite3.Connection, apt_id: int, today: date, summary: dict[str, Any] | None = None
) -> dict[str, Any]:
    s = summary or apartment_summary(conn, apt_id, today)
    rows = conn.execute(
        "SELECT id, amount, area, floor, deal_date, cancel_date FROM transactions "
        "WHERE apt_id = ? ORDER BY deal_date DESC, id DESC",
        (apt_id,),
    ).fetchall()
    return {
        "apartment": _apartment_block(conn, s),
        "area_stats": s["area_stats"],
        "metrics": s["metrics"],
        "transactions": [dict(r) for r in rows],
    }


def build_apt_rent(
    conn: sqlite3.Connection, apt_id: int, today: date, summary: dict[str, Any] | None = None
) -> dict[str, Any]:
    s = summary or apartment_summary(conn, apt_id, today)
    rows = conn.execute(
        "SELECT id, deposit, monthly_rent, area, floor, deal_date, contract_type, use_rr_right, "
        "pre_deposit, pre_monthly_rent FROM rents WHERE apt_id = ? ORDER BY deal_date DESC, id DESC",
        (apt_id,),
    ).fetchall()
    return {
        "apartment": _apartment_block(conn, s),
        "rent_area_stats": s["rent_area_stats"],
        "rents": [dict(r) for r in rows],
    }


_LIST_FIELDS = (
    "id", "name", "dong", "build_year", "trade_count", "latest_trade_amount",
    "latest_trade_date", "latest_jeonse_deposit", "lat", "lng",
)


def _slim(s: dict[str, Any]) -> dict[str, Any]:
    return {k: s[k] for k in _LIST_FIELDS}


def _region_doc(code: str, entries: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "code": code,
        "name": REGIONS[code],
        "city": city_of(code),
        "succeeded_by": None,
        "apartments": sorted(entries, key=lambda e: (-e["trade_count"], e["id"])),
    }


def _slim_all(conn: sqlite3.Connection, codes: set[str] | None = None) -> dict[str, list[dict[str, Any]]]:
    """지역 목록용 축약 필드를 단지별 요약 없이 전체 스캔 3회로 만든다 (Task 5 의미와 동일)."""
    apts = {
        r["id"]: r for r in conn.execute(
            "SELECT id, name, lawd_cd, dong, build_year, latitude, longitude FROM apartments"
        ) if codes is None or r["lawd_cd"] in codes
    }
    count: dict[int, int] = {}
    best: dict[int, tuple[str, int, int]] = {}  # apt -> (최신일, 평형, 금액)
    seen: set[tuple[int, int]] = set()
    for apt_id, grp, amount, deal_date in conn.execute(
        "SELECT apt_id, CAST(area AS INTEGER), amount, deal_date FROM transactions "
        "WHERE cancel_date IS NULL ORDER BY deal_date DESC, id DESC"
    ):
        if apt_id not in apts:
            continue
        count[apt_id] = count.get(apt_id, 0) + 1
        if (apt_id, grp) in seen:
            continue  # 평형별 최신 거래만
        seen.add((apt_id, grp))
        cur = best.get(apt_id)
        # summary 는 평형 오름차순 max() 라 최신일 동률이면 작은 평형이 이긴다
        if cur is None or deal_date > cur[0] or (deal_date == cur[0] and grp < cur[1]):
            best[apt_id] = (deal_date, grp, amount)
    jeonse: dict[int, int] = {}
    for apt_id, deposit in conn.execute(
        "SELECT apt_id, deposit FROM rents WHERE monthly_rent = 0 ORDER BY deal_date DESC, id DESC"
    ):
        if apt_id in apts and apt_id not in jeonse:
            jeonse[apt_id] = deposit
    out: dict[str, list[dict[str, Any]]] = {}
    for apt_id, a in apts.items():
        b = best.get(apt_id)
        out.setdefault(a["lawd_cd"], []).append({
            "id": apt_id, "name": a["name"], "dong": a["dong"], "build_year": a["build_year"],
            "trade_count": count.get(apt_id, 0),
            "latest_trade_amount": b[2] if b else None,
            "latest_trade_date": b[0] if b else None,
            "latest_jeonse_deposit": jeonse.get(apt_id),
            "lat": a["latitude"], "lng": a["longitude"],
        })
    return out


def build_region(conn: sqlite3.Connection, lawd_cd: str, today: date) -> dict[str, Any]:
    return _region_doc(lawd_cd, _slim_all(conn, {lawd_cd}).get(lawd_cd, []))


def _date_range(conn: sqlite3.Connection) -> dict[str, Any]:
    lo, hi = conn.execute("SELECT MIN(deal_date), MAX(deal_date) FROM transactions").fetchone()
    return {"min_date": lo, "max_date": hi}


def _count(conn: sqlite3.Connection, table: str) -> int:
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def _region_stats(conn: sqlite3.Connection, today: date) -> list[dict[str, Any]]:
    cur = (today - timedelta(days=365)).isoformat()
    prev = (today - timedelta(days=730)).isoformat()
    agg = {
        r[0]: (r[1], r[2], r[3], r[4])
        for r in conn.execute(
            "SELECT a.lawd_cd, "
            "SUM(t.deal_date >= :cur), SUM(CASE WHEN t.deal_date >= :cur THEN t.amount END), "
            "SUM(t.deal_date < :cur), SUM(CASE WHEN t.deal_date < :cur THEN t.amount END) "
            "FROM transactions t JOIN apartments a ON a.id = t.apt_id "
            "WHERE t.cancel_date IS NULL AND t.deal_date >= :prev GROUP BY a.lawd_cd",
            {"cur": cur, "prev": prev},
        )
    }
    out: list[dict[str, Any]] = []
    for code, name in REGIONS.items():
        n, total, pn, ptotal = agg.get(code, (0, None, 0, None))
        avg = int(total / n) if n else None
        yoy = None
        if n and pn:
            yoy = round((total / n / (ptotal / pn) - 1) * 100, 1)
        out.append({
            "code": code, "name": name, "city": city_of(code),
            "avg_amount": avg, "tx_count_12m": n or 0, "yoy_change": yoy,
        })
    return out


def build_stats(conn: sqlite3.Connection, today: date) -> dict[str, Any]:
    regions = _region_stats(conn, today)
    ranked = sorted((r for r in regions if r["yoy_change"] is not None), key=lambda r: r["yoy_change"])
    recent = conn.execute(
        "SELECT t.apt_id, a.name, a.lawd_cd, t.amount, t.area, t.deal_date FROM transactions t "
        "JOIN apartments a ON a.id = t.apt_id WHERE t.cancel_date IS NULL "
        "ORDER BY t.deal_date DESC, t.id DESC LIMIT ?",
        (RECENT_LIMIT,),
    ).fetchall()
    since = (today - timedelta(days=30)).isoformat()
    return {
        "data_updated_at": datetime.now(timezone.utc).isoformat(),
        "data_range": _date_range(conn),
        "total_apartments": _count(conn, "apartments"),
        "recent_transactions_30d": conn.execute(
            "SELECT COUNT(*) FROM transactions WHERE cancel_date IS NULL AND deal_date >= ?", (since,)
        ).fetchone()[0],
        "recent": [
            {"apt_id": r["apt_id"], "name": r["name"], "region_name": _region_name(conn, r["lawd_cd"]),
             "amount": r["amount"], "area": r["area"], "deal_date": r["deal_date"]}
            for r in recent
        ],
        "regions": regions,
        "top_up": ranked[::-1][:TOP_N],
        "top_down": ranked[:TOP_N],
    }


def build_search_index(conn: sqlite3.Connection) -> list[list[Any]]:
    return [
        [r[0], r[1], r[2], r[3], r[4]]
        for r in conn.execute("SELECT id, name, dong, lawd_cd, build_year FROM apartments ORDER BY id")
    ]


def build_meta(conn: sqlite3.Connection, today: date) -> dict[str, Any]:
    return {
        "data_updated_at": datetime.now(timezone.utc).isoformat(),
        "data_range": _date_range(conn),
        "apartment_count": _count(conn, "apartments"),
        "trade_count": _count(conn, "transactions"),
        "rent_count": _count(conn, "rents"),
    }


def export(
    conn: sqlite3.Connection, out_dir: str, *, apt_ids: list[int] | None, today: date
) -> list[str]:
    """JSON 을 out_dir/<key>.gz 로 쓰고 R2 키(.gz 제외) 목록을 돌려준다. apt_ids=None 이면 전 단지."""
    keys: list[str] = []

    def put(key: str, obj: Any) -> None:
        write_gz(os.path.join(out_dir, key + ".gz"), obj)
        keys.append(key)

    if apt_ids is None:
        ids = [r[0] for r in conn.execute("SELECT id FROM apartments ORDER BY id")]
    else:
        ids = sorted(set(apt_ids))
    codes = {r[0]: r[1] for r in conn.execute("SELECT id, lawd_cd FROM apartments")}
    ids = [i for i in ids if i in codes]
    affected = {codes[i] for i in ids}

    slim_by_code = _slim_all(conn, None if apt_ids is None else affected)
    for apt_id in ids:  # apartment_summary 는 내보내는 단지에만, 한 번씩
        s = apartment_summary(conn, apt_id, today)
        put(f"{PREFIX}/apt/{apt_id}/trade.json", build_apt_trade(conn, apt_id, today, s))
        put(f"{PREFIX}/apt/{apt_id}/rent.json", build_apt_rent(conn, apt_id, today, s))

    for code in REGIONS:
        if code in affected or (apt_ids is None):
            put(f"{PREFIX}/region/{code}.json", _region_doc(code, slim_by_code.get(code, [])))

    put(f"{PREFIX}/stats/summary.json", build_stats(conn, today))
    put(f"{PREFIX}/search/index.json", build_search_index(conn))
    put(f"{PREFIX}/meta.json", build_meta(conn, today))
    return keys


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m pipeline.export_json")
    p.add_argument("--db", required=True)
    p.add_argument("--out", required=True)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--changed", metavar="FILE", help="collect 가 쓴 변경 단지 id JSON 목록")
    g.add_argument("--all", action="store_true")
    p.add_argument("--today", metavar="YYYY-MM-DD")
    return p


def main(argv: list[str] | None = None) -> int:
    p = _build_parser()
    try:
        a = p.parse_args(argv)
        today = date.fromisoformat(a.today) if a.today else date.today()
    except SystemExit as e:
        return int(e.code or 0)
    except ValueError:
        print("--today 는 YYYY-MM-DD 형식이어야 합니다")
        return 2
    apt_ids: list[int] | None = None
    if a.changed:
        try:
            with open(a.changed, encoding="utf-8") as f:
                apt_ids = [int(i) for i in json.load(f)]
        except (OSError, ValueError, TypeError) as e:  # JSONDecodeError 는 ValueError
            print(f"--changed 파일을 읽을 수 없습니다: {e}", file=sys.stderr)
            return 2
    conn = connect(a.db)
    try:
        keys = export(conn, a.out, apt_ids=apt_ids, today=today)
    finally:
        conn.close()
    with open(os.path.join(a.out, "keys.json"), "w", encoding="utf-8") as f:
        json.dump(keys, f)
    print(f"{len(keys)}개 파일 -> {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
