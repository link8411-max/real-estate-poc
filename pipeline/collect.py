from __future__ import annotations

import argparse
import json
import re
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Callable

from pipeline.db import connect, insert_rent, insert_trade, migrate, pop_changed, upsert_apartment
from pipeline.molit_client import MolitError, fetch_rents, fetch_trades
from pipeline.regions import REGIONS

_YM = re.compile(r"^\d{4}(0[1-9]|1[0-2])$")


@dataclass
class CollectResult:
    fetched: int = 0
    saved: int = 0
    failed: list[tuple[str, str, str]] = field(default_factory=list)


def month_range(start: str, end: str) -> list[str]:
    """YYYYMM 두 개 사이(양끝 포함)의 월 목록."""
    y, m = int(start[:4]), int(start[4:])
    ey, em = int(end[:4]), int(end[4:])
    out: list[str] = []
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def current_and_previous_month(today: date) -> list[str]:
    prev = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
    return [f"{prev[0]:04d}{prev[1]:02d}", f"{today.year:04d}{today.month:02d}"]


def _save(conn: sqlite3.Connection, kind: str, items: list) -> int:
    insert = insert_trade if kind == "trade" else insert_rent
    saved = 0
    for it in items:
        apt_id = upsert_apartment(
            conn, name=it.apt_name, lawd_cd=it.lawd_cd, dong=it.dong, jibun=it.jibun,
            build_year=it.build_year, apt_seq=it.apt_seq,
        )
        if insert(conn, apt_id, it):
            saved += 1
    return saved


def collect(
    conn: sqlite3.Connection,
    *,
    kinds: set[str],
    months: list[str],
    regions: dict[str, str] = REGIONS,
    fetch_trades: Callable = fetch_trades,
    fetch_rents: Callable = fetch_rents,
    delay: float = 0.5,
    log: Callable[[str], None] = print,
) -> CollectResult:
    migrate(conn)
    fetchers = {"trade": fetch_trades, "rent": fetch_rents}
    res = CollectResult()
    log(f"=== 수집 시작 === kinds={','.join(sorted(kinds))} months={','.join(months)}")
    for ym in months:
        for kind in sorted(kinds):
            log(f"--- {ym} {kind} ---")
            for code, name in regions.items():
                try:
                    items = fetchers[kind](code, ym)
                except MolitError as e:
                    res.failed.append((code, ym, e.reason))
                    log(f"  {name}: FAILED - {e.reason}")
                    time.sleep(delay)
                    continue
                saved = _save(conn, kind, items)
                conn.commit()  # (지역, 월, 종류) 배치 단위 커밋
                res.fetched += len(items)
                res.saved += saved
                if saved > 0 or not items:
                    log(f"  {name}: +{saved}건 (전체 {len(items)}건 중 신규)")
                time.sleep(delay)
    log(
        f"=== 수집 완료 === 총 조회: {res.fetched}건, 신규 저장: {res.saved}건, "
        f"실패: {len(res.failed)}개"
    )
    return res


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m pipeline.collect")
    p.add_argument("--db", default="real_estate.db")
    p.add_argument("--kind", choices=["trade", "rent", "both"], default="both")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--months", help="쉼표 구분 YYYYMM 목록")
    g.add_argument("--from", dest="from_", metavar="YYYYMM")
    g.add_argument("--daily", action="store_true", help="이번 달 + 지난 달")
    p.add_argument("--to", metavar="YYYYMM")
    p.add_argument("--changed-out", default="changed_apts.json")
    p.add_argument("--delay", type=float, default=0.5)
    return p


def _resolve_months(p: argparse.ArgumentParser, a: argparse.Namespace) -> list[str]:
    if a.daily:
        months = current_and_previous_month(date.today())
    elif a.months:
        months = [m.strip() for m in a.months.split(",")]
    else:
        if not a.to:
            p.error("--from 은 --to 와 함께 써야 합니다")
        for v in (a.from_, a.to):
            if not _YM.match(v):
                p.error(f"YYYYMM 형식이 아닙니다: {v}")
        if a.from_ > a.to:
            p.error("--from 이 --to 보다 늦습니다")
        months = month_range(a.from_, a.to)
    if a.to and not a.from_:
        p.error("--to 는 --from 과 함께 써야 합니다")
    for m in months:
        if not _YM.match(m):
            p.error(f"YYYYMM 형식이 아닙니다: {m}")
    return months


def main(argv: list[str] | None = None) -> int:
    p = _build_parser()
    try:
        a = p.parse_args(argv)
        months = _resolve_months(p, a)
    except SystemExit as e:
        return int(e.code or 0)
    kinds = {"trade", "rent"} if a.kind == "both" else {a.kind}

    def stamped(line: str) -> None:
        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {line}", flush=True)

    conn = connect(a.db)
    try:
        res = collect(
            conn, kinds=kinds, months=months, regions=REGIONS,
            fetch_trades=fetch_trades, fetch_rents=fetch_rents, delay=a.delay, log=stamped,
        )
        changed = pop_changed(conn)
    finally:
        conn.close()
    with open(a.changed_out, "w", encoding="utf-8") as f:
        json.dump(changed, f)
    print(f"변경 단지 {len(changed)}개 -> {a.changed_out}")
    if res.failed:
        print(f"실패 {len(res.failed)}건 (lawd_cd, deal_ymd, reason):")
        for item in res.failed:
            print(f"  {item}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
