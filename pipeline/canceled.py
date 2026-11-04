from __future__ import annotations

import sqlite3

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
