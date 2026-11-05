from __future__ import annotations

import json
import sqlite3

import pytest

from pipeline import supply
from pipeline.db import migrate, upsert_apartment
from pipeline.supply import estimate_ratio, lookup, resolve_all


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    migrate(c)
    return c


_n = [0]


def add_apt(conn, name="A", lawd="11710", year=2010, areas=(84.8,)):
    _n[0] += 1
    a = upsert_apartment(conn, name=name, lawd_cd=lawd, dong="동", jibun=str(_n[0]),
                         build_year=year, apt_seq=None)
    for i, ar in enumerate(areas):
        conn.execute(
            "INSERT INTO transactions(apt_id, amount, area, deal_date, unique_hash) VALUES (?,?,?,?,?)",
            (a, 1, ar, "2025-01-01", f"{a}-{i}-{ar}"))
    return a


def reg(conn, apt, excl, sup, n=10, agr=1.0):
    conn.execute("INSERT INTO register_types VALUES (?,?,?,?,?)", (apt, excl, sup, n, agr))


def rows(conn, apt):
    return {r[0]: r[1:] for r in conn.execute(
        "SELECT excl_area, supply_area, source, approx FROM apartment_area_types WHERE apt_id=?", (apt,))}


def test_cheongyak_wins(conn):
    a = add_apt(conn)
    reg(conn, a, 84.8, 111.52)
    resolve_all(conn, {a: [(84.8, 111.79)]})
    assert rows(conn, a)[84.8] == (111.79, "cheongyak", 0)


def test_register_old_build_is_approx(conn):
    a = add_apt(conn, year=1979)
    reg(conn, a, 84.8, 111.52)
    resolve_all(conn, {})
    assert rows(conn, a)[84.8] == (111.52, "register", 1)


def test_register_sure_is_not_approx(conn):
    a = add_apt(conn)
    reg(conn, a, 84.8, 111.52)
    resolve_all(conn, {})
    assert rows(conn, a)[84.8] == (111.52, "register", 0)


def test_register_low_agreement_is_approx(conn):
    a = add_apt(conn)
    reg(conn, a, 84.8, 111.52, agr=0.5)
    resolve_all(conn, {})
    assert rows(conn, a)[84.8][2] == 1


def test_register_out_of_range_falls_to_estimate(conn):
    a = add_apt(conn, areas=(84.43,))
    reg(conn, a, 84.43, 161.0)
    resolve_all(conn, {})
    r = rows(conn, a)[84.43]
    assert r[1:] == ("estimate", 1)
    assert 1.2 <= r[0] / 84.43 <= 1.45


def test_estimate_prefers_same_apartment(conn):
    a = add_apt(conn, areas=(59.9, 84.8))
    reg(conn, a, 84.8, round(84.8 * 1.32, 2))
    b = add_apt(conn, areas=(84.8,))  # 이웃 단지는 비율이 다르다
    reg(conn, b, 84.8, round(84.8 * 1.40, 2))
    resolve_all(conn, {})
    sup, source, approx = rows(conn, a)[59.9]
    assert source == "estimate" and approx == 1
    assert sup == pytest.approx(59.9 * 1.32, abs=0.02)


def test_estimate_falls_back_to_peers(conn):
    # 같은 구·준공 ±5년·60~85 면적대 확실한 값 3개 (1.30, 1.34, 1.40) → 중앙값 1.34
    for r in (1.30, 1.34, 1.40):
        p = add_apt(conn, year=2008, areas=(84.8,))
        reg(conn, p, 84.8, 84.8 * r)
    far = add_apt(conn, year=1999, areas=(84.8,))  # 준공 차이 큰 단지는 제외
    reg(conn, far, 84.8, 84.8 * 1.44)
    a = add_apt(conn, year=2010, areas=(70.0,))
    assert estimate_ratio(conn, a, 70.0) == pytest.approx(1.34)
    resolve_all(conn, {})
    assert rows(conn, a)[70.0][0] == pytest.approx(70.0 * 1.34, abs=0.02)


def test_estimate_sido_then_all(conn):
    p = add_apt(conn, lawd="11680", year=2010, areas=(84.8,))
    reg(conn, p, 84.8, 84.8 * 1.30)
    other = add_apt(conn, lawd="41135", year=2010, areas=(84.8,))
    reg(conn, other, 84.8, 84.8 * 1.40)
    a = add_apt(conn, lawd="11710", year=2010, areas=(70.0,))  # 같은 구 없음 → 같은 시도(서울)
    assert estimate_ratio(conn, a, 70.0) == pytest.approx(1.30)
    c = add_apt(conn, lawd="28200", year=2010, areas=(70.0,))  # 인천: 시도에도 없음 → 전체 중앙값
    assert estimate_ratio(conn, c, 70.0) == pytest.approx(1.35)


def test_every_traded_area_gets_a_type(conn):
    a = add_apt(conn, areas=(59.96, 84.8))
    conn.execute("INSERT INTO rents(apt_id, deposit, monthly_rent, area, deal_date, unique_hash)"
                 " VALUES (?,?,?,?,?,?)", (a, 1, 0, 101.234, "2025-01-01", "r1"))
    resolve_all(conn, {})
    assert set(rows(conn, a)) == {59.96, 84.8, 101.23}


def test_lookup_tolerance():
    types = [{"excl": 84.8, "supply": 111.52, "approx": False}]
    assert lookup(types, 84.84) == types[0]
    assert lookup(types, 84.9) is None


def test_aliases_follow_canonical(conn):
    old = add_apt(conn, "옛", areas=(84.8,))
    new = add_apt(conn, "새", areas=(84.8,))
    conn.execute("INSERT INTO apartment_aliases VALUES (?,?)", (old, new))
    resolve_all(conn, {})
    assert rows(conn, old) == {} and 84.8 in rows(conn, new)


def test_changed_only_when_value_changes(conn):
    a = add_apt(conn)
    reg(conn, a, 84.8, 111.52)
    assert resolve_all(conn, {}) == [a]
    assert resolve_all(conn, {}) == []
    assert conn.execute("SELECT COUNT(*) FROM changed_apartments WHERE apt_id=?", (a,)).fetchone()[0] == 1
    conn.execute("UPDATE register_types SET supply_area=112.0 WHERE apt_id=?", (a,))
    assert resolve_all(conn, {}) == [a]


def test_cli_resolve(tmp_path, monkeypatch):
    db = tmp_path / "t.db"
    c = sqlite3.connect(db)
    migrate(c)
    a = add_apt(c)
    reg(c, a, 84.8, 111.52)
    c.commit()
    c.close()
    out = tmp_path / "changed.json"
    monkeypatch.chdir(tmp_path)
    rc = supply.main(["resolve", "--db", str(db), "--cheongyak-dir", str(tmp_path), "--changed-out", str(out)])
    assert rc == 0 and json.loads(out.read_text()) == [a]
