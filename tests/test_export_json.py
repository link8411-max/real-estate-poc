from __future__ import annotations

import gzip
import json
from datetime import date

import pytest

from pipeline import export_json
from pipeline.db import connect, migrate, upsert_apartment
from pipeline.export_json import (
    build_apt_rent, build_apt_trade, build_meta, build_region, build_search_index, build_sitemap_index,
    build_stats, export, main,
)
from pipeline.summary import apartment_summary

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
        "INSERT INTO rents(apt_id, deposit, monthly_rent, area, floor, deal_date, contract_type, "
        "use_rr_right, pre_deposit, pre_monthly_rent, unique_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (apt_id, deposit, monthly, area, 5, deal_date, "신규", 0, None, None,
         f"r{apt_id}-{deposit}-{monthly}-{deal_date}"),
    )


@pytest.fixture
def conn(tmp_path):
    c = connect(str(tmp_path / "t.db"))
    migrate(c)
    # id 1: 강남 래미안 (매매+전세), id 2: 마포 (매매), id 3: 마포 월세만
    a1 = upsert_apartment(c, name="래미안", lawd_cd="11680", dong="역삼동", jibun="1",
                          build_year=2000, apt_seq="A1")
    a2 = upsert_apartment(c, name="마포자이", lawd_cd="11440", dong="아현동", jibun="2",
                          build_year=2010, apt_seq="A2")
    a3 = upsert_apartment(c, name="월세빌", lawd_cd="11440", dong="합정동", jibun="3",
                          build_year=2005, apt_seq="A3")
    assert (a1, a2, a3) == (1, 2, 3)
    _trade(c, 1, 100000, 84.0, "2026-09-01")
    _trade(c, 1, 120000, 84.0, "2026-10-01", "2026-10-05")  # 취소
    _trade(c, 1, 90000, 84.0, "2025-05-01")  # 직전 12개월
    _trade(c, 2, 50000, 59.0, "2026-10-10")
    _rent(c, 1, 60000, 0, 84.0, "2026-10-02")
    _rent(c, 3, 30000, 0, 59.0, "2026-10-01")
    c.commit()
    return c


def test_build_apt_trade_keeps_cancelled_in_list_but_not_in_stats(conn):
    d = build_apt_trade(conn, 1, TODAY)
    assert d["apartment"] == {
        "id": 1, "name": "래미안", "dong": "역삼동", "lawd_cd": "11680", "region_name": "서울 강남구",
        "city": "서울", "jibun": "1", "build_year": 2000, "apt_seq": "A1", "lat": None, "lng": None,
        "area_types": [],
    }
    assert [t["deal_date"] for t in d["transactions"]] == ["2026-10-01", "2026-09-01", "2025-05-01"]
    assert d["transactions"][0] == {
        "id": 2, "amount": 120000, "area": 84.0, "floor": 5, "deal_date": "2026-10-01",
        "cancel_date": "2026-10-05", "grp": 84, "direct": False,
    }
    assert d["area_stats"][0]["count"] == 2 and d["area_stats"][0]["max_amount"] == 100000
    assert "metrics" in d


def test_build_apt_rent_fields(conn):
    d = build_apt_rent(conn, 1, TODAY)
    assert d["rents"] == [{
        "id": 1, "deposit": 60000, "monthly_rent": 0, "area": 84.0, "floor": 5,
        "deal_date": "2026-10-02", "contract_type": "신규", "use_rr_right": False,
        "pre_deposit": None, "pre_monthly_rent": None, "grp": 84,
    }]
    assert d["apartment"]["id"] == 1 and d["rent_area_stats"][0]["jeonse_count"] == 1


def test_export_changed_only_writes_only_those_apts_plus_shared_files(conn, tmp_path):
    keys = export(conn, str(tmp_path), apt_ids=[1], today=TODAY)
    assert "v1/apt/1/trade.json" in keys and "v1/apt/2/trade.json" not in keys
    assert {"v1/stats/summary.json", "v1/search/index.json", "v1/meta.json"} <= set(keys)
    assert "v1/region/11680.json" in keys and "v1/region/11440.json" not in keys
    assert (tmp_path / "v1/apt/1/trade.json.gz").exists()
    with gzip.open(tmp_path / "v1/apt/1/trade.json.gz", "rt", encoding="utf-8") as f:
        assert json.load(f)["apartment"]["name"] == "래미안"


def test_export_all_and_summary_computed_once(conn, tmp_path, monkeypatch):
    calls: list[int] = []
    real = export_json.apartment_summary

    def spy(c, apt_id, today):
        calls.append(apt_id)
        return real(c, apt_id, today)

    monkeypatch.setattr(export_json, "apartment_summary", spy)
    keys = export(conn, str(tmp_path), apt_ids=None, today=TODAY)
    assert sorted(calls) == [1, 2, 3]
    assert {"v1/region/11680.json", "v1/region/11440.json", "v1/apt/3/rent.json"} <= set(keys)
    assert len([k for k in keys if k.startswith("v1/region/")]) == 83


def test_export_rent_only_apartment(conn, tmp_path):
    keys = export(conn, str(tmp_path), apt_ids=[3], today=TODAY)
    assert "v1/apt/3/trade.json" in keys
    with gzip.open(tmp_path / "v1/apt/3/trade.json.gz", "rt", encoding="utf-8") as f:
        d = json.load(f)
    assert d["transactions"] == [] and d["area_stats"] == []


def test_search_index_shape(conn):
    assert build_search_index(conn)[0] == [1, "래미안", "역삼동", "11680", 2000]


def test_build_region(conn):
    d = build_region(conn, "11440", TODAY)
    assert d["code"] == "11440" and d["name"] == "마포구" and d["city"] == "서울"
    assert d["succeeded_by"] is None
    assert [a["id"] for a in d["apartments"]] == [2, 3]  # trade_count desc
    assert set(d["apartments"][0]) == {
        "id", "name", "dong", "build_year", "trade_count", "latest_trade_amount",
        "latest_trade_date", "latest_jeonse_deposit", "lat", "lng",
        "latest_supply_min", "latest_supply_max", "latest_supply_approx"}


def test_region_latest_trade_groups_area_by_floor(conn):
    # 같은 날 59.53㎡(나중 id)와 59.4㎡: 버림이면 같은 59 평형 → 최신(id 큰) 59.53 거래가 대표.
    # 반올림이면 60/59 로 갈려 작은 평형(59.4) 거래가 대표가 된다.
    _trade(conn, 3, 41000, 59.4, "2026-10-20")
    _trade(conn, 3, 43000, 59.53, "2026-10-20")
    conn.commit()
    apt = next(a for a in build_region(conn, "11440", TODAY)["apartments"] if a["id"] == 3)
    assert apt["trade_count"] == 2 and apt["latest_trade_amount"] == 43000


def test_build_stats_recent_and_region_yoy(conn):
    s = build_stats(conn, TODAY)
    assert s["total_apartments"] == 3
    assert s["recent_transactions_30d"] == 1  # 10-10 만 (10-01 은 취소, 09-01 은 30일 밖)
    assert s["data_range"] == {"min_date": "2025-05-01", "max_date": "2026-10-10"}
    assert [r["apt_id"] for r in s["recent"]] == [2, 1, 1]
    assert s["recent"][0] == {"apt_id": 2, "name": "마포자이", "region_name": "서울 마포구",
                              "amount": 50000, "area": 59.0, "deal_date": "2026-10-10", "supply": None}
    assert len(s["regions"]) == 83
    gn = next(r for r in s["regions"] if r["code"] == "11680")
    assert gn["name"] == "강남구" and gn["city"] == "서울"
    assert gn["avg_amount"] == 100000 and gn["tx_count_12m"] == 1
    assert gn["yoy_change"] == round((100000 / 90000 - 1) * 100, 1)
    mp = next(r for r in s["regions"] if r["code"] == "11440")
    assert mp["avg_amount"] == 50000 and mp["yoy_change"] is None
    assert next(r for r in s["regions"] if r["code"] == "11110")["avg_amount"] is None
    assert [r["code"] for r in s["top_up"]] == ["11680"]
    assert [r["code"] for r in s["top_down"]] == ["11680"]


def test_build_meta(conn):
    m = build_meta(conn, TODAY)
    assert m["apartment_count"] == 3 and m["trade_count"] == 4 and m["rent_count"] == 2


def test_cli_changed_writes_keys_json(conn, tmp_path):
    db = tmp_path / "t.db"
    ids = tmp_path / "changed.json"
    ids.write_text("[2]")
    out = tmp_path / "out"
    conn.commit()
    assert main(["--db", str(db), "--out", str(out), "--changed", str(ids), "--today", "2026-10-26"]) == 0
    keys = json.loads((out / "keys.json").read_text())
    assert "v1/apt/2/trade.json" in keys and "v1/apt/1/trade.json" not in keys


def test_cli_bad_args_exit_2(tmp_path):
    assert main(["--db", "x", "--out", str(tmp_path)]) == 2


def test_changed_export_does_not_summarize_unchanged_apartments(conn, tmp_path, monkeypatch):
    calls: list[int] = []
    real = export_json.apartment_summary
    monkeypatch.setattr(export_json, "apartment_summary",
                        lambda c, i, t: (calls.append(i), real(c, i, t))[1])
    export(conn, str(tmp_path), apt_ids=[2], today=TODAY)  # 11440 에는 3번도 있다
    assert calls == [2]
    with gzip.open(tmp_path / "v1/region/11440.json.gz", "rt", encoding="utf-8") as f:
        assert {a["id"] for a in json.load(f)["apartments"]} == {2, 3}


def test_slim_group_by_matches_apartment_summary(conn):
    _trade(conn, 1, 70000, 59.0, "2026-09-01")  # 최신일 동률, 다른 평형
    _trade(conn, 2, 51000, 59.0, "2026-10-10")
    _rent(conn, 2, 20000, 0, 59.0, "2026-10-11")
    _rent(conn, 2, 5000, 50, 59.0, "2026-10-12")
    conn.commit()
    by_id = {a["id"]: a for code in ("11680", "11440")
             for a in build_region(conn, code, TODAY)["apartments"]}
    for i in (1, 2, 3):
        s = apartment_summary(conn, i, TODAY)
        for k in ("name", "dong", "build_year", "trade_count", "latest_trade_amount",
                  "latest_trade_date", "latest_jeonse_deposit", "lat", "lng"):
            assert by_id[i][k] == s[k], (i, k)


def test_write_gz_is_deterministic(tmp_path):
    export_json.write_gz(str(tmp_path / "a.json.gz"), {"k": 1})
    export_json.write_gz(str(tmp_path / "b.json.gz"), {"k": 1})
    assert (tmp_path / "a.json.gz").read_bytes() == (tmp_path / "b.json.gz").read_bytes()


@pytest.mark.parametrize("content", [None, "not json", '["a"]', '{"x":1}'])
def test_cli_bad_changed_file_exit_2(tmp_path, content, capsys):
    f = tmp_path / "c.json"
    if content is not None:
        f.write_text(content)
    assert main(["--db", str(tmp_path / "t.db"), "--out", str(tmp_path / "o"), "--changed", str(f)]) == 2
    assert "--changed" in capsys.readouterr().err


def test_build_apt_rent_use_rr_right_is_boolean_or_null(conn):
    conn.execute("UPDATE rents SET use_rr_right = 1 WHERE apt_id = 1")
    conn.execute(
        "INSERT INTO rents(apt_id, deposit, monthly_rent, area, floor, deal_date, contract_type, "
        "use_rr_right, unique_hash) VALUES (1, 1, 0, 84.0, 5, '2026-10-03', '갱신', NULL, 'rx')"
    )
    vals = {r["deal_date"]: r["use_rr_right"] for r in build_apt_rent(conn, 1, TODAY)["rents"]}
    assert vals["2026-10-02"] is True and vals["2026-10-03"] is None


def test_export_writes_canceled_recent(conn, tmp_path):
    keys = export(conn, str(tmp_path), apt_ids=[2], today=TODAY)
    assert "v1/canceled/recent.json" in keys
    with gzip.open(tmp_path / "v1/canceled/recent.json.gz", "rt", encoding="utf-8") as f:
        doc = json.load(f)
    assert doc["since"] == "2026-09-26"
    assert [(i["amount"], i["prev_max"]) for i in doc["items"]] == [(120000, 100000)]


def _since_of(out):
    with gzip.open(out / "v1/canceled/recent.json.gz", "rt", encoding="utf-8") as f:
        return json.load(f)["since"]


def test_cli_default_today_is_kst_and_override_wins(conn, tmp_path, monkeypatch):
    db = tmp_path / "t.db"
    ids = tmp_path / "changed.json"
    ids.write_text("[2]")
    conn.commit()
    monkeypatch.setattr(export_json, "kst_today", lambda: date(2026, 11, 5))
    out1 = tmp_path / "o1"
    assert main(["--db", str(db), "--out", str(out1), "--changed", str(ids)]) == 0
    assert _since_of(out1) == "2026-10-06"  # KST 11-05 - 30일
    out2 = tmp_path / "o2"
    assert main(["--db", str(db), "--out", str(out2), "--changed", str(ids), "--today", "2026-10-26"]) == 0
    assert _since_of(out2) == "2026-09-26"


def test_export_writes_highs_recent(conn, tmp_path):
    keys = export(conn, str(tmp_path), apt_ids=[2], today=TODAY)
    assert "v1/highs/recent.json" in keys
    with gzip.open(tmp_path / "v1/highs/recent.json.gz", "rt", encoding="utf-8") as f:
        doc = json.load(f)
    assert doc["since"] == "2026-09-26"
    assert isinstance(doc["items"], list)


def _area_type(conn, apt_id, excl, supply, approx=0):
    conn.execute(
        "INSERT INTO apartment_area_types(apt_id, excl_area, supply_area, source, approx, sample_n, updated_at)"
        " VALUES (?,?,?,?,?,?,?)", (apt_id, excl, supply, "register", approx, 10, "x"))


def test_apartment_block_has_area_types(conn):
    _area_type(conn, 1, 84.8, 111.52)
    _area_type(conn, 1, 59.9, 80.0, approx=1)
    conn.commit()
    d = build_apt_trade(conn, 1, TODAY)
    assert d["apartment"]["area_types"] == [
        {"excl": 59.9, "supply": 80.0, "approx": True},
        {"excl": 84.8, "supply": 111.52, "approx": False},
    ]
    assert build_apt_rent(conn, 1, TODAY)["apartment"]["area_types"] == d["apartment"]["area_types"]


def test_apartment_block_empty_area_types(conn):
    assert build_apt_trade(conn, 1, TODAY)["apartment"]["area_types"] == []


def test_region_entry_latest_supply(conn):
    _trade(conn, 3, 41000, 84.0, "2026-10-20")
    _area_type(conn, 3, 84.0, 111.52)
    conn.commit()
    apt = next(a for a in build_region(conn, "11440", TODAY)["apartments"] if a["id"] == 3)
    assert (apt["latest_supply_min"], apt["latest_supply_max"], apt["latest_supply_approx"]) == (33, 33, False)


def test_build_stats_recent_has_supply(conn):
    _area_type(conn, 2, 59.0, 80.0, approx=1)
    conn.commit()
    s = build_stats(conn, TODAY)
    assert s["recent"][0]["supply"] == {"min": 24, "max": 24, "approx": True}
    assert s["recent"][1]["supply"] is None


def test_trade_json_has_grp_and_direct(tmp_path):
    c = connect(str(tmp_path / "g.db"))
    migrate(c)
    a = upsert_apartment(c, name="B", lawd_cd="11680", dong="역삼동", jibun="9", build_year=2000, apt_seq=None)
    _trade(c, a, 90000, 85.01, "2026-05-01")
    _trade(c, a, 100000, 84.97, "2026-09-01")
    c.execute("UPDATE transactions SET dealing_gbn='직거래' WHERE amount=100000")
    _rent(c, a, 50000, 0, 84.97, "2026-09-02")  # 묶음 지도는 매매+전월세 면적을 함께 센다
    c.commit()
    d = build_apt_trade(c, a, TODAY)
    assert [(t["grp"], t["direct"]) for t in d["transactions"]] == [(84, True), (84, False)]
    assert [s["area"] for s in d["area_stats"]] == [84]
    r = build_apt_rent(c, a, TODAY)
    assert [x["grp"] for x in r["rents"]] == [84]


def test_region_latest_supply_uses_group(tmp_path):
    c = connect(str(tmp_path / "s.db"))
    migrate(c)
    a = upsert_apartment(c, name="B", lawd_cd="11680", dong="역삼동", jibun="9", build_year=2000, apt_seq=None)
    _trade(c, a, 90000, 84.97, "2026-05-01")
    _trade(c, a, 91000, 84.97, "2026-06-01")
    _trade(c, a, 100000, 85.01, "2026-09-01")
    _area_type(c, a, 85.01, 112.4)
    c.commit()
    entry = build_region(c, "11680", TODAY)["apartments"][0]
    assert entry["latest_trade_amount"] == 100000 and entry["latest_supply_min"] == 34


def test_trade_json_share_field(tmp_path):
    c = connect(str(tmp_path / "sh.db"))
    migrate(c)
    a = upsert_apartment(c, name="B", lawd_cd="11680", dong="역삼동", jibun="9", build_year=2000, apt_seq=None)
    _trade(c, a, 90000, 84.97, "2026-03-01")
    _trade(c, a, 100000, 84.97, "2026-10-20")
    c.commit()
    d = build_apt_trade(c, a, TODAY)
    by_amount = {t["amount"]: t for t in d["transactions"]}
    assert "share" not in by_amount[90000]
    assert by_amount[100000]["share"] == {
        "badge": "high", "base": 90000, "diff": 10000, "pct": 11.1, "shareable": True, "held": False,
    }


def test_sitemap_index_uses_latest_change_date(conn):
    # 거래 created_at 이 서로 다른 단지 1: created_at 2026-10-20, 거래·전월세 deal_date 는 그보다 이전
    conn.execute("UPDATE transactions SET created_at='2026-10-03 01:00:00' WHERE apt_id=1")
    conn.execute("UPDATE transactions SET created_at='2026-10-20 09:00:00' WHERE apt_id=1 AND deal_date='2026-09-01'")
    conn.execute("UPDATE rents SET created_at='2026-10-25 00:00:00' WHERE apt_id=1")
    # 단지 2: created_at 없음 → deal_date 로 대체
    conn.execute("UPDATE transactions SET created_at=NULL WHERE apt_id=2")
    # 단지 3: 전월세만, created_at 없음 → deal_date
    conn.execute("UPDATE rents SET created_at=NULL WHERE apt_id=3")
    conn.commit()
    assert build_sitemap_index(conn) == [[1, "2026-10-25"], [2, "2026-10-10"], [3, "2026-10-01"]]


def test_sitemap_index_cancel_date_counts_and_empty_apt_is_null(conn):
    a4 = upsert_apartment(conn, name="빈단지", lawd_cd="11440", dong="망원동", jibun="4",
                          build_year=2001, apt_seq="A4")
    conn.execute("UPDATE transactions SET created_at='2026-10-03 00:00:00' WHERE apt_id=1")
    conn.execute("UPDATE rents SET created_at='2026-10-04 00:00:00' WHERE apt_id=1")
    conn.commit()
    rows = dict(build_sitemap_index(conn))
    assert rows[1] == "2026-10-05"  # 해제일(2026-10-05)이 더 늦다
    assert rows[a4] is None


def test_export_writes_sitemap_index(conn, tmp_path):
    for ids in ([1], None):
        out = tmp_path / ("o1" if ids else "o2")
        keys = export(conn, str(out), apt_ids=ids, today=TODAY)
        assert "v1/sitemap/apartments.json" in keys
        data = json.loads(gzip.decompress((out / "v1/sitemap/apartments.json.gz").read_bytes()))
        assert [r[0] for r in data] == [1, 2, 3]
