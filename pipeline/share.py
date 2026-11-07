"""거래별 공유 판정: 신고가/상승 배지, 비교 기준 금액, 공유 가능 여부.

스펙 docs/superpowers/specs/2026-11-07-share-content-design.md 4장. 카드·목록·리포트의 숫자는 여기 한 곳에서 만들고
프런트는 다시 계산하지 않는다. 같은 평형 묶음(pipeline.area_class)·취소 아닌 매매끼리만 비교한다.

- 대상: 계약일이 today - 30일 이후, 취소 아님.
- high: 계약일이 엄격히 앞선 거래가 있고 금액 > 그 최고가. base = 그 최고가.
- up: high 가 아니고 계약일이 엄격히 앞선 거래 중 가장 최근 거래(그날 여러 건이면 id 가 가장 큰 것)보다 비쌈.
- held(정정 의심): 같은 묶음·층·계약일에 금액이 다른 정상 거래가 있음.
- shareable: held 가 아니고, up 이거나 지금도 묶음 정상 거래 최고가(신고가는 현재 최고가일 때만).
같은 계약일 거래끼리는 서로 비교하지 않는다(첫날 거래끼리 신고가가 되지 않는다).
"""
from __future__ import annotations

import sqlite3
from bisect import bisect_left
from datetime import date, timedelta
from itertools import accumulate
from typing import Literal, TypedDict

from pipeline.area_class import apt_area_classes, class_of

SHARE_DAYS = 30


class ShareRow(TypedDict):
    id: int
    area: float
    floor: int | None
    amount: int
    deal_date: str
    cancel_date: str | None
    dealing_gbn: str | None


class ShareInfo(TypedDict):
    badge: Literal["high", "up"]
    base: int
    diff: int
    pct: float
    shareable: bool
    held: bool


def share_since(today: date) -> str:
    return (today - timedelta(days=SHARE_DAYS)).isoformat()


def share_info(rows: list[ShareRow], classes: dict[float, int], today: date) -> dict[int, ShareInfo]:
    """배지가 붙는 거래만 {거래 id: ShareInfo} 로 돌려준다."""
    since = share_since(today)
    groups: dict[int, list[ShareRow]] = {}
    amounts_at: dict[tuple[int, int | None, str], set[int]] = {}
    for r in rows:
        if r["cancel_date"] is not None:
            continue
        g = class_of(classes, r["area"])
        groups.setdefault(g, []).append(r)
        amounts_at.setdefault((g, r["floor"], r["deal_date"]), set()).add(r["amount"])
    out: dict[int, ShareInfo] = {}
    for g, deals in groups.items():
        deals.sort(key=lambda r: (r["deal_date"], r["id"]))
        dates = [r["deal_date"] for r in deals]
        cummax = list(accumulate((r["amount"] for r in deals), max))
        top = cummax[-1]
        for r in deals:
            if r["deal_date"] < since:
                continue
            i = bisect_left(dates, r["deal_date"])  # 계약일이 엄격히 앞선 거래 i개
            if i == 0:
                continue
            amount = r["amount"]
            if amount > cummax[i - 1]:
                badge, base = "high", cummax[i - 1]
            elif amount > deals[i - 1]["amount"]:  # (계약일, id) 정렬이라 i-1 이 가장 최근·id 최대
                badge, base = "up", deals[i - 1]["amount"]
            else:
                continue
            held = len(amounts_at[(g, r["floor"], r["deal_date"])]) > 1
            diff = amount - base
            out[r["id"]] = {
                "badge": badge, "base": base, "diff": diff, "pct": round(diff / base * 100, 1),
                "shareable": not held and (badge == "up" or amount >= top),
                "held": held,
            }
    return out


def apt_share_info(
    conn: sqlite3.Connection, apt_id: int, today: date, classes: dict[float, int] | None = None
) -> dict[int, ShareInfo]:
    if classes is None:
        classes = apt_area_classes(conn, apt_id)
    rows = conn.execute(
        "SELECT id, area, floor, amount, deal_date, cancel_date, dealing_gbn FROM transactions "
        "WHERE apt_id = ? AND cancel_date IS NULL",
        (apt_id,),
    ).fetchall()
    return share_info([dict(r) for r in rows], classes, today)  # type: ignore[misc]
