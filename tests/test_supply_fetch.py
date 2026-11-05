from __future__ import annotations

import json
import sqlite3

import pytest

from pipeline import supply_fetch
from pipeline.db import insert_trade, migrate, upsert_apartment
from pipeline.supply_fetch import fetch_apartment, fetch_queue, main, wanted_areas


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    monkeypatch.setattr(supply_fetch.time, "sleep", lambda s: None)
    monkeypatch.setenv("MOLIT_API_KEY", "test-key")


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    migrate(c)
    return c


def add_apt(conn, name, jibun="19", n_trades=1, areas=(84.8,), date="2026-01-10"):
    apt = upsert_apartment(conn, name=name, lawd_cd="11710", dong="개포동", jibun=jibun,
                           build_year=2000, apt_seq=None,
                           umd_cd="10100", bonbun=jibun.zfill(4), bubun="0000")
    for i in range(n_trades):
        a = areas[i % len(areas)]
        conn.execute(
            "INSERT INTO transactions(apt_id, amount, area, deal_date, unique_hash) VALUES (?,?,?,?,?)",
            (apt, 100000, a, date, f"{name}-{i}"))
    return apt


def unit(ho, excl, common=0.0, pk=None):
    base = {"dongNm": "101동", "hoNm": f"{ho}호", "mgmBldrgstPk": pk or f"pk{ho}",
            "mainPurpsCdNm": "아파트", "etcPurps": "아파트"}
    rows = [{**base, "exposPubuseGbCd": "1", "area": excl}]
    if common:
        rows.append({**base, "exposPubuseGbCd": "2", "etcPurps": "계단실", "area": common})
    return rows


def body(items, total):
    return {"response": {"header": {"resultCode": "00"},
                         "body": {"items": {"item": items} if items else "", "totalCount": total}}}


class Resp:
    def __init__(self, data, status=200):
        self._d, self.status_code = data, status
        self.text = json.dumps(data)

    def json(self):
        return self._d


class FakeSession:
    def __init__(self, pages=None, status=200):
        self.pages = pages or {}  # pageNo -> JSON
        self.status = status
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append(params)
        if self.status != 200:
            return Resp({}, self.status)
        return Resp(self.pages.get(int(params["pageNo"]), body([], 0)))


def status_of(conn, apt):
    r = conn.execute("SELECT status FROM register_fetch WHERE apt_id=?", (apt,)).fetchone()
    return r[0] if r else None


def test_response_shapes():
    one = supply_fetch._parse(body({"a": 1}, "250"))
    assert one == ([{"a": 1}], 250)
    assert supply_fetch._parse(body([], "0")) == ([], 0)
    assert supply_fetch._parse(body([{"a": 1}, {"a": 2}], 250)) == ([{"a": 1}, {"a": 2}], 250)


def test_wanted_areas(conn):
    a = add_apt(conn, "A", n_trades=2, areas=(84.8, 59.96))
    conn.execute("INSERT INTO rents(apt_id, deposit, monthly_rent, area, deal_date, unique_hash)"
                 " VALUES (?,?,?,?,?,?)", (a, 1, 0, 84.8004, "2026-01-01", "r1"))
    assert wanted_areas(conn, a) == {84.8, 59.96}


def test_stops_when_all_wanted_found(conn):
    a = add_apt(conn, "A", n_trades=2, areas=(84.8, 59.96))
    rows = unit(1, 84.8, 20.0) + unit(2, 59.96, 15.0) + unit(3, 59.96, 15.0)
    s = FakeSession({1: body(rows, 500)})
    assert fetch_apartment(conn, a, s) == 1
    assert len(s.calls) == 1
    assert status_of(conn, a) == "done"
    saved = conn.execute("SELECT excl_area, supply_area, sample_n FROM register_types"
                         " WHERE apt_id=? ORDER BY excl_area", (a,)).fetchall()
    assert saved[0][0] == 59.96 and saved[1][0:2] == (84.8, 104.8)
    assert s.calls[0]["serviceKey"] == "test-key" and s.calls[0]["bjdongCd"] == "10100"


def test_partial_after_max_pages(conn):
    a = add_apt(conn, "A", n_trades=2, areas=(84.8, 59.96))
    pages = {p: body(unit(p * 10 + k, 84.8, 20.0, pk=f"p{p}{k}"), 1000) for p in (1, 2, 3) for k in (0,)}
    s = FakeSession(pages)
    assert fetch_apartment(conn, a, s, max_pages=3) == 3
    assert status_of(conn, a) == "partial"
    n = conn.execute("SELECT COUNT(*) FROM register_types WHERE apt_id=?", (a,)).fetchone()[0]
    assert n == 1


def test_last_page_ends_done(conn):
    a = add_apt(conn, "A", areas=(59.96,))
    s = FakeSession({1: body(unit(1, 84.8, 20.0), 100)})
    fetch_apartment(conn, a, s)
    assert status_of(conn, a) == "partial"  # 원하는 면적이 끝까지 안 나옴
    assert len(s.calls) == 1


def test_empty(conn):
    a = add_apt(conn, "A")
    s = FakeSession({1: body([], 0)})
    fetch_apartment(conn, a, s)
    assert status_of(conn, a) == "empty"


def test_no_key_skips_call(conn):
    a = upsert_apartment(conn, name="X", lawd_cd="11710", dong="개포동", jibun="산1",
                         build_year=2000, apt_seq=None)
    s = FakeSession()
    assert fetch_apartment(conn, a, s) == 0
    assert s.calls == [] and status_of(conn, a) == "no_key"


def multi_page_session():
    # 단지당 2페이지: 1페이지엔 원하는 면적이 없고 2페이지(마지막)에서 나온다
    return {1: body(unit(1, 74.0, 10.0), 200), 2: body(unit(2, 84.8, 20.0), 200)}


def test_budget_respected(conn):
    ids = [add_apt(conn, n, jibun=j, n_trades=3 - i) for i, (n, j) in enumerate([("A", "1"), ("B", "2"), ("C", "3")])]
    s = FakeSession(multi_page_session())
    out = supply_fetch.run(conn, s, budget=5)
    assert len(s.calls) <= 5
    assert status_of(conn, ids[0]) == "done" and status_of(conn, ids[1]) == "done"
    assert status_of(conn, ids[2]) is None
    assert out == ids[:2]
    assert fetch_queue(conn) == [ids[2]]


def test_queue_order(conn):
    a = add_apt(conn, "A", jibun="1", n_trades=1)
    b = add_apt(conn, "B", jibun="2", n_trades=3)
    c = add_apt(conn, "C", jibun="3", n_trades=3)
    d = add_apt(conn, "D", jibun="4", n_trades=9, date="2010-01-01")  # 3년 밖
    conn.execute("INSERT INTO register_fetch VALUES (?, 'done', 1, 'x')", (c,))
    assert fetch_queue(conn) == [b, a, d]


def test_error_is_retried(conn):
    a = add_apt(conn, "A")
    s = FakeSession(status=500)
    fetch_apartment(conn, a, s)
    assert status_of(conn, a) == "error"
    assert fetch_queue(conn) == [a]


def test_transient_429_retried(conn):
    a = add_apt(conn, "A")
    good = Resp(body(unit(1, 84.8, 20.0), 1))
    seq = [Resp({}, 429), good]

    class S:
        calls = 0

        def get(self, url, params=None, timeout=None):
            S.calls += 1
            return seq.pop(0)

    assert fetch_apartment(conn, a, S()) == 2
    assert status_of(conn, a) == "done"


def test_replaces_previous_types(conn):
    a = add_apt(conn, "A")
    conn.execute("INSERT INTO register_types VALUES (?, 50.0, 60.0, 1, 1.0)", (a,))
    fetch_apartment(conn, a, FakeSession({1: body(unit(1, 84.8, 20.0), 1)}))
    rows = conn.execute("SELECT excl_area FROM register_types WHERE apt_id=?", (a,)).fetchall()
    assert rows == [(84.8,)]


def test_cli_writes_changed(tmp_path, monkeypatch):
    db = tmp_path / "t.db"
    c = sqlite3.connect(db)
    migrate(c)
    a = add_apt(c, "A")
    c.commit()
    c.close()
    s = FakeSession({1: body(unit(1, 84.8, 20.0), 1)})
    monkeypatch.setattr(supply_fetch, "_make_session", lambda: s)
    out = tmp_path / "ch.json"
    assert main(["--db", str(db), "--budget", "10", "--changed-out", str(out)]) == 0
    assert json.loads(out.read_text()) == [a]


def _coverage_db(conn):
    apts = [add_apt(conn, f"C{i}", jibun=str(i + 1), n_trades=n, date="2026-01-10")
            for i, n in enumerate([50, 30, 10, 5, 5])]
    return apts


def test_coverage_top80(conn):
    from pipeline.supply_fetch import coverage
    apts = _coverage_db(conn)
    conn.execute("INSERT INTO register_fetch VALUES (?, 'done', 1, 'x')", (apts[0],))
    conn.execute("INSERT INTO register_fetch VALUES (?, 'error', 1, 'x')", (apts[1],))
    r = coverage(conn)
    assert r == {"top_n": 2, "done": 1, "ratio": 0.5, "ready": False}


def test_coverage_ready_with_cheongyak(conn):
    from pipeline.supply_fetch import coverage
    apts = _coverage_db(conn)
    conn.execute("INSERT INTO register_fetch VALUES (?, 'no_key', 0, 'x')", (apts[0],))
    conn.execute(
        "INSERT INTO apartment_area_types VALUES (?, 84.8, 110.0, 'cheongyak', 0, 1, 'x')", (apts[1],))
    r = coverage(conn)
    assert r == {"top_n": 2, "done": 2, "ratio": 1.0, "ready": True}


def test_coverage_cli(tmp_path, capsys):
    db = tmp_path / "c.db"
    c = sqlite3.connect(db)
    migrate(c)
    _coverage_db(c)
    c.commit()
    c.close()
    assert main(["coverage", "--db", str(db)]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["top_n"] == 2 and out["ready"] is False
