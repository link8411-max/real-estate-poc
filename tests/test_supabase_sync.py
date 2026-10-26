from __future__ import annotations

import json
from datetime import date

import pytest

from pipeline import supabase_sync as ss
from pipeline.db import connect, migrate, upsert_apartment
from pipeline.regions import REGIONS, SUCCEEDED_BY
from pipeline.supabase_sync import SupabaseError, region_rows, sync, upsert_apartments, upsert_regions

TODAY = date(2026, 10, 26)


class FakeResp:
    def __init__(self, status=201, text=""):
        self.status_code = status
        self.text = text


class FakeSession:
    def __init__(self, status=201, text=""):
        self.calls = []
        self.status, self.text = status, text

    def post(self, url, headers=None, data=None):
        self.calls.append({"url": url, "headers": headers, "data": data})
        return FakeResp(self.status, self.text)


def test_upsert_apartments_batches_and_headers():
    s = FakeSession()
    rows = [{"id": i, "name": f"a{i}", "area_stats": [{"x": 1}]} for i in range(1001)]
    n = upsert_apartments(rows, url="https://x.supabase.co", key="K", session=s)
    assert n == 1001
    assert len(s.calls) == 3
    c = s.calls[0]
    assert c["url"] == "https://x.supabase.co/rest/v1/apartments?on_conflict=id"
    assert c["headers"] == {
        "apikey": "K", "Authorization": "Bearer K", "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    bodies = [json.loads(c["data"]) for c in s.calls]
    assert [len(b) for b in bodies] == [500, 500, 1]
    assert set(bodies[0][0]) == {"id", "name", "area_stats"}


def test_upsert_regions_url():
    s = FakeSession()
    assert upsert_regions([{"code": "11440"}], url="https://x.co", key="K", session=s) == 1
    assert s.calls[0]["url"] == "https://x.co/rest/v1/regions?on_conflict=code"


def test_upsert_empty_makes_no_calls():
    s = FakeSession()
    assert upsert_apartments([], url="u", key="k", session=s) == 0
    assert s.calls == []


def test_non_2xx_raises():
    s = FakeSession(400, "x" * 500)
    with pytest.raises(SupabaseError) as e:
        upsert_apartments([{"id": 1}], url="u", key="k", session=s)
    assert e.value.status == 400
    assert len(e.value.text) == 300


def test_missing_env_raises(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(ValueError, match="SUPABASE_URL"):
        upsert_apartments([{"id": 1}], session=FakeSession())


def test_env_defaults(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://e.co/")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "EK")
    s = FakeSession()
    upsert_apartments([{"id": 1}], session=s)
    assert s.calls[0]["url"] == "https://e.co/rest/v1/apartments?on_conflict=id"
    assert s.calls[0]["headers"]["apikey"] == "EK"


@pytest.fixture
def conn(tmp_path):
    c = connect(str(tmp_path / "t.db"))
    migrate(c)
    yield c
    c.close()


def _apt(conn, name, code, jibun, lat, lng):
    i = upsert_apartment(conn, name=name, lawd_cd=code, dong="동", jibun=jibun, build_year=2000, apt_seq=None)
    conn.execute("UPDATE apartments SET latitude=?, longitude=? WHERE id=?", (lat, lng, i))
    return i


def _trade(conn, apt_id, amount, deal_date):
    conn.execute(
        "INSERT INTO transactions(apt_id, amount, area, floor, deal_date, unique_hash) VALUES (?,?,?,?,?,?)",
        (apt_id, amount, 84.0, 5, deal_date, f"h{apt_id}{amount}{deal_date}"),
    )


def test_region_rows(conn):
    a = _apt(conn, "A", "11440", "1", 37.0, 127.0)
    _apt(conn, "B", "11440", "2", 38.0, 128.0)
    _apt(conn, "C", "11440", "3", None, None)
    _trade(conn, a, 100000, "2026-09-01")
    conn.commit()
    rows = {r["code"]: r for r in region_rows(conn, TODAY)}
    assert len(rows) == len(REGIONS) + len(SUCCEEDED_BY) == 88
    r = rows["11440"]
    assert r["name"] == REGIONS["11440"]
    assert r["apartment_count"] == 3
    assert r["lat"] == pytest.approx(37.5) and r["lng"] == pytest.approx(127.5)
    assert r["avg_amount"] == 100000
    assert set(r) == {"code", "name", "city", "succeeded_by", "lat", "lng",
                      "apartment_count", "avg_amount", "updated_at"}
    empty = rows["11410"]
    assert empty["apartment_count"] == 0 and empty["lat"] is None and empty["avg_amount"] is None
    old = next(iter(SUCCEEDED_BY))
    assert rows[old]["name"].startswith("(폐지) ")
    assert rows[old]["succeeded_by"] == ",".join(SUCCEEDED_BY[old])
    assert rows[old]["apartment_count"] == 0 and rows[old]["avg_amount"] is None


def test_sync_wiring(conn):
    a = _apt(conn, "A", "11440", "1", 37.0, 127.0)
    b = _apt(conn, "B", "11410", "2", 37.5, 127.5)
    _trade(conn, a, 100000, "2026-09-01")
    conn.commit()
    got = {"apts": [], "regs": []}

    def ua(rows):
        got["apts"] += rows
        return len(rows)

    def ur(rows):
        got["regs"] += rows
        return len(rows)

    assert sync(conn, [a], TODAY, upsert_apts=ua, upsert_regs=ur) == (1, 1)
    assert [r["id"] for r in got["apts"]] == [a]
    assert [r["code"] for r in got["regs"]] == ["11440"]
    got["apts"].clear(); got["regs"].clear()
    assert sync(conn, None, TODAY, upsert_apts=ua, upsert_regs=ur) == (2, 88)
    assert sorted(r["id"] for r in got["apts"]) == sorted([a, b])


def test_cli_errors(tmp_path, monkeypatch, capsys):
    db = str(tmp_path / "t.db")
    c = connect(db); migrate(c); c.close()
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    assert ss.main(["--db", db, "--changed", str(tmp_path / "nope.json")]) == 2
    bad = tmp_path / "bad.json"; bad.write_text("{oops")
    assert ss.main(["--db", db, "--changed", str(bad)]) == 2
    assert ss.main(["--db", db, "--all", "--today", "bad"]) == 2
    assert ss.main(["--db", db, "--all"]) == 2  # env 없음
    assert "SUPABASE_URL" in capsys.readouterr().err


def test_cli_supabase_error_exit1(tmp_path, monkeypatch, capsys):
    db = str(tmp_path / "t.db")
    c = connect(db); migrate(c); c.close()
    f = tmp_path / "ch.json"; f.write_text("[]")

    def boom(*a, **k):
        raise SupabaseError(401, "nope")

    monkeypatch.setattr(ss, "sync", boom)
    monkeypatch.setenv("SUPABASE_URL", "https://x.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "k")
    assert ss.main(["--db", db, "--changed", str(f)]) == 1
    assert "401" in capsys.readouterr().err


def test_cli_ok(tmp_path, monkeypatch, capsys):
    db = str(tmp_path / "t.db")
    c = connect(db); migrate(c); c.close()
    monkeypatch.setattr(ss, "sync", lambda conn, ids, today: (3, 4))
    monkeypatch.setenv("SUPABASE_URL", "https://x.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "k")
    assert ss.main(["--db", db, "--all"]) == 0
    assert "3" in capsys.readouterr().out
