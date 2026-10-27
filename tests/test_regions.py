from __future__ import annotations

from pipeline.regions import REGIONS, SUCCEEDED_BY, PREDECESSORS, is_retired, candidate_codes, city_of


def test_region_count_is_83():
    assert len(REGIONS) == 83


def test_retired_codes_removed_and_new_present():
    for old in ("28110", "28140", "28260", "41190", "41590"):
        assert old not in REGIONS and is_retired(old)
    for new in ("28125", "28155", "28275", "28290", "41192", "41194", "41196", "41591", "41593", "41595", "41597"):
        assert new in REGIONS


def test_predecessors_and_candidates():
    assert PREDECESSORS["28125"] == ["28110", "28140"]
    assert candidate_codes("41595") == ["41595", "41590"]
    assert candidate_codes("11680") == ["11680"]


def test_city_of():
    assert city_of("11680") == "서울" and city_of("41135") == "경기" and city_of("28290") == "인천"


def test_region_fullname_covers_all_regions_with_city_prefix():
    from pipeline.regions import REGION_FULLNAME
    assert set(REGION_FULLNAME) == set(REGIONS)
    for code, full in REGION_FULLNAME.items():
        assert full.startswith(city_of(code) + " ")
    assert REGION_FULLNAME["41135"] == "경기 성남시 분당구"
    assert REGION_FULLNAME["28710"] == "인천 강화군"


def test_suwon_palgal_yeongtong_not_swapped():
    from pipeline.regions import REGION_FULLNAME
    assert REGIONS["41115"] == "수원팔달"
    assert REGIONS["41117"] == "수원영통"
    assert REGION_FULLNAME["41115"] == "경기 수원시 팔달구"
    assert REGION_FULLNAME["41117"] == "경기 수원시 영통구"


def test_query_prefix_current_retired_unknown():
    from pipeline.regions import query_prefix
    assert query_prefix("11680") == "서울 강남구"
    assert query_prefix("41590") == "경기 화성시"
    assert query_prefix("28110") == "인천 중구"
    assert query_prefix("99999") is None
