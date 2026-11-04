from __future__ import annotations

import gzip
import json
from datetime import date

import pytest

from pipeline.canceled import canceled_highs, normalize_cancel_date, normalize_cancel_dates
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


def _tx(conn, apt_id, amount, area, deal, cancel=None, floor=7):
    conn.execute(
        "INSERT INTO transactions(apt_id, amount, area, floor, deal_date, unique_hash, is_canceled, cancel_date) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (apt_id, amount, area, floor, deal, f"{apt_id}-{amount}-{area}-{deal}-{cancel}",
         1 if cancel else 0, cancel),
    )


@pytest.fixture
def cconn(tmp_path):
    c = connect(str(tmp_path / "c.db"))
    migrate(c)
    c.execute("INSERT INTO apartments(name, lawd_cd, dong, jibun) VALUES ('래미안','11680','역삼동','1')")
    _tx(c, 1, 100000, 84.9, "2026-01-05")
    _tx(c, 1, 120000, 84.9, "2026-02-01", "2026-02-20")
    _tx(c, 1, 110000, 84.9, "2026-03-01")
    _tx(c, 1, 110000, 84.9, "2026-04-01", "2026-04-10")  # 같은 금액 -> 아님
    _tx(c, 1, 90000, 59.9, "2026-04-02", "2026-04-11")  # 이전 거래 없음 -> 아님
    c.commit()
    return c


def test_canceled_highs_definition(cconn):
    items = canceled_highs(cconn, since="2026-01-01")
    assert [(i["amount"], i["prev_max"], i["jump"]) for i in items] == [(120000, 100000, 20000)]
    assert items[0]["days_to_cancel"] == 19
    assert items[0]["area_group"] == 84 and items[0]["city"] == "서울"
    assert set(items[0]) == {
        "tx_id", "apt_id", "apt_name", "region_name", "city", "area", "area_group", "floor",
        "amount", "prev_max", "jump", "deal_date", "cancel_date", "days_to_cancel",
    }


def test_same_day_earlier_deal_not_compared(cconn):
    _tx(cconn, 1, 130000, 84.9, "2026-05-01")
    _tx(cconn, 1, 125000, 84.9, "2026-05-01", "2026-05-09")
    cconn.commit()
    items = canceled_highs(cconn, since="2026-05-01")
    assert [(i["amount"], i["prev_max"]) for i in items] == [(125000, 110000)]


def test_since_filters_by_cancel_date(cconn):
    assert canceled_highs(cconn, since="2026-03-01") == []
    assert canceled_highs(cconn, since="2026-01-01", until="2026-02-19") == []


def test_ordering_and_trusts_cancel_date_not_flag(cconn):
    _tx(cconn, 1, 150000, 84.9, "2026-05-01", "2026-02-20")  # 같은 해제일, jump 더 큼
    cconn.execute("UPDATE transactions SET is_canceled=0")  # 플래그는 무시
    cconn.commit()
    items = canceled_highs(cconn, since="2026-01-01")
    assert [i["amount"] for i in items] == [150000, 120000]


def test_only_canceled_predecessor_is_not_a_high(tmp_path):
    c = connect(str(tmp_path / "o.db"))
    migrate(c)
    c.execute("INSERT INTO apartments(name, lawd_cd, dong, jibun) VALUES ('래미안','11680','역삼동','1')")
    _tx(c, 1, 100000, 84.9, "2026-01-05", "2026-01-20")  # 취소된 거래만 앞에 있음
    _tx(c, 1, 120000, 84.9, "2026-02-01", "2026-02-20")
    c.commit()
    assert canceled_highs(c, since="2026-01-01") == []
