from __future__ import annotations

import sqlite3

import pytest

from pipeline.db import (
    connect, insert_rent, insert_trade, mark_changed, migrate, pop_changed, upsert_apartment,
)
from pipeline.molit_client import RentItem, TradeItem


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    migrate(c)
    return c


def trade(**kw):
    base = dict(apt_name="래미안", apt_seq="11680-1", lawd_cd="11680", dong="역삼동", jibun="1",
                build_year=2000, deal_date="2026-09-01", amount=202500, area=84.97, floor=9,
                cancel_date=None)
    base.update(kw)
    return TradeItem(**base)


def rent(**kw):
    base = dict(apt_name="래미안", apt_seq="11680-1", lawd_cd="11680", dong="역삼동", jibun="1",
                build_year=2000, deal_date="2026-09-01", deposit=50000, monthly_rent=100, area=84.97,
                floor=9, contract_type="신규", contract_term="26.09~28.09", use_rr_right=None,
                pre_deposit=None, pre_monthly_rent=None)
    base.update(kw)
    return RentItem(**base)


def apt(conn, **kw):
    base = dict(name="래미안", lawd_cd="11680", dong="역삼동", jibun="1", build_year=2000,
                apt_seq="11680-1")
    base.update(kw)
    return upsert_apartment(conn, **base)


def test_migrate_is_idempotent_and_adds_columns(conn):
    migrate(conn)
    migrate(conn)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(apartments)")}
    assert {"apt_seq", "household_count"} <= cols
    assert conn.execute("select succeeded_by from regions where code='28260'").fetchone()[0] == "28275,28290"
    assert conn.execute("select count(*) from regions").fetchone()[0] == 88
    assert conn.execute("select district_name from regions where code='41590'").fetchone()[0] == "(폐지) 화성"


def test_migrate_on_production_shape():
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE apartments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
            lawd_cd TEXT NOT NULL, dong TEXT, jibun TEXT, build_year INT,
            UNIQUE(name, lawd_cd, dong, jibun));
        CREATE TABLE regions (code TEXT PRIMARY KEY, city_name TEXT, district_name TEXT);
        INSERT INTO regions VALUES ('11680', '서울', '강남구');
        INSERT INTO apartments(name, lawd_cd, dong, jibun) VALUES ('a', '11680', 'd', '1');
    """)
    migrate(c)
    assert "succeeded_by" in {r[1] for r in c.execute("PRAGMA table_info(regions)")}
    assert c.execute("select count(*) from regions").fetchone()[0] == 88
    assert c.execute("select count(*) from apartments").fetchone()[0] == 1


def test_upsert_matches_by_apt_seq_then_address(conn):
    a = apt(conn)
    b = apt(conn, apt_seq=None)
    c = apt(conn, name="다른이름", jibun="2")
    assert a == b == c


def test_upsert_fills_missing_apt_seq(conn):
    a = apt(conn, apt_seq=None)
    assert apt(conn) == a
    assert conn.execute("select apt_seq from apartments where id=?", (a,)).fetchone()[0] == "11680-1"


def test_upsert_old_incheon_code_merges_into_new(conn):
    old = apt(conn, name="청라X", lawd_cd="28260", dong="청라동", jibun="5", apt_seq=None)
    new = apt(conn, name="청라X", lawd_cd="28275", dong="청라동", jibun="5", apt_seq="28275-9")
    assert old == new
    assert tuple(conn.execute("select lawd_cd, apt_seq from apartments where id=?", (old,)).fetchone()) == ("28275", "28275-9")


def test_insert_trade_dedup_and_cancel_marks_changed(conn):
    a = apt(conn)
    assert insert_trade(conn, a, trade()) is True
    assert pop_changed(conn) == [a]
    assert insert_trade(conn, a, trade()) is False
    assert pop_changed(conn) == []
    assert insert_trade(conn, a, trade(cancel_date="2026-09-20")) is True
    assert pop_changed(conn) == [a]
    row = conn.execute("select cancel_date, is_canceled from transactions").fetchone()
    assert tuple(row) == ("2026-09-20", 1)
    assert conn.execute("select count(*) from transactions").fetchone()[0] == 1
    assert insert_trade(conn, a, trade(cancel_date="2026-09-20")) is False


def test_insert_rent_dedup(conn):
    a = apt(conn)
    assert insert_rent(conn, a, rent()) is True
    assert insert_rent(conn, a, rent()) is False
    assert insert_rent(conn, a, rent(monthly_rent=120)) is True
    assert conn.execute("select count(*) from rents").fetchone()[0] == 2
    assert pop_changed(conn) == [a]


def test_pop_changed_sorted_and_clears(conn):
    mark_changed(conn, [5, 3, 5, 9])
    assert pop_changed(conn) == [3, 5, 9]
    assert pop_changed(conn) == []


def test_connect_uses_row_factory(tmp_path):
    c = connect(str(tmp_path / "x.db"))
    assert c.execute("pragma journal_mode").fetchone()[0] == "wal"
    assert c.execute("select 1 as a").fetchone()["a"] == 1


_LEGACY_TX = """
    CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, apt_id INT, amount BIGINT NOT NULL,
        area DECIMAL(10,4) NOT NULL, floor INT, deal_date DATE NOT NULL,
        unique_hash VARCHAR(64) UNIQUE, cancel_date DATE);
"""
_LEGACY_APT_COORDS = """
    CREATE TABLE apartments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        lawd_cd TEXT NOT NULL, dong TEXT, jibun TEXT, build_year INT,
        latitude DECIMAL(10,8), longitude DECIMAL(11,8), UNIQUE(name, lawd_cd, dong, jibun));
"""
_LEGACY_APT_NOCOORDS = """
    CREATE TABLE apartments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        lawd_cd TEXT NOT NULL, dong TEXT, jibun TEXT, build_year INT,
        UNIQUE(name, lawd_cd, dong, jibun));
"""


@pytest.mark.parametrize("apt_ddl", [_LEGACY_APT_COORDS, _LEGACY_APT_NOCOORDS])
def test_migrate_legacy_then_coord_steps_work(tmp_path, apt_ddl):
    from pipeline.geocode import fill_missing_coords
    from pipeline.migrate_coords import migrate_coords

    src_path = tmp_path / "src.db"
    s = sqlite3.connect(src_path)
    s.executescript(_LEGACY_APT_COORDS.replace("TEXT NOT NULL,\n        lawd_cd", "TEXT NOT NULL,\n        lawd_cd")
                    + "ALTER TABLE apartments ADD COLUMN geocode_quality TEXT;"
                    "INSERT INTO apartments(name, lawd_cd, dong, jibun, latitude, longitude, geocode_quality)"
                    " VALUES ('a','11680','d','1',37.5,127.0,'kakao_address');")
    s.commit()
    s.close()

    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(apt_ddl + _LEGACY_TX + """
        INSERT INTO apartments(name, lawd_cd, dong, jibun) VALUES ('a','11680','d','1');
        INSERT INTO apartments(name, lawd_cd, dong, jibun) VALUES ('b','11680','d','2');
    """)
    migrate(c)
    migrate(c)
    apt_cols = {r[1] for r in c.execute("PRAGMA table_info(apartments)")}
    assert {"latitude", "longitude", "geocode_quality", "apt_seq", "household_count"} <= apt_cols
    tx_cols = {r[1] for r in c.execute("PRAGMA table_info(transactions)")}
    assert {"is_canceled", "cancel_date", "unique_hash", "created_at"} <= tx_cols

    assert migrate_coords(str(src_path), c) == 1
    ok, failed = fill_missing_coords(c, delay=0, geocode=lambda *a: (37.1, 127.1, "fake"), log=lambda *_: None)
    assert (ok, failed) == (1, 0)
    assert c.execute("select count(*) from apartments where latitude is null").fetchone()[0] == 0


def test_insert_rent_same_name_in_different_districts_do_not_collide(conn):
    gangnam = apt(conn, name="현대", lawd_cd="11680", dong="압구정동", jibun="1", apt_seq=None)
    songpa = apt(conn, name="현대", lawd_cd="11710", dong="잠실동", jibun="1", apt_seq=None)
    assert gangnam != songpa
    assert insert_rent(conn, gangnam, rent(apt_name="현대", lawd_cd="11680")) is True
    assert insert_rent(conn, songpa, rent(apt_name="현대", lawd_cd="11710")) is True
    assert conn.execute("select count(*) from rents").fetchone()[0] == 2


def test_insert_rent_hash_uses_apartments_current_lawd_cd(conn):
    import hashlib
    a = apt(conn, name="청라X", lawd_cd="28275", dong="청라동", jibun="5", apt_seq=None)
    r = rent(apt_name="청라X", lawd_cd="28260")  # 옛 코드로 들어와도 단지의 현재 코드로 해시
    insert_rent(conn, a, r)
    h = conn.execute("select unique_hash from rents").fetchone()[0]
    want = hashlib.md5(
        f"R|28275|청라X|{r.floor}|{r.area}|{r.deal_date}|{r.deposit}|{r.monthly_rent}".encode()
    ).hexdigest()
    assert h == want


def test_upsert_moving_retired_code_marks_changed(conn):
    old = apt(conn, name="청라X", lawd_cd="28260", dong="청라동", jibun="5", apt_seq=None)
    pop_changed(conn)
    assert apt(conn, name="청라X", lawd_cd="28275", dong="청라동", jibun="5", apt_seq=None) == old
    assert pop_changed(conn) == [old]
    assert apt(conn, name="청라X", lawd_cd="28275", dong="청라동", jibun="5", apt_seq=None) == old
    assert pop_changed(conn) == []  # 이미 옮겨진 뒤에는 표시하지 않는다


def test_migrate_corrects_existing_region_names(conn):
    conn.execute("UPDATE regions SET district_name='수원영통' WHERE code='41115'")
    conn.execute("UPDATE regions SET district_name='수원팔달' WHERE code='41117'")
    conn.commit()
    migrate(conn)
    got = dict(conn.execute("SELECT code, district_name FROM regions WHERE code IN ('41115','41117')").fetchall())
    assert got == {"41115": "수원팔달", "41117": "수원영통"}
