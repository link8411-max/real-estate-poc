from __future__ import annotations

import json
from datetime import date

import pytest

from pipeline import collect as collect_mod
from pipeline.collect import collect, current_and_previous_month, main, month_range
from pipeline.db import connect, migrate, pop_changed
from pipeline.molit_client import MolitError, RentItem, TradeItem


@pytest.fixture
def conn(tmp_path):
    c = connect(str(tmp_path / "t.db"))
    migrate(c)
    yield c
    c.close()


def trade(lawd="11680"):
    return TradeItem(
        apt_name="래미안", apt_seq="11680-1", lawd_cd=lawd, dong="개포동", jibun="1",
        build_year=2010, deal_date="2026-10-05", amount=150000, area=84.9, floor=5,
        cancel_date=None,
    )


def rent(lawd="11680"):
    return RentItem(
        apt_name="래미안", apt_seq="11680-1", lawd_cd=lawd, dong="개포동", jibun="1",
        build_year=2010, deal_date="2026-10-06", deposit=50000, monthly_rent=0, area=84.9,
        floor=3, contract_type="신규", contract_term=None, use_rr_right=None,
        pre_deposit=None, pre_monthly_rent=None,
    )


def test_month_range():
    assert month_range("202511", "202602") == ["202511", "202512", "202601", "202602"]
    assert len(month_range("202602", "202608")) == 7


def test_current_and_previous_month():
    assert current_and_previous_month(date(2026, 10, 27)) == ["202609", "202610"]
    assert current_and_previous_month(date(2026, 1, 3)) == ["202512", "202601"]


def test_collect_saves_and_reports_changed(conn):
    fake = lambda lawd, ym, **kw: [trade()] if lawd == "11680" else []
    logs = []
    res = collect(
        conn, kinds={"trade"}, months=["202610"],
        regions={"11680": "강남구", "11140": "중구"},
        fetch_trades=fake, fetch_rents=lambda *a, **k: [], delay=0, log=logs.append,
    )
    assert (res.fetched, res.saved, res.failed) == (1, 1, [])
    assert pop_changed(conn) == [1]
    text = "\n".join(logs)
    assert "강남구: +1건 (전체 1건 중 신규)" in text
    assert "중구: +0건 (전체 0건 중 신규)" in text  # 0건 지역도 한 줄
    assert "=== 수집 완료 === 총 조회: 1건, 신규 저장: 1건, 실패: 0개" in logs[-1]


def test_collect_second_run_saves_nothing_and_skips_line_for_known(conn):
    fake = lambda lawd, ym, **kw: [trade()]
    kw = dict(kinds={"trade"}, months=["202610"], regions={"11680": "강남구"},
              fetch_trades=fake, fetch_rents=None, delay=0)
    collect(conn, **kw, log=lambda s: None)
    logs = []
    res = collect(conn, **kw, log=logs.append)
    assert (res.fetched, res.saved) == (1, 0)
    assert not any("강남구" in l for l in logs)  # saved==0 and fetched>0 → 줄 생략


def test_collect_rent_and_both(conn):
    res = collect(
        conn, kinds={"trade", "rent"}, months=["202610"], regions={"11680": "강남구"},
        fetch_trades=lambda *a, **k: [trade()], fetch_rents=lambda *a, **k: [rent()],
        delay=0, log=lambda s: None,
    )
    assert (res.fetched, res.saved) == (2, 2)
    assert conn.execute("SELECT COUNT(*) FROM rents").fetchone()[0] == 1


def test_collect_records_failed_region_and_continues(conn):
    def flaky(lawd, ym, **kw):
        if lawd == "11680":
            raise MolitError(lawd, ym, "resultCode 22")
        return [trade(lawd)]

    logs = []
    res = collect(
        conn, kinds={"trade"}, months=["202610"], regions={"11680": "강남구", "11140": "중구"},
        fetch_trades=flaky, fetch_rents=None, delay=0, log=logs.append,
    )
    assert res.failed == [("11680", "202610", "resultCode 22")]
    assert res.saved == 1
    assert "  강남구: FAILED - resultCode 22" in logs
    assert logs[-1].endswith("실패: 1개")


def test_collect_sleeps_after_every_call(conn, monkeypatch):
    sleeps = []
    monkeypatch.setattr(collect_mod.time, "sleep", sleeps.append)
    def boom(lawd, ym, **kw):
        raise MolitError(lawd, ym, "x")
    collect(conn, kinds={"trade", "rent"}, months=["202609", "202610"],
            regions={"11680": "강남구"}, fetch_trades=boom, fetch_rents=lambda *a, **k: [],
            delay=0.25, log=lambda s: None)
    assert sleeps == [0.25] * 4


def test_main_writes_changed_out(tmp_path, monkeypatch):
    monkeypatch.setattr(collect_mod, "fetch_trades", lambda *a, **k: [trade()])
    monkeypatch.setattr(collect_mod, "fetch_rents", lambda *a, **k: [])
    monkeypatch.setattr(collect_mod, "REGIONS", {"11680": "강남구"})
    out = tmp_path / "c.json"
    code = main(["--db", str(tmp_path / "d.db"), "--kind", "trade", "--months", "202610",
                 "--changed-out", str(out), "--delay", "0"])
    assert code == 0
    assert json.loads(out.read_text()) == [1]


def test_main_exit_zero_with_failures_and_prints_them(tmp_path, monkeypatch, capsys):
    def boom(lawd, ym, **kw):
        raise MolitError(lawd, ym, "429")
    monkeypatch.setattr(collect_mod, "fetch_trades", boom)
    monkeypatch.setattr(collect_mod, "REGIONS", {"11680": "강남구"})
    out = tmp_path / "c.json"
    code = main(["--db", str(tmp_path / "d.db"), "--kind", "trade", "--months", "202610",
                 "--changed-out", str(out), "--delay", "0"])
    assert code == 0
    assert json.loads(out.read_text()) == []
    assert "11680" in capsys.readouterr().out


@pytest.mark.parametrize("argv", [
    [],
    ["--months", "202610", "--daily"],
    ["--from", "202602"],
    ["--months", "2026"],
    ["--from", "202608", "--to", "202602"],
])
def test_main_bad_args_exit_2(argv):
    assert main(argv) == 2
