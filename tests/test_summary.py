from __future__ import annotations

from datetime import date

import pytest

from pipeline.db import connect, migrate, upsert_apartment
from pipeline.summary import apartment_summary, metrics, rent_area_stats, trade_area_stats

TODAY = date(2026, 10, 26)


def _trade(conn, apt_id, amount, area, deal_date, cancel_date=None):
    conn.execute(
        "INSERT INTO transactions(apt_id, amount, area, floor, deal_date, unique_hash, is_canceled, cancel_date) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (apt_id, amount, area, 5, deal_date, f"t{apt_id}-{amount}-{area}-{deal_date}",
         1 if cancel_date else 0, cancel_date),
    )


def _rent(conn, apt_id, deposit, monthly, area, deal_date):
    conn.execute(
        "INSERT INTO rents(apt_id, deposit, monthly_rent, area, floor, deal_date, unique_hash) "
        "VALUES (?,?,?,?,?,?,?)",
        (apt_id, deposit, monthly, area, 5, deal_date, f"r{apt_id}-{deposit}-{monthly}-{deal_date}"),
    )


@pytest.fixture
def conn(tmp_path):
    c = connect(str(tmp_path / "t.db"))
    migrate(c)
    yield c
    c.close()


@pytest.fixture
def apt_id(conn):
    i = upsert_apartment(conn, name="래미안", lawd_cd="11440", dong="아현동", jibun="1",
                         build_year=2010, apt_seq="A1")
    conn.execute("UPDATE apartments SET latitude=37.55, longitude=126.95 WHERE id=?", (i,))
    _trade(conn, i, 100000, 84.42, "2024-05-01")            # 전고점
    _trade(conn, i, 90000, 83.6, "2025-03-10")
    _trade(conn, i, 88000, 84.0, "2026-08-10")              # 최근 3개월
    _trade(conn, i, 92000, 84.0, "2026-09-15")              # 최근 3개월, 최신 유효
    _trade(conn, i, 80000, 84.0, "2026-10-01", "2026-10-05")  # 취소
    _trade(conn, i, 60000, 59.4, "2026-06-01")
    _rent(conn, i, 50000, 0, 84.0, "2026-09-01")
    _rent(conn, i, 54000, 0, 84.0, "2026-10-10")
    _rent(conn, i, 10000, 100, 84.0, "2026-10-20")
    conn.commit()
    return i


@pytest.fixture
def rent_only_id(conn):
    i = upsert_apartment(conn, name="월세빌", lawd_cd="11440", dong="합정동", jibun="2",
                         build_year=2005, apt_seq="A2")
    _rent(conn, i, 30000, 0, 59.0, "2026-10-01")
    conn.commit()
    return i


def test_trade_area_stats_excludes_cancelled_and_groups_by_rounded_area(conn, apt_id):
    stats = trade_area_stats(conn, apt_id, TODAY)
    assert [s["area"] for s in stats] == [59, 84]
    s84 = stats[1]
    assert s84["count"] == 4 and s84["recent_count"] == 2
    assert s84["latest_amount"] == 92000 and s84["latest_date"] == "2026-09-15"
    assert s84["max_amount"] == 100000 and s84["min_amount"] == 88000
    assert s84["avg_amount"] == 92500
    assert s84["recent_avg"] == 90000
    assert s84["peak_date"] == "2024-05-01"
    s59 = stats[0]
    assert s59["count"] == 1 and s59["recent_count"] == 0 and s59["recent_avg"] is None


def test_recent_window_is_inclusive_90_days(conn, apt_id):
    _trade(conn, apt_id, 70000, 59.0, "2026-07-28")  # 정확히 today-90일
    _trade(conn, apt_id, 71000, 59.0, "2026-07-27")  # 하루 밖
    s59 = trade_area_stats(conn, apt_id, TODAY)[0]
    assert s59["recent_count"] == 1 and s59["recent_avg"] == 70000


def test_metrics_without_three_recent_trades_has_no_bargain(conn, apt_id):
    m = metrics(trade_area_stats(conn, apt_id, TODAY), rent_area_stats(conn, apt_id, TODAY), TODAY)
    assert "bargain_amount" not in m and "bargain_percent" not in m
    assert m["recovery_rate"] == 92.0
    assert m["peak_date"] == "2024-05-01"
    assert m["days_since_last_tx"] == 41


def test_metrics_bargain_requires_three_recent_trades(conn, apt_id):
    _trade(conn, apt_id, 85000, 84.0, "2026-10-10")
    m = metrics(trade_area_stats(conn, apt_id, TODAY), rent_area_stats(conn, apt_id, TODAY), TODAY)
    # recent_avg = round((88000+92000+85000)/3) = 88333
    assert m["bargain_amount"] == 85000 - 88333
    assert m["bargain_percent"] == -3.8
    assert m["recovery_rate"] == 85.0
    assert m["days_since_last_tx"] == 16


def test_rent_area_stats_splits_jeonse_and_wolse(conn, apt_id):
    (r,) = rent_area_stats(conn, apt_id, TODAY)
    assert r["area"] == 84 and r["jeonse_count"] == 2 and r["wolse_count"] == 1
    assert r["recent_jeonse_avg"] == 52000
    assert (r["latest_deposit"], r["latest_monthly_rent"], r["latest_date"]) == (10000, 100, "2026-10-20")


def test_jeonse_ratio_uses_same_area(conn, apt_id):
    m = metrics(trade_area_stats(conn, apt_id, TODAY), rent_area_stats(conn, apt_id, TODAY), TODAY)
    assert m["jeonse_ratio"] == 57.8  # 52000 / 90000


def test_jeonse_ratio_absent_when_other_area_only(conn, apt_id):
    conn.execute("DELETE FROM rents WHERE area=84.0")
    _rent(conn, apt_id, 40000, 0, 59.0, "2026-10-01")
    m = metrics(trade_area_stats(conn, apt_id, TODAY), rent_area_stats(conn, apt_id, TODAY), TODAY)
    assert "jeonse_ratio" not in m


def test_apartment_summary_keys_and_values(conn, apt_id):
    row = apartment_summary(conn, apt_id, TODAY)
    assert set(row) == {
        "id", "name", "lawd_cd", "city", "dong", "jibun", "build_year", "apt_seq", "lat", "lng",
        "latest_trade_amount", "latest_trade_date", "latest_trade_area", "latest_jeonse_deposit",
        "latest_jeonse_date", "trade_count", "rent_count", "recent_avg", "peak_amount",
        "jeonse_ratio", "area_stats", "rent_area_stats", "metrics", "updated_at",
    }
    assert row["city"] == "서울" and row["lat"] == 37.55 and row["lng"] == 126.95
    assert row["latest_trade_amount"] == 92000 and row["latest_trade_date"] == "2026-09-15"
    assert row["latest_trade_area"] == 84
    assert row["latest_jeonse_deposit"] == 54000 and row["latest_jeonse_date"] == "2026-10-10"
    assert row["trade_count"] == 5 and row["rent_count"] == 3
    assert row["recent_avg"] == 90000 and row["peak_amount"] == 100000
    assert row["jeonse_ratio"] == 57.8
    assert len(row["area_stats"]) == 2 and isinstance(row["metrics"], dict)


def test_summary_for_rent_only_apartment_has_null_trade_fields(conn, rent_only_id):
    row = apartment_summary(conn, rent_only_id, TODAY)
    assert row["latest_trade_amount"] is None and row["latest_trade_area"] is None
    assert row["trade_count"] == 0 and row["rent_count"] == 1
    assert row["recent_avg"] is None and row["peak_amount"] is None and row["jeonse_ratio"] is None
    assert row["latest_jeonse_deposit"] == 30000
    assert row["metrics"] == {} and row["area_stats"] == []
