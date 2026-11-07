from __future__ import annotations

import json
from pathlib import Path

from pipeline.area_class import area_class_map

CASES = json.loads((Path(__file__).parent / "fixtures" / "area_class_cases.json").read_text(encoding="utf-8"))


def test_cases_match_fixture():
    for case in CASES:
        got = area_class_map([(a, n) for a, n in case["areas"]])
        # 키는 면적 숫자로 비교한다(py "60.0" / ts "60" 표기 차이 흡수)
        expect = {float(k): v for k, v in case["expect"].items()}
        assert got == expect, case["name"]


def test_duplicate_area_counts_add_up():
    # 같은 면적이 두 번 들어오면 건수를 더한다
    assert area_class_map([(84.97, 1), (85.01, 3), (84.97, 3)]) == {84.97: 84, 85.01: 84}
