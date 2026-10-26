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
