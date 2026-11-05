from __future__ import annotations

import sqlite3

import pytest

from pipeline.cheongyak import Notice, load_notices, match_notices, parse_house_type
from pipeline.db import migrate

FIX = "tests/fixtures/cheongyak"


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    migrate(c)
    return c


def add_apt(conn, name, lawd, areas):
    cur = conn.execute(
        "INSERT INTO apartments(name, lawd_cd, dong, jibun) VALUES (?,?,?,?)", (name, lawd, "동", "1"))
    for i, a in enumerate(areas):
        conn.execute(
            "INSERT INTO transactions(apt_id, amount, area, deal_date, unique_hash) VALUES (?,?,?,?,?)",
            (cur.lastrowid, 1, a, "2025-01-01", f"{name}{i}"))
    return cur.lastrowid


@pytest.mark.parametrize("text,exp", [("084.9500D", 84.95), ("059.1662A", 59.17), ("055.0000O", 55.0)])
def test_parse_house_type(text, exp):
    assert parse_house_type(text) == exp


def test_load_notices_fixture():
    notices = {n.name: n for n in load_notices(FIX)}
    assert "올림픽파크 포레온" in notices
    n = notices["올림픽파크 포레온"]
    assert (84.99, 112.69) in n.types and n.address.startswith("서울특별시 강동구")


def test_match_by_area_overlap(conn):
    # 포레온 공고의 전용 29.97·59.99·84.99 가 거래에 있다 (±0.05)
    forn = add_apt(conn, "올림픽파크포레온", "11740", [29.97, 59.99, 84.98])
    add_apt(conn, "다른단지", "11740", [10.0, 20.0])
    matched = match_notices(conn, load_notices(FIX))
    assert forn in matched
    assert (84.99, 112.69) in matched[forn]


def test_no_match_when_ambiguous(conn):
    add_apt(conn, "가나", "11740", [29.97, 59.99, 84.98])
    add_apt(conn, "다라", "11740", [29.97, 59.99, 84.98])
    assert match_notices(conn, load_notices(FIX)) == {}


def test_no_match_other_district(conn):
    add_apt(conn, "올림픽파크포레온", "11710", [29.97, 59.99, 84.98])
    assert match_notices(conn, load_notices(FIX)) == {}


def test_name_similarity_breaks_tie(conn):
    a = add_apt(conn, "올림픽파크포레온", "11740", [29.97, 59.99, 84.98])
    add_apt(conn, "엉뚱한마을", "11740", [29.97, 59.99, 84.98])
    assert list(match_notices(conn, load_notices(FIX))) == [a]


def test_multi_token_city(conn):
    a = add_apt(conn, "분당단지", "41135", [50.0, 60.0])
    n = Notice("1", "분당단지", "경기도 성남시 분당구 정자동 1", "2025-01-01", [(50.0, 70.0), (60.0, 80.0)])
    assert list(match_notices(conn, [n])) == [a]


def test_no_match_when_built_before_notice(conn):
    a = add_apt(conn, "올림픽파크포레온", "11740", [29.97, 59.99, 84.98])
    conn.execute("UPDATE apartments SET build_year=1990 WHERE id=?", (a,))
    assert match_notices(conn, load_notices(FIX)) == {}
