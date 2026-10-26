from __future__ import annotations

import argparse
import gzip
import json
import os
import sqlite3
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
    with gzip.open(path, "wt", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))


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
        "apartments": sorted(entries, key=lambda e: -e["trade_count"]),
    }


def build_region(conn: sqlite3.Connection, lawd_cd: str, today: date) -> dict[str, Any]:
    ids = [r[0] for r in conn.execute("SELECT id FROM apartments WHERE lawd_cd = ? ORDER BY id", (lawd_cd,))]
    return _region_doc(lawd_cd, [_slim(apartment_summary(conn, i, today)) for i in ids])


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

    slim_by_code: dict[str, list[dict[str, Any]]] = {}
    done: set[int] = set()
    for apt_id in ids:  # 단지당 apartment_summary 는 한 번만
        s = apartment_summary(conn, apt_id, today)
        put(f"{PREFIX}/apt/{apt_id}/trade.json", build_apt_trade(conn, apt_id, today, s))
        put(f"{PREFIX}/apt/{apt_id}/rent.json", build_apt_rent(conn, apt_id, today, s))
        slim_by_code.setdefault(s["lawd_cd"], []).append(_slim(s))
        done.add(apt_id)

    for apt_id, code in codes.items():  # 영향받은 지역의 나머지 단지
        if code in affected and apt_id not in done:
            slim_by_code[code].append(_slim(apartment_summary(conn, apt_id, today)))

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
        with open(a.changed, encoding="utf-8") as f:
            apt_ids = [int(i) for i in json.load(f)]
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
