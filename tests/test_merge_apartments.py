from __future__ import annotations

import gzip
import json
import sqlite3
from datetime import date

import pytest

from pipeline.db import insert_trade, migrate, pop_changed, upsert_apartment
from pipeline.export_json import export
from pipeline.merge_apartments import find_rename_pairs, main, merge_pair, merge_renamed
from pipeline.molit_client import TradeItem
from pipeline.supabase_sync import delete_apartments, sync

TODAY = date(2026, 11, 4)


def _apt(c, name, jibun, build_year, apt_seq, dong="역삼동", lawd_cd="11680"):
    cur = c.execute(
        "INSERT INTO apartments(name, lawd_cd, dong, jibun, build_year, apt_seq) VALUES (?,?,?,?,?,?)",
        (name, lawd_cd, dong, jibun, build_year, apt_seq),
    )
    return cur.lastrowid


_n = [0]


def _trade(c, apt_id, amount, deal_date, area=84.97, floor=5, cancel_date=None, h=None):
    _n[0] += 1
    c.execute(
        "INSERT INTO transactions(apt_id, amount, area, floor, deal_date, unique_hash, is_canceled, cancel_date) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (apt_id, amount, area, floor, deal_date, h or f"h{_n[0]}", 1 if cancel_date else 0, cancel_date),
    )


def _rent(c, apt_id, deposit, monthly, deal_date, area=84.97, floor=5):
    _n[0] += 1
    c.execute(
        "INSERT INTO rents(apt_id, deposit, monthly_rent, area, floor, deal_date, unique_hash) "
        "VALUES (?,?,?,?,?,?,?)",
        (apt_id, deposit, monthly, area, floor, deal_date, f"r{_n[0]}"),
    )


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    migrate(c)
    return c


@pytest.fixture
def world(conn):
    c = conn
    w = {}
    # (a) 확실한 1:1
    w["L"] = _apt(c, "기흥역지웰푸르지오", "658", 2017, None)
    w["N"] = _apt(c, "기흥역더퍼스트푸르지오", "658", 2017, "41463-892")
    c.execute("UPDATE apartments SET latitude=37.1, longitude=127.1, household_count=NULL WHERE id=?", (w["L"],))
    c.execute("UPDATE apartments SET latitude=37.9, longitude=127.9, household_count=500 WHERE id=?", (w["N"],))
    _trade(c, w["L"], 50000, "2025-05-01")
    _trade(c, w["L"], 51000, "2025-06-01")
    _trade(c, w["L"], 60000, "2026-02-10", cancel_date="2026-02-20")  # N 과 중복, L 에만 해제일
    _trade(c, w["N"], 60000, "2026-02-10", area=84.9700001)
    _trade(c, w["N"], 61000, "2026-03-01")
    _rent(c, w["N"], 40000, 0, "2026-03-01")
    _rent(c, w["N"], 10000, 100, "2026-04-01")
    # (b) 1:n
    w["b_L"] = _apt(c, "주공1", "100", 2020, None)
    w["b_N1"] = _apt(c, "리오포레1단지", "100", 2020, "S-1")
    w["b_N2"] = _apt(c, "리오포레2단지", "100", 2020, "S-2")
    # (c) n:1
    w["c_L1"] = _apt(c, "한양2", "200", 1990, None)
    w["c_L2"] = _apt(c, "한양3", "200", 1990, None)
    w["c_N"] = _apt(c, "한양새이름", "200", 1990, "S-3")
    # (f) 1:1 이지만 같은 지번의 다른 단지: 같은 해들에 서로 다른 거래
    w["f_L"] = _apt(c, "한양3", "400", 1988, None)
    w["f_N"] = _apt(c, "한양2", "400", 1988, "S-6")
    _trade(c, w["f_L"], 29000, "2008-01-01")
    _trade(c, w["f_L"], 30000, "2010-01-01")
    _trade(c, w["f_L"], 31000, "2012-01-01")
    _trade(c, w["f_N"], 40000, "2009-06-01")
    _trade(c, w["f_N"], 41000, "2011-06-01")
    # (g) 1:1 이지만 L 에 N 이전 이력이 없음
    w["g_L"] = _apt(c, "옛G", "500", 2015, None)
    w["g_N"] = _apt(c, "새G", "500", 2015, "S-7")
    _trade(c, w["g_L"], 70000, "2026-03-01")
    _trade(c, w["g_N"], 70000, "2026-02-01")
    # (h) 1:1 이지만 N 에 거래가 없음
    w["h_L"] = _apt(c, "옛H", "600", 2015, None)
    w["h_N"] = _apt(c, "새H", "600", 2015, "S-8")
    _trade(c, w["h_L"], 80000, "2020-03-01")
    # (d) build_year 다름
    w["d_L"] = _apt(c, "옛D", "300", 2000, None)
    w["d_N"] = _apt(c, "새D", "300", 2001, "S-4")
    # (e) jibun 빈 값
    w["e_L"] = _apt(c, "옛E", "", 2000, None)
    w["e_N"] = _apt(c, "새E", "", 2000, "S-5")
    c.commit()
    pop_changed(c)
    return w


def test_find_pairs_only_strict_one_to_one(conn, world):
    pairs, ambiguous = find_rename_pairs(conn)
    assert pairs == [(world["L"], world["N"])]
    groups = sorted(
        (sorted(x["id"] for x in g["legacy"]), sorted(x["id"] for x in g["new"]), g["reason"])
        for g in ambiguous
    )
    assert groups == sorted([
        ([world["b_L"]], sorted([world["b_N1"], world["b_N2"]]), "one_to_many"),
        (sorted([world["c_L1"], world["c_L2"]]), [world["c_N"]], "many_to_one"),
        ([world["f_L"]], [world["f_N"]], "overlapping_distinct_trades"),
        ([world["g_L"]], [world["g_N"]], "no_older_history"),
        ([world["h_L"]], [world["h_N"]], "new_has_no_trades"),
    ])
    g = next(g for g in ambiguous if g["jibun"] == "100")
    assert set(g) == {"lawd_cd", "dong", "jibun", "build_year", "reason", "legacy", "new"}
    assert set(g["legacy"][0]) == {"id", "name", "trades"}
    assert set(g["new"][0]) == {"id", "name", "apt_seq", "trades"}


def test_merge_renamed_merges_pair(conn, world):
    L, N = world["L"], world["N"]
    assert merge_renamed(conn) == 1
    rows = conn.execute(
        "SELECT amount, deal_date, cancel_date FROM transactions WHERE apt_id=? ORDER BY deal_date", (L,)
    ).fetchall()
    assert [r[0] for r in rows] == [50000, 51000, 60000, 61000]
    assert rows[2][2] == "2026-02-20"  # 해제일이 N 행으로 옮겨짐
    assert conn.execute("SELECT is_canceled FROM transactions WHERE amount=60000").fetchone()[0] == 1
    assert conn.execute("SELECT count(*) FROM rents WHERE apt_id=?", (L,)).fetchone()[0] == 2
    a = conn.execute("SELECT * FROM apartments WHERE id=?", (L,)).fetchone()
    assert a["name"] == "기흥역더퍼스트푸르지오" and a["apt_seq"] == "41463-892"
    assert (a["latitude"], a["longitude"], a["household_count"]) == (37.1, 127.1, 500)
    assert conn.execute("SELECT count(*) FROM apartments WHERE id=?", (N,)).fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM transactions WHERE apt_id=?", (N,)).fetchone()[0] == 0
    assert [tuple(r) for r in conn.execute("SELECT old_id, canonical_id FROM apartment_aliases")] == [(N, L)]
    assert pop_changed(conn) == sorted([L, N])
    # 애매·비대상은 그대로
    for k in ("b_L", "b_N1", "b_N2", "c_L1", "c_L2", "c_N", "d_L", "d_N", "e_L", "e_N",
              "f_L", "f_N", "g_L", "g_N", "h_L", "h_N"):
        assert conn.execute("SELECT count(*) FROM apartments WHERE id=?", (world[k],)).fetchone()[0] == 1
    # 멱등
    assert merge_renamed(conn) == 0
    assert pop_changed(conn) == []


def test_migrate_runs_merge(conn, world):
    migrate(conn)
    assert conn.execute("SELECT count(*) FROM apartments WHERE id=?", (world["N"],)).fetchone()[0] == 0
    before = conn.execute("SELECT count(*) FROM transactions").fetchone()[0]
    migrate(conn)
    assert conn.execute("SELECT count(*) FROM transactions").fetchone()[0] == before
    assert conn.execute("SELECT count(*) FROM apartment_aliases").fetchone()[0] == 1


def test_merge_pair_counts_and_alias_repoint(conn, world):
    conn.execute("INSERT INTO apartment_aliases(old_id, canonical_id) VALUES (999999, ?)", (world["N"],))
    got = merge_pair(conn, world["L"], world["N"])
    assert got == {"moved_trades": 2, "dropped_dup_trades": 1, "moved_rents": 2, "dropped_dup_rents": 0}
    assert conn.execute("SELECT canonical_id FROM apartment_aliases WHERE old_id=999999").fetchone()[0] == world["L"]


def test_rent_dup_drops_legacy_row(conn, world):
    _rent(conn, world["L"], 40000, 0, "2026-03-01")
    _rent(conn, world["L"], 30000, 0, "2025-01-01")
    got = merge_pair(conn, world["L"], world["N"])
    assert got["moved_rents"] == 2 and got["dropped_dup_rents"] == 1
    assert conn.execute("SELECT count(*) FROM rents WHERE apt_id=?", (world["L"],)).fetchone()[0] == 3


def _item(**kw):
    base = dict(apt_name="기흥역더퍼스트푸르지오", apt_seq="41463-892", lawd_cd="11680", dong="역삼동",
                jibun="658", build_year=2017, deal_date="2025-05-01", amount=50000, area=84.97, floor=5,
                cancel_date=None)
    base.update(kw)
    return TradeItem(**base)


def test_reinsert_after_merge_is_dedup(conn, world):
    merge_renamed(conn)
    pop_changed(conn)
    L = world["L"]
    apt_id = upsert_apartment(conn, name="기흥역더퍼스트푸르지오", lawd_cd="11680", dong="역삼동",
                              jibun="658", build_year=2017, apt_seq="41463-892")
    assert apt_id == L
    assert insert_trade(conn, L, _item()) is False  # 옛 이름 해시로 들어간 L 행과 같은 거래
    assert conn.execute("SELECT count(*) FROM transactions WHERE apt_id=?", (L,)).fetchone()[0] == 4
    assert pop_changed(conn) == []
    # 해제일만 새로 생긴 경우는 채운다
    assert insert_trade(conn, L, _item(cancel_date="2025-05-10")) is True
    assert conn.execute("SELECT cancel_date FROM transactions WHERE amount=50000").fetchone()[0] == "2025-05-10"
    assert conn.execute("SELECT count(*) FROM transactions WHERE apt_id=?", (L,)).fetchone()[0] == 4


def test_upsert_attaches_renamed_to_sole_legacy(conn):
    L = upsert_apartment(conn, name="옛이름", lawd_cd="11680", dong="역삼동", jibun="9",
                         build_year=2010, apt_seq=None)
    pop_changed(conn)
    got = upsert_apartment(conn, name="새이름", lawd_cd="11680", dong="역삼동", jibun="9",
                           build_year=2010, apt_seq="11680-77")
    assert got == L
    a = conn.execute("SELECT name, apt_seq FROM apartments WHERE id=?", (L,)).fetchone()
    assert tuple(a) == ("새이름", "11680-77")
    assert pop_changed(conn) == [L]


def test_upsert_does_not_attach_when_ambiguous(conn):
    a = upsert_apartment(conn, name="A", lawd_cd="11680", dong="역삼동", jibun="9", build_year=2010, apt_seq=None)
    b = upsert_apartment(conn, name="B", lawd_cd="11680", dong="역삼동", jibun="9", build_year=2010, apt_seq=None)
    c = upsert_apartment(conn, name="C", lawd_cd="11680", dong="역삼동", jibun="9", build_year=2010, apt_seq="X-1")
    assert c not in (a, b)
    # 다른 build_year, apt_seq 없는 새 항목은 붙이지 않는다
    d = upsert_apartment(conn, name="D", lawd_cd="11680", dong="역삼동", jibun="8", build_year=2010, apt_seq=None)
    e = upsert_apartment(conn, name="E", lawd_cd="11680", dong="역삼동", jibun="8", build_year=2010, apt_seq=None)
    assert d != e
    f = upsert_apartment(conn, name="F", lawd_cd="11680", dong="역삼동", jibun="7", build_year=2010, apt_seq=None)
    g = upsert_apartment(conn, name="G", lawd_cd="11680", dong="역삼동", jibun="7", build_year=2011, apt_seq="X-2")
    assert f != g


def test_upsert_does_not_attach_when_other_seq_present(conn):
    L = upsert_apartment(conn, name="주공", lawd_cd="11680", dong="역삼동", jibun="5", build_year=2020, apt_seq=None)
    conn.execute("INSERT INTO apartments(name, lawd_cd, dong, jibun, build_year, apt_seq) "
                 "VALUES ('1단지','11680','역삼동','5',2020,'S-1')")
    got = upsert_apartment(conn, name="2단지", lawd_cd="11680", dong="역삼동", jibun="5",
                           build_year=2020, apt_seq="S-2")
    assert got != L


def _read(path):
    with gzip.open(path) as f:
        return json.loads(f.read())


def test_export_writes_moved_stub(conn, world, tmp_path):
    merge_renamed(conn)
    L, N = world["L"], world["N"]
    keys = export(conn, str(tmp_path), apt_ids=[L, N], today=TODAY)
    assert f"v1/apt/{N}/trade.json" in keys and f"v1/apt/{N}/rent.json" in keys
    assert _read(tmp_path / f"v1/apt/{N}/trade.json.gz") == {"moved_to": L}
    assert _read(tmp_path / f"v1/apt/{N}/rent.json.gz") == {"moved_to": L}
    assert _read(tmp_path / f"v1/apt/{L}/trade.json.gz")["apartment"]["name"] == "기흥역더퍼스트푸르지오"
    out2 = tmp_path / "all"
    keys = export(conn, str(out2), apt_ids=None, today=TODAY)
    assert _read(out2 / f"v1/apt/{N}/trade.json.gz") == {"moved_to": L}


class FakeResp:
    status_code = 204
    text = ""


class FakeSession:
    def __init__(self):
        self.calls = []

    def delete(self, url, headers=None):
        self.calls.append({"url": url, "headers": headers})
        return FakeResp()


def test_delete_apartments_request():
    s = FakeSession()
    assert delete_apartments([3, 1], url="https://x.co/", key="K", session=s) == 2
    assert s.calls[0]["url"] == "https://x.co/rest/v1/apartments?id=in.(1,3)"
    assert s.calls[0]["headers"]["apikey"] == "K"
    assert delete_apartments([], url="u", key="k", session=s) == 0
    assert len(s.calls) == 1


def test_sync_deletes_missing_ids(conn, world):
    merge_renamed(conn)
    L, N = world["L"], world["N"]
    got = {"apts": [], "del": []}

    def ua(rows):
        got["apts"] += [r["id"] for r in rows]
        return len(rows)

    def da(ids):
        got["del"] += list(ids)
        return len(ids)

    sync(conn, [L, N], TODAY, upsert_apts=ua, upsert_regs=lambda r: len(r), delete_apts=da)
    assert got == {"apts": [L], "del": [N]}
    got["apts"].clear(); got["del"].clear()
    sync(conn, None, TODAY, upsert_apts=ua, upsert_regs=lambda r: len(r), delete_apts=da)
    assert got["del"] == [N] and N not in got["apts"]


def test_cli_dry_run_and_apply(tmp_path, world, conn):
    db = tmp_path / "t.db"
    disk = sqlite3.connect(db)
    conn.backup(disk)
    disk.close()
    report = tmp_path / "r.json"
    assert main(["--db", str(db), "--report", str(report), "--dry-run"]) == 0
    r = json.loads(report.read_text())
    assert [[p["keep_id"], p["drop_id"]] for p in r["pairs"]] == [[world["L"], world["N"]]]
    assert len(r["ambiguous"]) == 5
    chk = sqlite3.connect(db)
    assert chk.execute("SELECT count(*) FROM apartments WHERE id=?", (world["N"],)).fetchone()[0] == 1
    chk.close()
    assert main(["--db", str(db), "--report", str(report)]) == 0
    chk = sqlite3.connect(db)
    assert chk.execute("SELECT count(*) FROM apartments WHERE id=?", (world["N"],)).fetchone()[0] == 0
    chk.close()
