from __future__ import annotations

import sqlite3
from bisect import bisect_left
from datetime import date, datetime, timedelta, timezone
from itertools import accumulate
from typing import Any


def record_highs(conn: sqlite3.Connection, since: str) -> list[dict[str, Any]]:
    """계약일이 since 이후인 정상(취소 아닌) 거래 중, 같은 단지·평형의 이전(계약일 엄격히 앞선) 정상 거래 최고가를 넘는 것.

    최근 거래만 먼저 고르고, 거기 나온 단지마다 정상 거래를 idx_transactions_apt_date 로 한 번만 읽어
    (평형 묶음별 계약일 정렬 + 누적 최고가) 이전 최고가를 구한다. 행마다 조회하면 큰 단지에서 수십 배 느리다
    (실DB 5백만 건 실측: 행별 조회 ~80초 → 단지별 일괄·apt_id 순 읽기 ~10초). 계약일 내림차순, 동률은 jump 큰 순.
    """
    from pipeline.export_json import _region_name  # 순환 import 회피
    from pipeline.regions import city_of

    rows = conn.execute(
        "SELECT t.id, t.apt_id, a.name, a.lawd_cd, a.dong, t.area, t.floor, "
        "t.amount, t.deal_date FROM transactions t JOIN apartments a ON a.id = t.apt_id "
        "WHERE t.deal_date >= ? AND t.cancel_date IS NULL",
        (since,),
    ).fetchall()
    by_apt: dict[int, list[sqlite3.Row]] = {}
    for r in rows:
        by_apt.setdefault(r["apt_id"], []).append(r)
    from pipeline.area_class import all_area_classes, class_of
    from pipeline.supply import load_area_types, supply_label

    types = load_area_types(conn, set(by_apt))
    class_maps = all_area_classes(conn, by_apt)
    region_cache: dict[str, str] = {}
    items: list[dict[str, Any]] = []
    for apt_id in sorted(by_apt):  # apt_id 순: 인덱스·페이지를 순서대로 읽어 디스크 임의 접근을 피한다
        recent = by_apt[apt_id]
        classes = class_maps.get(apt_id, {})
        # 평형 묶음 -> (계약일 정렬 목록, 같은 순서의 누적 최고가)
        groups: dict[int, tuple[list[str], list[int]]] = {}
        per_group: dict[int, list[tuple[str, int]]] = {}
        for area, d, amt in conn.execute(
            "SELECT area, deal_date, amount FROM transactions "
            "WHERE apt_id = ? AND cancel_date IS NULL",
            (apt_id,),
        ):
            per_group.setdefault(class_of(classes, area), []).append((d, amt))
        for g, lst in per_group.items():
            lst.sort()
            groups[g] = ([d for d, _ in lst], list(accumulate((a for _, a in lst), max)))
        for r in recent:
            grp = class_of(classes, r["area"])
            dates, cummax = groups[grp]
            i = bisect_left(dates, r["deal_date"])  # 계약일이 엄격히 앞선 거래 i개
            if i == 0:
                continue
            prev = cummax[i - 1]
            if r["amount"] <= prev:
                continue
            code = r["lawd_cd"]
            if code not in region_cache:
                region_cache[code] = _region_name(conn, code)
            items.append({
                "tx_id": r["id"], "apt_id": apt_id, "apt_name": r["name"],
                "region_name": region_cache[code], "city": city_of(code), "lawd_cd": code, "dong": r["dong"],
                "area": r["area"], "area_group": grp, "floor": r["floor"],
                "amount": r["amount"], "prev_max": prev, "jump": r["amount"] - prev,
                "jump_pct": round((r["amount"] - prev) / prev * 100, 1), "deal_date": r["deal_date"],
                "supply": supply_label(types.get(apt_id, []), r["area"]),
            })
    items.sort(key=lambda i: (i["deal_date"], i["jump"]), reverse=True)
    return items


def build_highs_recent(conn: sqlite3.Connection, today: date) -> dict[str, Any]:
    since = (today - timedelta(days=30)).isoformat()
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "since": since,
        "items": record_highs(conn, since),
    }
