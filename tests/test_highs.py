from __future__ import annotations

from datetime import date

import pytest

from pipeline.db import connect, migrate
from pipeline.highs import build_highs_recent, record_highs


def _tx(conn, apt_id, amount, area, deal, cancel=None, floor=7):
    conn.execute(
        "INSERT INTO transactions(apt_id, amount, area, floor, deal_date, unique_hash, is_canceled, cancel_date) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (apt_id, amount, area, floor, deal, f"{apt_id}-{amount}-{area}-{deal}-{cancel}",
         1 if cancel else 0, cancel),
    )


@pytest.fixture
def hconn(tmp_path):
    c = connect(str(tmp_path / "h.db"))
    migrate(c)
    c.execute("INSERT INTO apartments(name, lawd_cd, dong, jibun) VALUES ('래미안','11680','역삼동','1')")
    _tx(c, 1, 100000, 84.9, "2026-01-05")
    _tx(c, 1, 120000, 84.9, "2026-10-10")  # 신고가 (+20%)
    c.commit()
    return c


def test_record_highs_definition_and_keys(hconn):
    items = record_highs(hconn, since="2026-10-01")
    assert [(i["amount"], i["prev_max"], i["jump"], i["jump_pct"]) for i in items] == [(120000, 100000, 20000, 20.0)]
    it = items[0]
    assert it["area_group"] == 84 and it["city"] == "서울" and it["lawd_cd"] == "11680" and it["dong"] == "역삼동"
    assert set(it) == {
        "tx_id", "apt_id", "apt_name", "region_name", "city", "lawd_cd", "dong", "area", "area_group",
        "floor", "amount", "prev_max", "jump", "jump_pct", "deal_date", "supply",
    }


def test_jump_pct_rounds_one_decimal(hconn):
    _tx(hconn, 1, 130000, 84.9, "2026-10-20")  # 120000 -> 130000 = 8.333..
    hconn.commit()
    items = record_highs(hconn, since="2026-10-15")
    assert items[0]["jump_pct"] == 8.3


def test_equal_amount_not_a_high(hconn):
    _tx(hconn, 1, 120000, 84.9, "2026-10-20")
    hconn.commit()
    assert [i["deal_date"] for i in record_highs(hconn, since="2026-10-15")] == []


def test_no_previous_is_not_a_high(hconn):
    _tx(hconn, 1, 90000, 59.9, "2026-10-12")
    hconn.commit()
    # 이전 거래가 없는 59㎡ 거래는 빠지고 기존 84㎡ 신고가 하나만 남는다
    assert [(i["area_group"], i["amount"]) for i in record_highs(hconn, since="2026-10-01")] == [(84, 120000)]


def test_same_day_not_compared(hconn):
    _tx(hconn, 1, 150000, 84.9, "2026-10-10")  # 같은 날 더 비싼 거래
    hconn.commit()
    items = record_highs(hconn, since="2026-10-10")
    assert sorted(i["amount"] for i in items) == [120000, 150000]  # 둘 다 이전(1월) 100000 초과, 서로는 비교 안 함


def test_canceled_predecessor_ignored(hconn):
    _tx(hconn, 1, 200000, 84.9, "2026-09-01", "2026-09-10")  # 취소된 거래는 이전 최고가 아님
    hconn.commit()
    assert [i["prev_max"] for i in record_highs(hconn, since="2026-10-01")] == [100000]


def test_canceled_deal_itself_excluded(hconn):
    _tx(hconn, 1, 300000, 84.9, "2026-10-15", "2026-10-20")
    hconn.commit()
    assert [i["amount"] for i in record_highs(hconn, since="2026-10-01")] == [120000]


def test_since_filters_by_deal_date(hconn):
    assert record_highs(hconn, since="2026-10-10") != []
    assert record_highs(hconn, since="2026-10-11") == []


def test_ordering_newest_first(hconn):
    _tx(hconn, 1, 130000, 84.9, "2026-10-20")
    hconn.commit()
    assert [i["deal_date"] for i in record_highs(hconn, since="2026-10-01")] == ["2026-10-20", "2026-10-10"]


def test_build_highs_recent(hconn):
    doc = build_highs_recent(hconn, date(2026, 11, 4))
    assert doc["since"] == "2026-10-05"
    assert [i["amount"] for i in doc["items"]] == [120000]
    assert "generated_at" in doc


def test_highs_entry_supply_range(hconn):
    _tx(hconn, 1, 130000, 84.5, "2026-10-20")
    for excl, sup in ((84.8, 111.52), (84.88, 112.9)):
        hconn.execute("INSERT INTO apartment_area_types VALUES (1,?,?,'register',0,5,'x')", (excl, sup))
    hconn.commit()
    items = record_highs(hconn, since="2026-10-15")
    assert items[0]["supply"] == {"min": 33, "max": 34, "approx": False}
    hconn.execute("UPDATE apartment_area_types SET approx=1 WHERE excl_area=84.88")
    hconn.commit()
    assert record_highs(hconn, since="2026-10-15")[0]["supply"]["approx"] is True


def test_highs_entry_supply_null_when_unknown(hconn):
    assert record_highs(hconn, since="2026-10-01")[0]["supply"] is None


def test_boundary_areas_same_group(tmp_path):
    c = connect(str(tmp_path / "b.db"))
    migrate(c)
    c.execute("INSERT INTO apartments(name, lawd_cd, dong, jibun) VALUES ('B','11680','역삼동','9')")
    _tx(c, 1, 90000, 85.01, "2026-05-01")
    _tx(c, 1, 100000, 84.97, "2026-10-10")
    c.commit()
    items = record_highs(c, since="2026-10-01")
    assert len(items) == 1
    assert items[0]["area_group"] == 84 and items[0]["prev_max"] == 90000
