from __future__ import annotations

import sqlite3
from datetime import date, datetime, timedelta, timezone
from typing import Any

_LEGACY_GLOB = "[0-9][0-9].[0-9][0-9].[0-9][0-9]"


def normalize_cancel_date(v: str | None) -> str | None:
    """해제일을 ISO(YYYY-MM-DD)로. 'YY.MM.DD' 는 20YY 로 해석, ISO 는 그대로, 빈 값은 None."""
    if not v:
        return None
    v = v.strip()
    if not v:
        return None
    if len(v) == 8 and v[2] == "." and v[5] == ".":
        return f"20{v[0:2]}-{v[3:5]}-{v[6:8]}"
    return v


def normalize_cancel_dates(conn: sqlite3.Connection) -> int:
    """레거시 해제일 형식을 ISO 로 바꾸고 is_canceled 를 cancel_date 에 맞춘다 (멱등).

    반환값은 형식을 바꾼 행 수. 플래그만 어긋난 행도 고치며, 바뀐 행의 단지는 mark_changed 로 올린다.
    """
    from pipeline.db import mark_changed  # 순환 import 회피

    legacy = conn.execute(
        "SELECT id, apt_id, cancel_date FROM transactions WHERE cancel_date GLOB ?", (_LEGACY_GLOB,)
    ).fetchall()
    conn.executemany(
        "UPDATE transactions SET cancel_date=? WHERE id=?",
        [(normalize_cancel_date(r[2]), r[0]) for r in legacy],
    )
    mismatched = conn.execute(
        "SELECT id, apt_id FROM transactions "
        "WHERE COALESCE(is_canceled, 0) != (cancel_date IS NOT NULL)"
    ).fetchall()
    conn.execute(
        "UPDATE transactions SET is_canceled = (cancel_date IS NOT NULL) "
        "WHERE COALESCE(is_canceled, 0) != (cancel_date IS NOT NULL)"
    )
    apt_ids = {r[1] for r in legacy if r[1] is not None} | {r[1] for r in mismatched if r[1] is not None}
    if apt_ids:
        mark_changed(conn, apt_ids)
    conn.commit()
    return len(legacy)


def canceled_highs(conn: sqlite3.Connection, since: str, until: str | None = None) -> list[dict[str, Any]]:
    """해제일이 [since, until] 인 취소 거래 중, 같은 단지·평형의 이전(계약일 엄격히 앞선) 정상 거래 최고가를 넘는 것.

    is_canceled 는 믿지 않고 cancel_date 로 판단한다. 해제일 내림차순, 동률은 jump 큰 순.
    """
    from pipeline.export_json import _region_name  # 순환 import 회피
    from pipeline.regions import city_of

    sql = (
        "SELECT t.id, t.apt_id, a.name, a.lawd_cd, t.area, CAST(t.area AS INTEGER) AS grp, t.floor, "
        "t.amount, t.deal_date, t.cancel_date FROM transactions t JOIN apartments a ON a.id = t.apt_id "
        "WHERE t.cancel_date >= ?"
    )
    args: list[Any] = [since]
    if until is not None:
        sql += " AND t.cancel_date <= ?"
        args.append(until)
    rows = conn.execute(sql, args).fetchall()
    region_cache: dict[str, str] = {}
    items: list[dict[str, Any]] = []
    for r in rows:
        prev = conn.execute(
            "SELECT MAX(amount) FROM transactions WHERE apt_id = ? AND CAST(area AS INTEGER) = ? "
            "AND deal_date < ? AND cancel_date IS NULL",
            (r["apt_id"], r["grp"], r["deal_date"]),
        ).fetchone()[0]
        if prev is None or r["amount"] <= prev:
            continue
        code = r["lawd_cd"]
        if code not in region_cache:
            region_cache[code] = _region_name(conn, code)
        days = (date.fromisoformat(r["cancel_date"]) - date.fromisoformat(r["deal_date"])).days
        items.append({
            "tx_id": r["id"], "apt_id": r["apt_id"], "apt_name": r["name"],
            "region_name": region_cache[code], "city": city_of(code),
            "area": r["area"], "area_group": r["grp"], "floor": r["floor"],
            "amount": r["amount"], "prev_max": prev, "jump": r["amount"] - prev,
            "deal_date": r["deal_date"], "cancel_date": r["cancel_date"], "days_to_cancel": days,
        })
    items.sort(key=lambda i: (i["cancel_date"], i["jump"]), reverse=True)
    return items


def build_canceled_recent(conn: sqlite3.Connection, today: date) -> dict[str, Any]:
    since = (today - timedelta(days=30)).isoformat()
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "since": since,
        "items": canceled_highs(conn, since),
    }
