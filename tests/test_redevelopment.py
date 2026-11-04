from __future__ import annotations

import gzip
import json
from datetime import date

import pytest

from pipeline.db import connect, migrate
from pipeline.redevelopment import (
    build_zones_json,
    fill_geocode_cache,
    load_zones,
    match_apartments,
    normalize_name,
)

HEADER = "시도,시군구,구역명칭,현 사업추진단계,사업유형,사업시행자,공급 예정 세대수\n"


def _csv(tmp_path, rows, encoding="utf-8"):
    p = tmp_path / "z.csv"
    p.write_bytes((HEADER + "\n".join(rows) + "\n").encode(encoding))
    return str(p)


@pytest.fixture
def conn(tmp_path):
    c = connect(str(tmp_path / "r.db"))
    migrate(c)
    return c


def _apt(conn, name, lawd, dong="d", jibun="1", lat=37.5, lng=127.0):
    conn.execute(
        "INSERT INTO apartments(name, lawd_cd, dong, jibun, latitude, longitude) VALUES (?,?,?,?,?,?)",
        (name, lawd, dong, jibun, lat, lng),
    )
    conn.commit()
    return conn.execute("SELECT max(id) FROM apartments").fetchone()[0]


def _zone(name, lawd="11680", group="재건축", sido="서울특별시", sigungu="강남구"):
    return {"zone_id": name, "sido": sido, "sigungu": sigungu, "lawd_cd": lawd, "name": name,
            "type_group": group, "lat": None, "lng": None, "geo": None, "match": None, "apt_ids": []}


# ---- load_zones ----

def test_load_zones_parses_prefixes_and_nulls(tmp_path):
    p = _csv(tmp_path, [
        "서울특별시,강남구 ,은마,6)관리처분인가,3)재건축(공동주택),1)조합, 4424 ",
        "서울특별시,마포구,아현1,2)정비구역지정,1)재개발(주택정비),2)토지등소유자,해당없음",
        "서울특별시,종로구,창신,3)추진위구성,5)주거환경개선,\"3)공공(지자체/시장,군수 등)\",0",
        "경기도,성남수정구,신흥,17)사업시행자지정,2)재개발(도시정비),,  ",
        "부산광역시,해운대구,우동,7)착공,1)재개발(주택정비),1)조합,100",
    ])
    z = {x["name"]: x for x in load_zones(p)}
    assert set(z) == {"은마", "아현1", "창신", "신흥"}  # 수도권만
    a = z["은마"]
    assert (a["sido"], a["sigungu"], a["lawd_cd"]) == ("서울특별시", "강남구", "11680")
    assert (a["stage"], a["stage_order"]) == ("관리처분인가", 6)
    assert (a["type"], a["type_group"], a["operator"], a["households"]) == ("재건축(공동주택)", "재건축", "조합", 4424)
    assert z["아현1"]["households"] is None and z["아현1"]["type_group"] == "재개발"
    assert z["창신"]["households"] == 0 and z["창신"]["type_group"] == "주거환경개선"  # 0 과 null 구분
    assert z["창신"]["operator"] == "공공(지자체/시장,군수 등)"
    s = z["신흥"]
    assert (s["stage"], s["stage_order"]) == ("사업시행자지정", 4.5)
    assert s["households"] is None and s["operator"] is None
    assert s["lawd_cd"] == "41131"


def test_load_zones_reads_cp949_and_unmapped_sigungu_kept(tmp_path):
    p = _csv(tmp_path, [
        "인천광역시,서구,가좌,4)조합설립인가,1)재개발(주택정비),1)조합,500",  # 폐지 코드: 매칭 불가
        "경기도,용인기흥구,구갈,5)사업시행인가,3)재건축(공동주택),1)조합,300",
    ], encoding="cp949")
    z = {x["name"]: x for x in load_zones(p)}
    assert z["가좌"]["lawd_cd"] is None and z["가좌"]["sigungu"] == "서구"  # 건너뛰지 않고 남김
    assert z["구갈"]["lawd_cd"] == "41463"


def test_zone_id_stable_and_distinct(tmp_path):
    p = _csv(tmp_path, [
        "서울특별시,강남구,은마,6)관리처분인가,3)재건축(공동주택),1)조합,10",
        "서울특별시,서초구,은마,6)관리처분인가,3)재건축(공동주택),1)조합,10",
    ])
    a, b = load_zones(p), load_zones(p)
    assert [x["zone_id"] for x in a] == [x["zone_id"] for x in b]
    assert len(a[0]["zone_id"]) == 12 and a[0]["zone_id"] != a[1]["zone_id"]


# ---- normalize / match ----

def test_normalize_name():
    assert normalize_name("개포 주공1단지 아파트") == "개포주공1단지"
    assert normalize_name("래미안 APT(1차)") == "래미안"
    assert normalize_name("은마Ⅱ") == "은마2"


def test_match_exact_and_contains_unique(conn):
    a1 = _apt(conn, "은마", "11680")
    a2 = _apt(conn, "대치삼성래미안", "11680")
    zs = [_zone("은마아파트"), _zone("삼성래미안")]
    stats = match_apartments(conn, zs)
    assert zs[0]["match"] == "exact" and zs[0]["apt_ids"] == [a1]
    assert zs[1]["match"] == "contains" and zs[1]["apt_ids"] == [a2]
    assert stats["exact"] == 1 and stats["contains"] == 1 and stats["ambiguous"] == 0


def test_match_contains_ambiguous_is_not_matched(conn):
    _apt(conn, "대치삼성래미안", "11680")
    _apt(conn, "역삼삼성래미안", "11680", dong="e")
    z = [_zone("삼성래미안")]
    stats = match_apartments(conn, z)
    assert z[0]["match"] is None and z[0]["apt_ids"] == [] and z[0]["lat"] is None
    assert stats["ambiguous"] == 1


def test_match_same_name_other_dong_duplicates_not_matched(conn):
    _apt(conn, "삼성", "11680", dong="a")
    _apt(conn, "삼성", "11680", dong="b")
    z = [_zone("삼성아파트")]
    match_apartments(conn, z)
    assert z[0]["match"] is None


def test_match_only_same_lawd_and_type_group(conn):
    _apt(conn, "은마", "11650")  # 다른 구
    z = [_zone("은마"), _zone("은마", group="재개발"), _zone("은마", lawd=None)]
    match_apartments(conn, z)
    assert [x["match"] for x in z] == [None, None, None]


def test_match_number_boundary_and_short_names(conn):
    _apt(conn, "개포주공10단지", "11680")
    _apt(conn, "가나", "11680", dong="x")
    z = [_zone("개포주공1단지"), _zone("가나다라마")]  # 1 vs 10 / 2글자 단지명 포함은 불인정
    match_apartments(conn, z)
    assert [x["match"] for x in z] == [None, None]


def test_match_parenthesized_names_and_multi_apts(conn):
    a1 = _apt(conn, "매탄주공4단지", "41117", lat=37.0, lng=127.0)
    a2 = _apt(conn, "매탄주공5단지", "41117", dong="e", lat=37.2, lng=127.2)
    z = [_zone("영통2구역(매탄주공4,5단지)", lawd="41117", sido="경기도", sigungu="수원영통구")]
    match_apartments(conn, z)
    assert z[0]["apt_ids"] == [a1, a2]
    assert z[0]["lat"] == pytest.approx(37.1) and z[0]["lng"] == pytest.approx(127.1)
    assert z[0]["match"] == "exact"


def test_match_retired_predecessor_code(conn):
    a = _apt(conn, "병점주공", "41590")  # 폐지 화성시 코드로 남은 단지
    z = [_zone("병점주공", lawd="41595", sido="경기도")]
    match_apartments(conn, z)
    assert z[0]["apt_ids"] == [a]


# ---- geocoding ----

def _fake(docs, calls):
    """docs: {(kind, query): doc}. 없으면 결과 없음(None)."""
    def g(kind, query):
        calls.append((kind, query))
        return docs.get((kind, query))
    return g


def _doc(addr, y="37.5", x="127.0", name="장소"):
    return {"place_name": name, "address_name": addr, "road_address_name": "", "y": y, "x": x}


def _one(tmp_path, row, docs, calls=None):
    p = _csv(tmp_path, [row])
    cache = tmp_path / "c.json"
    fill_geocode_cache(load_zones(p), str(cache), geocoder=_fake(docs, [] if calls is None else calls), delay=0)
    c = connect(str(tmp_path / "e.db"))
    migrate(c)
    return build_zones_json(c, p, date(2026, 11, 4), cache_path=str(cache))["zones"][0]


REDEV = "서울특별시,마포구,{n},2)정비구역지정,1)재개발(주택정비),1)조합,100"


def test_geocode_accepts_first_result_in_same_sigungu(tmp_path):
    z = _one(tmp_path, REDEV.format(n="아현1"),
             {("keyword", "서울 마포구 아현1"): _doc("서울 마포구 아현동 1-1", "37.55", "126.95")})
    assert (z["lat"], z["lng"], z["geo"]) == (37.55, 126.95, "kakao_name")


def test_geocode_rejects_other_sigungu_and_failure_stays_in_list(tmp_path):
    z = _one(tmp_path, REDEV.format(n="아현1"), {("keyword", "서울 마포구 아현1"): _doc("서울 서대문구 북아현동 1")})
    assert z["lat"] is None and z["geo"] is None and z["name"] == "아현1"  # 목록에는 남는다


def test_geocode_fallback_paren_suffix_lot_address(tmp_path):
    z = _one(tmp_path, '경기도,수원영통구,"영통2구역(매탄주공4,5단지)",2)정비구역지정,3)재건축(공동주택),1)조합,10',
             {("keyword", "경기 수원영통구 매탄주공4단지"): _doc("경기 수원시 영통구 매탄동 1")})
    assert z["geo"] == "kakao_paren"
    z = _one(tmp_path, "경기도,고양덕양구,능곡5,2)정비구역지정,1)재개발(주택정비),1)조합,10",
             {("keyword", "경기 고양덕양구 능곡5구역"): _doc("경기 고양시 덕양구 능곡동 1")})
    assert z["geo"] == "kakao_suffix"
    z = _one(tmp_path, "경기도,수원팔달구,111-3,2)정비구역지정,1)재개발(주택정비),1)조합,10",
             {("keyword", "경기 수원시 111-3구역"): _doc("경기 수원시 팔달구 인계동 1")})
    assert z["geo"] == "kakao_lot"
    z = _one(tmp_path, "경기도,용인처인구,단구동14통,2)정비구역지정,1)재개발(주택정비),1)조합,10",
             {("address", "경기 용인처인구 단구동"): _doc("경기 용인시 처인구 단구동")})
    assert z["geo"] == "kakao_address"


def test_geocode_cache_reused_including_failures(tmp_path):
    p = _csv(tmp_path, [REDEV.format(n="아현1"), REDEV.format(n="무명")])
    cache = tmp_path / "c.json"
    calls = []
    g = _fake({("keyword", "서울 마포구 아현1"): _doc("서울 마포구 아현동 1")}, calls)
    fill_geocode_cache(load_zones(p), str(cache), geocoder=g, delay=0)
    assert ("keyword", "서울 마포구 아현1") in calls and ("keyword", "서울 마포구 무명") in calls
    n = len(calls)
    fill_geocode_cache(load_zones(p), str(cache), geocoder=g, delay=0)
    assert len(calls) == n  # 성공·실패(null) 모두 재호출 없음


def test_geocode_error_stops_without_caching(tmp_path):
    p = _csv(tmp_path, [REDEV.format(n="아현1")])
    cache = tmp_path / "c.json"

    def boom(kind, q):
        raise RuntimeError("quota")

    fill_geocode_cache(load_zones(p), str(cache), geocoder=boom, delay=0, say=lambda *_: None)
    assert not cache.exists() or json.loads(cache.read_text()) == {}


# ---- build / export ----

def test_build_zones_json_shape_and_matched_skip_geocode(tmp_path, conn):
    a = _apt(conn, "은마", "11680", lat=37.49, lng=127.06)
    p = _csv(tmp_path, ["서울특별시,강남구,은마아파트,6)관리처분인가,3)재건축(공동주택),1)조합,4424"])
    doc = build_zones_json(conn, p, date(2026, 11, 4), cache_path=str(tmp_path / "none.json"))  # 캐시 없어도 동작
    assert doc["source"] == "국토교통부 전국 도시정비사업 통합 데이터" and doc["as_of"] == "2026-05-18"
    assert "generated_at" in doc
    z = doc["zones"][0]
    assert (z["match"], z["apt_ids"], z["lat"], z["geo"]) == ("exact", [a], 37.49, "apt")
    assert set(z) == {"zone_id", "sido", "sigungu", "lawd_cd", "name", "stage", "stage_order", "type",
                      "type_group", "operator", "households", "lat", "lng", "geo", "match", "apt_ids"}


def test_export_writes_zones_and_survives_missing_csv(conn, tmp_path, monkeypatch):
    from pipeline import export_json, redevelopment

    keys = export_json.export(conn, str(tmp_path / "o1"), apt_ids=[], today=date(2026, 11, 4))
    assert "v1/redevelopment/zones.json" in keys
    monkeypatch.setattr(redevelopment, "CSV_PATH", str(tmp_path / "missing.csv"))
    keys = export_json.export(conn, str(tmp_path / "o2"), apt_ids=[], today=date(2026, 11, 4))
    with gzip.open(tmp_path / "o2/v1/redevelopment/zones.json.gz", "rt", encoding="utf-8") as f:
        doc = json.load(f)
    assert doc["zones"] == [] and doc["source"] == "국토교통부 전국 도시정비사업 통합 데이터"


def test_match_zone_number_name_does_not_contain_into_longer_apt(conn):
    _apt(conn, "성수1차대우아파트", "11200")  # '성수1' 은 1구역 번호일 뿐 이 단지가 아니다
    z = [_zone("성수1", lawd="11200")]
    match_apartments(conn, z)
    assert z[0]["match"] is None
