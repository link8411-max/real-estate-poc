"""pipeline/supply.py 테스트 (건축물대장 전유공용면적 행 → 공급면적)."""
import json
from pathlib import Path

from pipeline.supply import (
    UnitAccumulator,
    is_apartment_unit,
    is_residential_common,
    supply_pyeong,
    types_from_units,
)

FX = Path(__file__).parent / "fixtures" / "register"


def _load(name: str) -> list[dict]:
    return json.loads((FX / name).read_text(encoding="utf-8"))


def _units(rows: list[dict]) -> dict:
    acc = UnitAccumulator()
    acc.add_rows(rows)
    acc.close()
    return acc.finished_units()


def test_supply_pyeong_floors():
    assert supply_pyeong(111.52) == 33
    assert supply_pyeong(109.29) == 33
    assert supply_pyeong(84.75) == 25
    assert supply_pyeong(149.88) == 45


def test_residential_words():
    for s in ["계단실,승강기", "벽체", "기타", "", None, "  "]:
        assert is_residential_common(s) is True, s
    for s in ["지하주차장", "기계실,전기실", "주차장",
              "관리사무소,방재실,MDF실", "지하주차장연결통로"]:
        assert is_residential_common(s) is False, s


def test_jamsil_els_types():
    types = types_from_units(_units(_load("jamsil_els_p1.json")))
    by_excl = {t.excl: t.supply for t in types}
    assert by_excl[84.8] == 111.52
    assert by_excl[59.96] == 84.75
    assert by_excl[84.88] == 109.29
    assert by_excl[119.93] == 149.88


def test_dogok_parking_marked_apartment_excluded():
    units = _units(_load("dogok_lexle_unit.json"))
    (excl, supply), = units.values()
    assert abs(excl - 84.9231) < 0.001
    assert abs(supply - 109.37) < 0.01


def test_eunma_blank_and_gita_included():
    units = _units(_load("eunma_unit.json"))
    (excl, supply), = units.values()
    assert abs(supply - 112.35) < 0.01


def test_page_boundary_unit_held():
    rows = _load("eunma_unit.json")
    acc = UnitAccumulator()
    acc.add_rows(rows[:3])
    assert acc.finished_units() == {}
    acc.add_rows(rows[3:])
    assert acc.finished_units() == {}  # 마지막 호는 다음 페이지까지 보류
    acc.close()
    (_, supply), = acc.finished_units().values()
    assert abs(supply - 112.35) < 0.01


def test_ignores_non_residential_units():
    rows = [
        {"dongNm": "", "hoNm": "101호", "exposPubuseGbCd": "1",
         "mainPurpsCdNm": "제2종근린생활시설", "etcPurps": "소매점", "area": 30.0},
        {"dongNm": "", "hoNm": "101호", "exposPubuseGbCd": "2",
         "mainPurpsCdNm": "제2종근린생활시설", "etcPurps": "계단실", "area": 5.0},
    ]
    assert is_apartment_unit(rows[0]) is False
    assert _units(rows) == {}
