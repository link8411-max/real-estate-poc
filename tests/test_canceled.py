from __future__ import annotations

from pipeline.canceled import normalize_cancel_date, normalize_cancel_dates
from pipeline.db import connect, migrate, pop_changed


def test_normalize_cancel_date():
    assert normalize_cancel_date("25.07.28") == "2025-07-28"
    assert normalize_cancel_date("2025-07-28") == "2025-07-28"
    assert normalize_cancel_date(None) is None
    assert normalize_cancel_date("") is None


def test_migrate_normalizes_and_is_idempotent(tmp_path):
    conn = connect(str(tmp_path / "t.db"))
    migrate(conn)
    apt_id = conn.execute(
        "INSERT INTO apartments(name, lawd_cd, dong, jibun) VALUES ('래미안','11680','역삼동','1')"
    ).lastrowid
    for h, cd in [("a", "25.07.28"), ("b", "2026-09-02"), ("c", None)]:
        conn.execute(
            "INSERT INTO transactions(apt_id, amount, area, floor, deal_date, unique_hash, "
            "is_canceled, cancel_date) VALUES (?,?,?,?,?,?,0,?)",
            (apt_id, 100000, 84.9, 5, "2025-07-01", h, cd),
        )
    conn.commit()
    pop_changed(conn)
    assert normalize_cancel_dates(conn) == 1
    rows = conn.execute("SELECT cancel_date, is_canceled FROM transactions ORDER BY id").fetchall()
    assert [tuple(r) for r in rows] == [("2025-07-28", 1), ("2026-09-02", 1), (None, 0)]
    assert pop_changed(conn) == [apt_id]
    assert normalize_cancel_dates(conn) == 0
    assert pop_changed(conn) == []
