from __future__ import annotations

import sqlite3

import pytest
import requests

from pipeline import geocode as geo
from pipeline.db import connect, migrate
from pipeline.migrate_coords import migrate_coords


def _dst():
    conn = connect(":memory:")
    migrate(conn)
    return conn


def _add(conn, name, lawd, dong, jibun, lat=None, lng=None, q=None):
    conn.execute(
        "INSERT INTO apartments(name, lawd_cd, dong, jibun, latitude, longitude, geocode_quality)"
        " VALUES (?,?,?,?,?,?,?)", (name, lawd, dong, jibun, lat, lng, q))
    conn.commit()


def _row(conn, name):
    return tuple(conn.execute(
        "SELECT latitude, longitude, geocode_quality FROM apartments WHERE name=?", (name,)).fetchone())


def _make_src(path):
    s = sqlite3.connect(path)
    s.execute("CREATE TABLE apartments (id INTEGER PRIMARY KEY, name TEXT, lawd_cd TEXT, dong TEXT,"
              " jibun TEXT, latitude REAL, longitude REAL, geocode_quality TEXT)")
    rows = [
        ("A", "11680", "개포동", "1", 37.1, 127.1, "kakao"),
        ("B", "28260", "가좌동", "2", 37.2, 126.2, None),      # 폐지 코드
        ("C", "11680", "대치동", "3", None, None, None),        # 좌표 없음
        ("D", "11680", "역삼동", "4", 37.4, 127.4, "kakao"),
    ]
    s.executemany("INSERT INTO apartments(name,lawd_cd,dong,jibun,latitude,longitude,geocode_quality)"
                  " VALUES (?,?,?,?,?,?,?)", rows)
    s.commit()
    s.close()


def test_migrate_coords(tmp_path):
    src = str(tmp_path / "src.db")
    _make_src(src)
    dst = _dst()
    _add(dst, "A", "11680", "개포동", "1")
    _add(dst, "B", "28275", "가좌동", "2")                      # 후속 코드
    _add(dst, "C", "11680", "대치동", "3")
    _add(dst, "D", "11680", "역삼동", "4", 1.0, 2.0, "x")       # 이미 좌표 있음
    _add(dst, "E", "11680", "삼성동", "5")                      # src에 없음
    assert migrate_coords(src, dst) == 2
    assert _row(dst, "A") == (37.1, 127.1, "kakao")
    assert _row(dst, "B") == (37.2, 126.2, "legacy")
    assert _row(dst, "C") == (None, None, None)
    assert _row(dst, "D") == (1.0, 2.0, "x")
    assert _row(dst, "E") == (None, None, None)


class _Resp:
    def __init__(self, status, payload=None, text=""):
        self.status_code, self._p, self.text = status, payload or {}, text

    def json(self):
        return self._p


class _Session:
    def __init__(self, resps):
        self.resps, self.calls = list(resps), []

    def get(self, url, params=None, headers=None, timeout=None):
        self.calls.append((url, params, headers))
        return self.resps.pop(0)


def test_geocode_address_parses_and_builds_query(monkeypatch):
    monkeypatch.setenv("KAKAO_REST_API_KEY", "k")
    s = _Session([_Resp(200, {"documents": [{"y": "37.5", "x": "127.0"}]})])
    assert geo.geocode_address("41135", "정자동", "10", session=s) == (37.5, 127.0, "kakao_address")
    url, params, headers = s.calls[0]
    assert params["query"] == "경기 성남시 분당구 정자동 10"
    assert headers["Authorization"] == "KakaoAK k"


def test_geocode_address_empty_is_none(monkeypatch):
    monkeypatch.setenv("KAKAO_REST_API_KEY", "k")
    assert geo.geocode_address("11680", "x", "1", session=_Session([_Resp(200, {"documents": []})])) is None


def test_geocode_address_retries_429_then_ok(monkeypatch):
    monkeypatch.setenv("KAKAO_REST_API_KEY", "k")
    monkeypatch.setattr(geo.time, "sleep", lambda s: None)
    s = _Session([_Resp(429), _Resp(200, {"documents": [{"y": "1", "x": "2"}]})])
    assert geo.geocode_address("11680", "x", "1", session=s) == (1.0, 2.0, "kakao_address")
    assert len(s.calls) == 2


def test_geocode_address_errors(monkeypatch):
    monkeypatch.setenv("KAKAO_REST_API_KEY", "k")
    monkeypatch.setattr(geo.time, "sleep", lambda s: None)
    with pytest.raises(geo.GeocodeError) as e:
        geo.geocode_address("11680", "x", "1", session=_Session([_Resp(401, text="nope")]))
    assert e.value.status == 401
    with pytest.raises(geo.GeocodeError) as e:
        geo.geocode_address("11680", "x", "1", session=_Session([_Resp(429)] * 4))
    assert e.value.status == 429
    monkeypatch.delenv("KAKAO_REST_API_KEY")
    monkeypatch.setattr(geo, "load_dotenv", lambda: None)
    with pytest.raises(geo.GeocodeError):
        geo.geocode_address("11680", "x", "1", session=_Session([]))


def _fill_setup():
    conn = _dst()
    _add(conn, "ok", "11680", "a", "1")
    _add(conn, "miss", "11680", "b", "2")
    _add(conn, "prevfail", "11680", "c", "3", q="failed")
    _add(conn, "done", "11680", "d", "4", 5.0, 6.0, "kakao")
    return conn


def test_fill_missing_coords_records_success_and_failure():
    conn = _fill_setup()
    fake = lambda lawd, dong, jibun: (37.0, 127.0, "kakao_address") if dong == "a" else None
    assert geo.fill_missing_coords(conn, delay=0, geocode=fake, log=lambda m: None) == (1, 1)
    assert _row(conn, "ok") == (37.0, 127.0, "kakao_address")
    assert _row(conn, "miss") == (None, None, "failed")
    assert _row(conn, "prevfail") == (None, None, "failed")
    assert _row(conn, "done") == (5.0, 6.0, "kakao")


def test_fill_missing_coords_retry_failed_and_limit():
    conn = _fill_setup()
    fake = lambda lawd, dong, jibun: (1.0, 2.0, "kakao_address")
    assert geo.fill_missing_coords(conn, delay=0, geocode=fake, retry_failed=True, limit=2,
                                   log=lambda m: None) == (2, 0)
    assert _row(conn, "ok")[2] == "kakao_address" and _row(conn, "miss")[2] == "kakao_address"
    assert _row(conn, "prevfail")[2] == "failed"


def test_fill_missing_coords_stops_on_quota_error():
    conn = _fill_setup()
    calls = []

    def fake(lawd, dong, jibun):
        calls.append(dong)
        if dong == "a":
            return (1.0, 2.0, "kakao_address")
        raise geo.GeocodeError(429, "quota")

    logs = []
    assert geo.fill_missing_coords(conn, delay=0, geocode=fake, log=logs.append) == (1, 0)
    assert calls == ["a", "b"]
    assert _row(conn, "ok")[0] == 1.0
    assert _row(conn, "miss") == (None, None, None)
    assert any("429" in m for m in logs)


def test_cli_bad_args_exit_2():
    from pipeline import migrate_coords as mc
    with pytest.raises(SystemExit) as e:
        mc.main([])
    assert e.value.code == 2
    with pytest.raises(SystemExit) as e:
        geo.main(["--limit", "x", "--db", "d"])
    assert e.value.code == 2


def test_geocoded_apartments_are_marked_changed():
    from pipeline.db import pop_changed
    conn = _fill_setup()
    fake = lambda lawd, dong, jibun: (37.0, 127.0, "kakao_address") if dong == "a" else None
    geo.fill_missing_coords(conn, delay=0, geocode=fake, log=lambda m: None)
    ok_id = conn.execute("SELECT id FROM apartments WHERE name='ok'").fetchone()[0]
    assert pop_changed(conn) == [ok_id]  # 실패 건은 변경 목록에 없다


def test_migrate_coords_marks_changed(tmp_path):
    from pipeline.db import pop_changed
    src = tmp_path / "src.db"
    s = _make_src_db_for_marks(src)
    dst = _dst()
    _add(dst, "n", "11680", "a", "1")
    assert migrate_coords(str(src), dst) == 1
    assert len(pop_changed(dst)) == 1


def _make_src_db_for_marks(path):
    s = sqlite3.connect(path)
    s.execute("CREATE TABLE apartments(id INTEGER PRIMARY KEY, name TEXT, lawd_cd TEXT, dong TEXT,"
              " jibun TEXT, latitude REAL, longitude REAL, geocode_quality TEXT)")
    s.execute("INSERT INTO apartments(name,lawd_cd,dong,jibun,latitude,longitude,geocode_quality)"
              " VALUES ('n','11680','a','1',1.0,2.0,'kakao')")
    s.commit()
    s.close()


def _transient_setup():
    conn = _dst()
    for n, d in (("one", "a"), ("two", "b"), ("three", "c")):
        _add(conn, n, "11680", d, "1")
    return conn


@pytest.mark.parametrize("exc", [
    requests.exceptions.Timeout("read timed out"),
    requests.exceptions.ConnectionError("reset"),
    geo.GeocodeError(500, "internal"),
])
def test_fill_missing_coords_transient_error_stops_early_and_keeps_done(exc):
    conn = _transient_setup()
    calls = []

    def fake(lawd, dong, jibun):
        calls.append(dong)
        if dong == "b":
            raise exc
        return (1.0, 2.0, "kakao_address")

    logs = []
    assert geo.fill_missing_coords(conn, delay=0, geocode=fake, log=logs.append) == (1, 0)
    assert calls == ["a", "b"]
    conn.rollback()  # 커밋된 것만 남는지 확인
    assert _row(conn, "one") == (1.0, 2.0, "kakao_address")
    assert _row(conn, "two") == (None, None, None)
    assert any("stopped early" in m for m in logs)


def test_cli_exits_zero_on_transient_error(tmp_path, monkeypatch):
    db = str(tmp_path / "g.db")
    conn = connect(db)
    migrate(conn)
    _add(conn, "one", "11680", "a", "1")
    conn.close()

    def boom(lawd, dong, jibun):
        raise requests.exceptions.Timeout("slow")

    monkeypatch.setattr(geo, "fill_missing_coords",
                        lambda c, **kw: _orig_fill(c, geocode=boom, **kw))
    assert geo.main(["--db", db, "--delay", "0"]) == 0


_orig_fill = geo.fill_missing_coords
