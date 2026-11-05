from __future__ import annotations

import sqlite3

import pytest

from pipeline.db import migrate, upsert_apartment
from pipeline.register_keys import RegisterKey, register_keys


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    migrate(c)
    return c


def add(conn, name, jibun, dong="개포동", lawd="11710", **codes):
    return upsert_apartment(conn, name=name, lawd_cd=lawd, dong=dong, jibun=jibun,
                            build_year=2000, apt_seq=None, **codes)


def test_register_keys_from_columns(conn):
    a = add(conn, "A", "19", umd_cd="10100", bonbun="0019", bubun="0000")
    assert register_keys(conn, a) == RegisterKey("11710", "10100", "0019", "0000")


def test_register_keys_dong_fallback(conn):
    add(conn, "B", "1", umd_cd="10700", bonbun="0001", bubun="0000")
    a = add(conn, "A", "95-1")
    assert register_keys(conn, a) == RegisterKey("11710", "10700", "0095", "0001")


@pytest.mark.parametrize("jibun", ["", None, "산12", "95-1외", "12-3-4"])
def test_register_keys_odd_jibun(conn, jibun):
    add(conn, "B", "1", umd_cd="10700", bonbun="0001", bubun="0000")
    a = add(conn, "A", "x")
    conn.execute("UPDATE apartments SET jibun=? WHERE id=?", (jibun, a))
    assert register_keys(conn, a) is None
