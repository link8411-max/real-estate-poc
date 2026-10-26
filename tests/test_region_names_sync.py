from __future__ import annotations

import re
from pathlib import Path

from pipeline.regions import REGIONS

TS = Path(__file__).resolve().parents[1] / "frontend" / "src" / "lib" / "regionNames.ts"


def test_frontend_region_names_match_pipeline():
    pairs = dict(re.findall(r'"(\d{5})": "([^"]+)"', TS.read_text(encoding="utf-8")))
    assert pairs == REGIONS
