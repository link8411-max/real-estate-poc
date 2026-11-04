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


def _one(tmp_path, row, docs, calls=None, setup=None):
    tmp_path.mkdir(exist_ok=True)
    p = _csv(tmp_path, [row])
    cache = tmp_path / "c.json"
    fill_geocode_cache(load_zones(p), str(cache), geocoder=_fake(docs, [] if calls is None else calls), delay=0)
    c = connect(str(tmp_path / "e.db"))
    migrate(c)
    if setup:
        setup(c)
    return build_zones_json(c, p, date(2026, 11, 4), cache_path=str(cache))["zones"][0]


REDEV = "서울특별시,마포구,{n},2)정비구역지정,1)재개발(주택정비),1)조합,100"


def test_geocode_accepts_first_result_in_same_sigungu(tmp_path):
    z = _one(tmp_path, REDEV.format(n="아현1"),
             {("keyword", "서울 마포구 아현1"): _doc("서울 마포구 아현동 1-1", "37.55", "126.95", name="아현1구역")})
    assert (z["lat"], z["lng"], z["geo"]) == (37.55, 126.95, "kakao_name")


def test_geocode_rejects_other_sigungu_and_failure_stays_in_list(tmp_path):
    z = _one(tmp_path, REDEV.format(n="아현1"), {("keyword", "서울 마포구 아현1"): _doc("서울 서대문구 북아현동 1")})
    assert z["lat"] is None and z["geo"] is None and z["name"] == "아현1"  # 목록에는 남는다


def test_geocode_fallback_paren_suffix_lot_address(tmp_path):
    z = _one(tmp_path, '경기도,수원영통구,"영통2구역(매탄주공4,5단지)",2)정비구역지정,3)재건축(공동주택),1)조합,10',
             {("keyword", "경기 수원영통구 매탄주공4단지"): _doc("경기 수원시 영통구 매탄동 1", name="매탄주공4단지")})
    assert z["geo"] == "kakao_paren"
    z = _one(tmp_path, "경기도,고양덕양구,능곡5,2)정비구역지정,1)재개발(주택정비),1)조합,10",
             {("keyword", "경기 고양덕양구 능곡5구역"): _doc("경기 고양시 덕양구 능곡동 1", name="능곡5구역")})
    assert z["geo"] == "kakao_suffix"
    z = _one(tmp_path, "경기도,수원팔달구,111-3,2)정비구역지정,1)재개발(주택정비),1)조합,10",
             {("keyword", "경기 수원시 111-3구역"): _doc("경기 수원시 팔달구 인계동 1", name="111-3구역")})
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


def test_geocode_rejects_unrelated_place_name(tmp_path):
    # 같은 시군구여도 장소명에 구역 핵심어(또는 괄호 안 단지명)가 없으면 거부
    z = _one(tmp_path, "서울특별시,종로구,도렴16,2)정비구역지정,1)재개발(주택정비),1)조합,10",
             {("keyword", "서울 종로구 도렴16"): _doc("서울 종로구 통인동", name="동네골목길관광코스 16코스")})
    assert z["lat"] is None
    z = _one(tmp_path / "b", "서울특별시,종로구,도렴16,2)정비구역지정,1)재개발(주택정비),1)조합,10",
             {("keyword", "서울 종로구 도렴16"): _doc("서울 종로구 도렴동 1", name="도렴16구역 추진위")})
    assert z["geo"] == "kakao_name"
    z = _one(tmp_path / "c", "서울특별시,영등포구,대림1구역,2)정비구역지정,1)재개발(주택정비),1)조합,10",
             {("keyword", "서울 영등포구 대림1구역"): _doc("서울 영등포구 대림동", name="서울대림1동 우편취급국")})
    assert z["lat"] is None  # '대림1' 뒤에 '동' 이 붙은 '대림1동' 은 다른 곳


def test_geocode_roman_numerals_normalized_in_query_and_filter(tmp_path):
    z = _one(tmp_path, "경기도,고양덕양구,행신Ⅰ-1구역,2)정비구역지정,1)재개발(주택정비),1)조합,10",
             {("keyword", "경기 고양덕양구 행신1-1구역"): _doc("경기 고양시 덕양구 행신동", name="행신1-1구역 조합")})
    assert z["geo"] == "kakao_name"


def test_retired_sigungu_mapped_to_successor_and_geocode_accepts_successors(tmp_path):
    p = _csv(tmp_path, [
        "인천광역시,동구,송현,2)정비구역지정,1)재개발(주택정비),1)조합,10",
        "인천광역시,서구,가좌,2)정비구역지정,1)재개발(주택정비),1)조합,10",
    ])
    z = {x["name"]: x for x in load_zones(p)}
    assert z["송현"]["lawd_cd"] == "28125"  # 동구 -> 제물포구 (후속 하나)
    assert z["가좌"]["lawd_cd"] is None  # 서구 -> 서해구/검단구 (모호)
    zz = _one(tmp_path / "s", "인천광역시,서구,가좌,2)정비구역지정,1)재개발(주택정비),1)조합,10",
              {("keyword", "인천 서구 가좌"): _doc("인천 서해구 가좌동 1", name="가좌구역")})
    assert zz["geo"] == "kakao_name"  # 후속 구 주소도 인정


def test_dong_approx_fallback_and_never_overrides_precise(tmp_path):
    def setup(c):
        _apt(c, "가", "11440", dong="신흥동", lat=37.0, lng=127.0)
        _apt(c, "나", "11440", dong="신흥동", lat=37.2, lng=127.2, jibun="2")
        _apt(c, "다", "11440", dong="다른동", lat=38.0, lng=128.0)

    row = "서울특별시,마포구,{n},2)정비구역지정,1)재개발(주택정비),1)조합,10"
    z = _one(tmp_path / "a", row.format(n="신흥1"), {}, setup=setup)
    assert z["geo"] == "dong_approx" and z["lat"] == pytest.approx(37.1) and z["match"] is None
    z = _one(tmp_path / "b", row.format(n="없는곳1"), {}, setup=setup)
    assert z["geo"] is None
    z = _one(tmp_path / "c", row.format(n="신흥1"),
             {("keyword", "서울 마포구 신흥1"): _doc("서울 마포구 신흥동", "37.9", "127.9", name="신흥1구역")}, setup=setup)
    assert z["geo"] == "kakao_name" and z["lat"] == 37.9


def test_paren_district_or_generic_token_does_not_authorize_place(tmp_path):
    row = '서울특별시,마포구,"신촌지역(마포)1-3지구",2)정비구역지정,1)재개발(주택정비),1)조합,10'
    z = _one(tmp_path / "a", row, {
        ("keyword", "서울 마포구 신촌지역(마포)1-3지구"): _doc("서울 마포구 성산동", name="마포구청"),
        ("keyword", "서울 마포구 마포"): _doc("서울 마포구 성산동", name="마포구청"),
    })
    assert z["lat"] is None
    row = "서울특별시,서대문구,홍제3(도시환경),2)정비구역지정,1)재개발(주택정비),1)조합,10"
    z = _one(tmp_path / "b", row, {
        ("keyword", "서울 서대문구 홍제3(도시환경)"): _doc("서울 서대문구 홍제동", name="홍제도시환경정비사업소"),
        ("keyword", "서울 서대문구 도시환경"): _doc("서울 서대문구 홍제동", name="홍제도시환경정비사업소"),
    })
    assert z["lat"] is None  # 동 근사 기반 단지도 없으므로 위치 없음


def test_paren_complex_name_still_authorizes(tmp_path):
    z = _one(tmp_path, "경기도,수원팔달구,파장1구역(삼익아파트),2)정비구역지정,1)재개발(주택정비),1)조합,10",
             {("keyword", "경기 수원팔달구 삼익아파트"): _doc("경기 수원시 팔달구 지동", name="삼익아파트")})
    assert z["geo"] == "kakao_paren"


def test_paren_dong_name_does_not_authorize_place(tmp_path):
    for i, (sg, n, q, place) in enumerate([
        ("은평구", "역촌역세권(대조동)장기전세주택", "서울 은평구 대조동", "대조동 주민센터"),
        ("종로구", "내자필운구역2-1지구(내자동)", "서울 종로구 내자동", "내자동 공영주차장"),
    ]):
        row = f'서울특별시,{sg},"{n}",2)정비구역지정,1)재개발(주택정비),1)조합,10'
        z = _one(tmp_path / str(i), row, {("keyword", q): _doc(f"서울 {sg} 아무동", name=place)})
        assert z["lat"] is None and z["geo"] is None


def test_build_is_deterministic_and_cache_flushed_periodically(tmp_path):
    p = _csv(tmp_path, [REDEV.format(n=f"구역{i}") for i in range(60)])
    cache = tmp_path / "c.json"
    snapshots = {}

    def g(kind, q):
        snapshots[len(snapshots)] = len(json.loads(cache.read_text())) if cache.exists() else 0
        return None

    fill_geocode_cache(load_zones(p), str(cache), geocoder=g, delay=0)
    n = len(snapshots)
    assert n > 50 and snapshots[49] == 0 and snapshots[50] == 50  # 50건째까지 받은 뒤 한 번 저장
    c = connect(str(tmp_path / "d.db"))
    migrate(c)
    a = build_zones_json(c, p, date(2026, 11, 4), cache_path=str(cache))
    b = build_zones_json(c, p, date(2026, 11, 4), cache_path=str(cache))
    assert a == b
