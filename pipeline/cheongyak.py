"""청약홈 분양 공고(주택형별 전용·공급면적)를 단지에 연결한다.

공고의 주소 시군구로 후보 단지를 좁히고, 공고 전용면적과 단지의 실제 거래 전용면적이
겹치는 개수가 단독 최대인 단지 하나에만 연결한다. 애매하면 연결하지 않는다.
"""
from __future__ import annotations

import argparse
import csv
import difflib
import glob
import os
import re
import sqlite3
from collections import defaultdict
from typing import NamedTuple

from pipeline.regions import REGION_FULLNAME, RETIRED_FULLNAME, SUCCEEDED_BY, candidate_codes

TOLERANCE = 0.05
NAME_MARGIN = 0.15  # 이름 유사도로 동점을 깰 때 1등이 2등보다 이만큼 앞서야 한다
NAME_MIN = 0.5

_SIDO = {"서울특별시": "서울", "경기도": "경기", "인천광역시": "인천"}
_TYPE = re.compile(r"^\s*(\d+(?:\.\d+)?)")


class Notice(NamedTuple):
    house_no: str
    name: str
    address: str
    notice_date: str
    types: list[tuple[float, float]]  # (전용, 공급)


def parse_house_type(text: str) -> float | None:
    """주택형 "084.9500D" → 84.95 (둘째 자리 반올림)."""
    m = _TYPE.match(text or "")
    return round(float(m.group(1)), 2) if m else None


def _latest(data_dir: str, pattern: str) -> str | None:
    files = sorted(glob.glob(os.path.join(data_dir, pattern)))
    return files[-1] if files else None  # 파일명 속 날짜가 큰 최신 판


def _read(path: str) -> list[dict]:
    with open(path, encoding="cp949", newline="") as f:
        return list(csv.DictReader(f))


def load_notices(data_dir: str) -> list[Notice]:
    npath = _latest(data_dir, "*notices*.csv")
    tpath = _latest(data_dir, "*types*.csv")
    if not npath or not tpath:
        return []
    types: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for r in _read(tpath):
        excl = parse_house_type(r.get("주택형", ""))
        try:
            supply = round(float(r.get("주택공급면적") or 0), 4)
        except ValueError:
            continue
        if excl and supply > 0 and (excl, supply) not in types[r["주택관리번호"]]:
            types[r["주택관리번호"]].append((excl, supply))
    return [
        Notice(r["주택관리번호"], r["주택명"], r["공급위치"], r["모집공고일"], types[r["주택관리번호"]])
        for r in _read(npath)
        if types.get(r["주택관리번호"])
    ]


_BY_FULLNAME = {v: k for k, v in REGION_FULLNAME.items()}
_BY_RETIRED = {v: k for k, v in RETIRED_FULLNAME.items()}


def region_codes(address: str) -> list[str]:
    """공고 주소 앞 토큰("서울특별시 강동구", "경기도 성남시 분당구") → lawd_cd 후보."""
    t = (address or "").split()
    if len(t) < 2 or t[0] not in _SIDO:
        return []
    sido = _SIDO[t[0]]
    for n in (3, 2):  # 구가 붙는 시를 먼저
        if len(t) >= n:
            key = f"{sido} {' '.join(t[1:n])}"
            if key in _BY_FULLNAME:
                return [_BY_FULLNAME[key]]
            if key in _BY_RETIRED:  # 옛 코드 주소는 후속 코드 전체가 후보
                return list(SUCCEEDED_BY[_BY_RETIRED[key]])
    return []


def _norm(name: str) -> str:
    return re.sub(r"[\s().,·\-]", "", name or "")


def _similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def _apt_areas(conn: sqlite3.Connection, codes: list[str]) -> dict[int, tuple[str, set[float], int | None]]:
    all_codes = sorted({c for code in codes for c in candidate_codes(code)})
    marks = ",".join("?" * len(all_codes))
    out: dict[int, tuple[str, set[float], int | None]] = {}
    for table in ("transactions", "rents"):
        rows = conn.execute(
            f"SELECT a.id, a.name, round(t.area, 2), a.build_year FROM apartments a JOIN {table} t ON t.apt_id=a.id "
            f"WHERE a.lawd_cd IN ({marks}) GROUP BY a.id, round(t.area, 2)",
            all_codes,
        )
        for apt_id, name, area, built in rows:
            out.setdefault(apt_id, (name, set(), built))[1].add(float(area))
    return out


def _overlap(notice_excls: set[float], apt_areas: set[float]) -> int:
    return sum(1 for e in notice_excls if any(abs(e - a) <= TOLERANCE + 1e-9 for a in apt_areas))


def _pick(conn, notice: Notice, cache: dict) -> int | None:
    codes = region_codes(notice.address)
    if not codes:
        return None
    key = tuple(codes)
    if key not in cache:
        cache[key] = _apt_areas(conn, codes)
    excls = {e for e, _ in notice.types}
    need = min(2, len(excls))
    year = int(notice.notice_date[:4]) if notice.notice_date[:4].isdigit() else 0
    scored = [
        (_overlap(excls, areas), apt_id, name)
        for apt_id, (name, areas, built) in cache[key].items()
        if built is None or built >= year  # 공고보다 먼저 준공된 단지는 그 분양이 아니다
    ]
    scored = [s for s in scored if s[0] >= need and s[0] > 0]
    if not scored:
        return None
    best = max(s[0] for s in scored)
    top = [s for s in scored if s[0] == best]
    if len(top) == 1:
        return top[0][1]
    sims = sorted(((_similarity(notice.name, n), i) for _, i, n in top), reverse=True)
    if sims[0][0] >= NAME_MIN and sims[0][0] - sims[1][0] >= NAME_MARGIN:
        return sims[0][1]
    return None


def match_notices(
    conn: sqlite3.Connection, notices: list[Notice]
) -> dict[int, list[tuple[float, float]]]:
    """apt_id → 주택형 (전용, 공급) 목록. 같은 단지에 공고가 여럿이면 최신 공고의 전용면적을 우선."""
    cache: dict = {}
    result: dict[int, dict[float, list[tuple[float, float]]]] = {}
    for n in sorted(notices, key=lambda x: x.notice_date, reverse=True):
        apt_id = _pick(conn, n, cache)
        if apt_id is None:
            continue
        have = result.setdefault(apt_id, {})
        by_excl: dict[float, list[tuple[float, float]]] = defaultdict(list)
        for e, s in n.types:
            by_excl[e].append((e, s))
        for e, items in by_excl.items():
            if e not in have:
                have[e] = items
    return {a: [t for e in sorted(d) for t in d[e]] for a, d in result.items()}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="청약홈 공고 → 단지 연결 점검")
    ap.add_argument("--db", default="real_estate.db")
    ap.add_argument("--data-dir", default="pipeline/data/cheongyak")
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args(argv)
    conn = sqlite3.connect(a.db)
    notices = load_notices(a.data_dir)
    matched = match_notices(conn, notices)
    print(f"공고 {len(notices)}건 중 연결된 단지 {len(matched)}개")
    if a.report:
        for apt_id in list(matched)[:10]:
            name, dong = conn.execute("SELECT name, dong FROM apartments WHERE id=?", (apt_id,)).fetchone()
            print(apt_id, name, dong, matched[apt_id][:4])
        for kw in ("포레온", "잠실 르엘", "메이플자이"):
            hits = [(i, conn.execute("SELECT name FROM apartments WHERE id=?", (i,)).fetchone()[0])
                    for i in matched]
            print(kw, [h for h in hits if kw.replace(" ", "") in h[1].replace(" ", "")])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
