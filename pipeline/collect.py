from __future__ import annotations

import argparse
import json
import re
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
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


KST = timezone(timedelta(hours=9))


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def kst_today(now: datetime | None = None) -> date:
    """한국 날짜. Actions 러너는 UTC 라 KST 자정~09시에는 날짜(월)가 하루 늦다."""
    return (now or _utcnow()).astimezone(KST).date()


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
                    saved = _save(conn, kind, items)
                    conn.commit()  # (지역, 월, 종류) 배치 단위 커밋
                except MolitError as e:
                    res.failed.append((code, ym, e.reason))
                    log(f"  {name}: FAILED - {e.reason}")
                    time.sleep(delay)
                    continue
                except Exception as e:  # noqa: BLE001 — 한 배치의 예상 못 한 오류로 전체 수집을 멈추지 않는다
                    conn.rollback()
                    reason = f"unexpected: {type(e).__name__}: {e}"
                    res.failed.append((code, ym, reason))
                    log(f"  {name}: FAILED - {reason}")
                    time.sleep(delay)
                    continue
                skipped = getattr(items, "skipped", 0)
                if skipped:
                    log(f"  {name}: 형식 오류 {skipped}건 건너뜀")
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
    p.add_argument("--kind", choices=["trade", "rent", "both"],
                   help="기본 both (--retry-failed 는 요약 파일의 kind)")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--months", help="쉼표 구분 YYYYMM 목록")
    g.add_argument("--from", dest="from_", metavar="YYYYMM")
    g.add_argument("--daily", action="store_true", help="이번 달 + 지난 달")
    g.add_argument("--retry-failed", metavar="SUMMARY",
                   help="이전 --summary-out JSON 의 실패 (지역, 월) 쌍만 다시 수집")
    p.add_argument("--to", metavar="YYYYMM")
    p.add_argument("--regions", help="쉼표 구분 시군구 코드 (REGIONS 부분집합만 수집)")
    p.add_argument("--changed-out", default="changed_apts.json")
    p.add_argument("--summary-out", metavar="FILE",
                   help="{kind, saved, failed_count, failed:[[code, ym, reason]]} 요약 JSON 을 쓸 파일")
    p.add_argument("--delay", type=float, default=0.5)
    return p


def _load_retry(p: argparse.ArgumentParser, path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        data["failed"] = [(str(c), str(ym)) for c, ym, *_ in data["failed"]]
    except (OSError, ValueError, KeyError, TypeError) as e:
        p.error(f"--retry-failed 요약 파일을 읽을 수 없습니다: {path} ({e})")
    return data


def _resolve_months(p: argparse.ArgumentParser, a: argparse.Namespace) -> list[str]:
    if a.retry_failed:
        return sorted({ym for _, ym in a.retry["failed"]})
    if a.daily:
        months = current_and_previous_month(kst_today())
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


def _resolve_regions(p: argparse.ArgumentParser, a: argparse.Namespace) -> dict[str, str]:
    if a.retry_failed:
        codes = sorted({c for c, _ in a.retry["failed"]})
        unknown = [c for c in codes if c not in REGIONS]
        if unknown:
            p.error(f"알 수 없는 지역 코드: {','.join(unknown)}")
        return {c: REGIONS[c] for c in codes}
    if not a.regions:
        return REGIONS
    codes = [c.strip() for c in a.regions.split(",") if c.strip()]
    unknown = [c for c in codes if c not in REGIONS]
    if not codes or unknown:
        p.error(f"알 수 없는 지역 코드: {','.join(unknown) or a.regions}")
    return {c: REGIONS[c] for c in codes}


def main(argv: list[str] | None = None) -> int:
    p = _build_parser()
    try:
        a = p.parse_args(argv)
        if a.retry_failed:
            a.retry = _load_retry(p, a.retry_failed)
            a.kind = a.kind or a.retry.get("kind") or "both"
        a.kind = a.kind or "both"
        months = _resolve_months(p, a)
        regions = _resolve_regions(p, a)
    except SystemExit as e:
        return int(e.code or 0)
    kinds = {"trade", "rent"} if a.kind == "both" else {a.kind}

    def stamped(line: str) -> None:
        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {line}", flush=True)

    conn = connect(a.db)
    try:
        common = dict(kinds=kinds, fetch_trades=fetch_trades, fetch_rents=fetch_rents,
                      delay=a.delay, log=stamped)
        if a.retry_failed:  # 월별로 묶어 정확히 실패한 (지역, 월)만 재수집
            res = CollectResult()
            for ym in months:
                subset = {c: regions[c] for c, m in a.retry["failed"] if m == ym}
                r = collect(conn, months=[ym], regions=subset, **common)
                res.fetched += r.fetched
                res.saved += r.saved
                res.failed += r.failed
        else:
            res = collect(conn, months=months, regions=regions, **common)
        changed = pop_changed(conn)
    finally:
        conn.close()
    with open(a.changed_out, "w", encoding="utf-8") as f:
        json.dump(changed, f)
    if a.summary_out:
        with open(a.summary_out, "w", encoding="utf-8") as f:
            json.dump({"kind": a.kind, "saved": res.saved, "failed_count": len(res.failed),
                       "failed": [list(x) for x in res.failed]}, f, ensure_ascii=False)
    print(f"변경 단지 {len(changed)}개 -> {a.changed_out}")
    if res.failed:
        print(f"실패 {len(res.failed)}건 (lawd_cd, deal_ymd, reason):")
        for item in res.failed:
            print(f"  {item}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
