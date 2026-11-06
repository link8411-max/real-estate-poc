"""건축물대장 전유공용면적 행 → 주택형별 공급면적 (순수 계산, 네트워크 없음).

공급면적 = 전유 + 주거공용. 주거공용 판정은 etcPurps 단어로만 한다
(mainPurpsCdNm은 지하주차장을 "아파트"로 적는 단지가 있어 믿지 않는다).
"""
import argparse
import json
import math
import sqlite3
import statistics
from collections import Counter
from datetime import datetime, timezone
from typing import NamedTuple

M2_PER_PYEONG = 3.3058
# etcPurps에 하나라도 있으면 기타공용(공급면적 제외). 스펙 3.2.
OTHER_COMMON_WORDS: tuple[str, ...] = (
    "주차", "기계", "전기", "보일러", "관리", "경비", "주민", "경로", "노인",
    "어린이", "보육", "문고", "도서", "펌프", "MDF", "엠디에프", "발전",
    "열교환", "방재", "휴게", "피트니스", "골프", "카페", "독서", "재활용",
    "회의", "통제", "저수", "물탱크", "정화", "변전", "상가", "근린",
    "작업장", "GX", "키즈", "멀티미디어", "커뮤니티", "체육", "수영",
    "사우나", "부대", "복리", "판매",
)
# 공급/전용 정상 범위: 전용 면적대별. 작은 평형일수록 공용 비중이 커 비율이 높다.
# 2026-09 대용량 파일 register_types 분포(p99, 소형은 p95)를 0.05 단위로 올림. 하한 1.15 는 공용 누락(=1.0) 배제용(도곡렉슬 대형 1.19 같은 실제 값 허용).
RATIO_BANDS = ((50.0, (1.15, 1.80)), (70.0, (1.15, 1.55)), (float("inf"), (1.15, 1.50)))
OLD_BUILD_YEAR = 1995  # 이 연도 이전 준공이면 "약"
MIN_AGREEMENT = 0.6  # 최빈값 비중이 이보다 낮으면 "약"


PYEONG_ROUND_UP = 0.05  # 소수 .95 이상은 올림: 대장과 분양 면적의 0.1㎡ 남짓 차이(24.97평 → 25평)


def supply_pyeong(supply_m2: float) -> int:
    """공급 ㎡ → 평(소수점 버림, 호갱노노와 동일. 단 .95 이상은 올림)."""
    return math.floor(supply_m2 / M2_PER_PYEONG + PYEONG_ROUND_UP)


def is_residential_common(etc_purps: str | None) -> bool:
    """공용 행이 주거공용이면 True (기타공용 단어가 없으면 주거공용)."""
    s = (etc_purps or "").upper()
    return not any(w.upper() in s for w in OTHER_COMMON_WORDS)


def is_apartment_unit(row: dict) -> bool:
    """전유 행이 공동주택(아파트)인지."""
    text = f"{row.get('mainPurpsCdNm') or ''} {row.get('etcPurps') or ''}"
    return "아파트" in text or "공동주택" in text


class UnitAccumulator:
    """페이지 단위로 들어오는 행을 호(戶)별로 합산한다.

    호 키는 mgmBldrgstPk(호마다 다름)가 있으면 (pk, "동 호"), 없으면 (동, 호).
    행이 흩어져 나와도 같은 키는 모두 합산한다. 가장 마지막에 본 호는 다음
    페이지로 이어질 수 있어 close() 전까지 finished_units()에서 제외한다.
    """

    def __init__(self) -> None:
        # 키 -> [전유(없으면 None), 주거공용 합, 아파트 여부]
        self._units: dict[tuple[str, str], list] = {}
        self._last: tuple[str, str] | None = None
        self._closed = False

    @staticmethod
    def _key(r: dict) -> tuple[str, str]:
        dong = (r.get("dongNm") or "").strip()
        ho = (r.get("hoNm") or "").strip()
        pk = r.get("mgmBldrgstPk")
        if pk:
            return (str(pk), f"{dong} {ho}".strip())
        return (dong, ho)

    def add_rows(self, rows: list[dict]) -> None:
        for r in rows:
            try:
                area = float(r.get("area") or 0)
            except (TypeError, ValueError):  # 숫자가 아닌 면적 행은 건너뛴다
                continue
            key = self._key(r)
            self._last = key
            u = self._units.setdefault(key, [None, 0.0, False])
            if str(r.get("exposPubuseGbCd")) == "1":
                if u[0] is None:
                    u[0] = area
                    u[2] = is_apartment_unit(r)
            elif is_residential_common(r.get("etcPurps")):
                u[1] += area

    def close(self) -> None:
        """더 들어올 행이 없을 때 보류 중인 마지막 호를 확정."""
        self._closed = True

    def finished_units(self) -> dict[tuple[str, str], tuple[float, float]]:
        """확정된 호 → (전유, 공급). 아파트 전유가 있는 호만, 보류 중인 마지막 호 제외."""
        return {
            k: (u[0], u[0] + u[1])
            for k, u in self._units.items()
            if u[2] and u[0] is not None
            and (self._closed or k != self._last)
        }


class TypeEstimate(NamedTuple):
    excl: float  # 전유(㎡, 소수 둘째 자리)
    supply: float  # 공급 최빈값(㎡, 소수 둘째 자리)
    sample_n: int  # 표본 호 수
    agreement: float  # 최빈값 비중 (0~1)


def types_from_units(
    units: dict[tuple[str, str], tuple[float, float]],
) -> list[TypeEstimate]:
    """전유(둘째 자리 반올림)별로 묶어 공급 최빈값과 그 비중을 구한다."""
    groups: dict[float, list[float]] = {}
    for excl, supply in units.values():
        groups.setdefault(round(excl, 2), []).append(round(supply, 2))
    out = []
    for excl in sorted(groups):
        vals = groups[excl]
        supply, cnt = Counter(vals).most_common(1)[0]
        out.append(TypeEstimate(excl, supply, len(vals), cnt / len(vals)))
    return out


# ---------------------------------------------------------------------------
# 세 겹 합치기: 청약홈 → 건축물대장 → 추정  (apartment_area_types 표)
# ---------------------------------------------------------------------------
TOLERANCE = 0.05
DEFAULT_RATIO = 1.32  # 비교할 값이 하나도 없을 때(신규 DB 등)의 공급/전용
PEER_YEARS = 5  # 비슷한 단지: 준공 ±5년


def band_of(excl: float) -> int:
    """면적대: 0=60 미만, 1=60~85, 2=85 초과."""
    return 0 if excl < 60 else (1 if excl <= 85 else 2)


def lookup(types: list[dict], area: float) -> dict | None:
    """±0.05 안에서 가장 가까운 주택형. 없으면 None. (내보내기·프런트 공통 규칙)"""
    best, gap = None, TOLERANCE + 1e-9
    for t in types:
        d = abs(t["excl"] - area)
        if d <= gap:
            best, gap = t, d
    return best


def supply_label(types: list[dict], area: float) -> dict | None:
    """그 거래 전용면적의 공급평 표시값 {"min","max","approx"} (내보내기 세 곳 공통).

    lookup 이 맞으면 min=max, 아니면 같은 정수 묶음(전용 소수점 버림)의 주택형 범위, 없으면 None.
    """
    hit = lookup(types, area)
    if hit is not None:
        p = supply_pyeong(hit["supply"])
        return {"min": p, "max": p, "approx": bool(hit["approx"])}
    group = [t for t in types if int(t["excl"]) == int(area)]
    if not group:
        return None
    pyeongs = [supply_pyeong(t["supply"]) for t in group]
    return {"min": min(pyeongs), "max": max(pyeongs), "approx": any(bool(t["approx"]) for t in group)}


def load_area_types(conn: sqlite3.Connection, apt_ids: set[int] | None = None) -> dict[int, list[dict]]:
    """apartment_area_types → apt_id: [{"excl","supply","approx"}] (전용 오름차순)."""
    out: dict[int, list[dict]] = {}
    for apt_id, excl, supply, approx in conn.execute(
        "SELECT apt_id, excl_area, supply_area, approx FROM apartment_area_types ORDER BY apt_id, excl_area"
    ):
        if apt_ids is None or apt_id in apt_ids:
            out.setdefault(apt_id, []).append({"excl": excl, "supply": supply, "approx": bool(approx)})
    return out


def apt_area_types(conn: sqlite3.Connection, apt_id: int) -> list[dict]:
    """한 단지의 주택형 목록 (전용 오름차순, 없으면 [])."""
    return [
        {"excl": e, "supply": s, "approx": bool(a)}
        for e, s, a in conn.execute(
            "SELECT excl_area, supply_area, approx FROM apartment_area_types WHERE apt_id=? "
            "ORDER BY excl_area", (apt_id,))
    ]


def _nearest(items: list, key, area: float):
    """items 중 key(item)이 area에 ±0.05 안에서 가장 가까운 것."""
    best, gap = None, TOLERANCE + 1e-9
    for it in items:
        d = abs(key(it) - area)
        if d <= gap:
            best, gap = it, d
    return best


def ratio_range(excl: float) -> tuple[float, float]:
    """그 전용면적에서 믿을 만한 공급/전용 범위."""
    for upper, rng in RATIO_BANDS:
        if excl < upper:
            return rng
    return RATIO_BANDS[-1][1]


def _ratio_ok(excl: float, supply: float) -> bool:
    if excl <= 0:
        return False
    lo, hi = ratio_range(excl)
    return lo <= supply / excl <= hi


def _is_sure(build_year: int | None, agreement: float) -> bool:
    """대장 값이 '확실'한가: 준공 1995년 이후이고 최빈값 비중이 충분."""
    return not (build_year is not None and build_year < OLD_BUILD_YEAR) and agreement >= MIN_AGREEMENT


def _sido(lawd_cd: str) -> str:
    return lawd_cd[:2]


class _Peers:
    """확실한 대장 값의 공급/전용 비율을 지역·면적대별로 모아 둔다."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self.by_lawd: dict[tuple[str, int], list[tuple[int | None, float]]] = {}
        self.by_sido: dict[tuple[str, int], list[tuple[int | None, float]]] = {}
        self.by_band: dict[int, list[float]] = {}
        rows = conn.execute(
            "SELECT a.lawd_cd, a.build_year, r.excl_area, r.supply_area, r.agreement, r.apt_id "
            "FROM register_types r JOIN apartments a ON a.id = r.apt_id"
        )
        for lawd, year, excl, supply, agr, apt_id in rows:
            if not _ratio_ok(excl, supply) or not _is_sure(year, agr):
                continue
            ratio, band = supply / excl, band_of(excl)
            self.by_lawd.setdefault((lawd, band), []).append((year, ratio))
            self.by_sido.setdefault((_sido(lawd), band), []).append((year, ratio))
            self.by_band.setdefault(band, []).append(ratio)

    @staticmethod
    def _near_year(items: list[tuple[int | None, float]], year: int | None) -> list[float]:
        if year is None:
            return [r for _, r in items]
        return [r for y, r in items if y is not None and abs(y - year) <= PEER_YEARS]

    def ratio(self, lawd: str, year: int | None, excl: float) -> float:
        band = band_of(excl)
        for vals in (
            self._near_year(self.by_lawd.get((lawd, band), []), year),
            self._near_year(self.by_sido.get((_sido(lawd), band), []), year),
            self.by_band.get(band, []),
        ):
            if vals:
                return statistics.median(vals)
        return DEFAULT_RATIO


def _own_sure(
    conn: sqlite3.Connection, apt_id: int, build_year: int | None,
    cheongyak: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    """그 단지에서 확실한 (전용, 공급): 청약홈 + 범위 안의 확실한 대장 값."""
    out = [(e, s) for e, s in cheongyak if _ratio_ok(e, s)]
    for e, s, agr in conn.execute(
        "SELECT excl_area, supply_area, agreement FROM register_types WHERE apt_id=?", (apt_id,)
    ):
        if _ratio_ok(e, s) and _is_sure(build_year, agr):
            out.append((e, s))
    return out


def _estimate(own: list[tuple[float, float]], peers: _Peers, lawd: str, year: int | None,
              excl: float) -> float:
    if own:  # 같은 단지에서 면적이 가장 가까운 확실한 주택형의 비율
        e, s = min(own, key=lambda p: abs(p[0] - excl))
        return s / e
    return peers.ratio(lawd, year, excl)


def estimate_ratio(conn: sqlite3.Connection, apt_id: int, excl: float,
                   cheongyak: list[tuple[float, float]] | None = None) -> float:
    """빠진 주택형의 공급/전용 추정 비율: 같은 단지 → 같은 구·준공·면적대 → 같은 시도 → 전체."""
    row = conn.execute("SELECT lawd_cd, build_year FROM apartments WHERE id=?", (apt_id,)).fetchone()
    lawd, year = (row[0], row[1]) if row else ("", None)
    own = _own_sure(conn, apt_id, year, cheongyak or [])
    return _estimate(own, _Peers(conn), lawd, year, excl)


def _pick_cheongyak(types: list[tuple[float, float]], area: float) -> float | None:
    near = _nearest(types, lambda t: t[0], area)
    if near is None:
        return None
    same = sorted(s for e, s in types if e == near[0])
    return same[(len(same) - 1) // 2]  # 같은 전용의 여러 주택형은 중앙값


def _traded_areas(conn: sqlite3.Connection) -> dict[int, set[float]]:
    out: dict[int, set[float]] = {}
    for table in ("transactions", "rents"):
        for apt_id, area in conn.execute(
            f"SELECT apt_id, round(area, 2) FROM {table} GROUP BY apt_id, round(area, 2)"
        ):
            out.setdefault(apt_id, set()).add(float(area))
    return out


def _desired(
    conn: sqlite3.Connection, apt_id: int, areas: set[float], lawd: str, year: int | None,
    cheongyak: list[tuple[float, float]], peers: _Peers,
) -> dict[float, tuple[float, str, int, int]]:
    """전용 → (공급, source, approx, sample_n)."""
    reg = conn.execute(
        "SELECT excl_area, supply_area, sample_n, agreement FROM register_types WHERE apt_id=?",
        (apt_id,),
    ).fetchall()
    own = _own_sure(conn, apt_id, year, cheongyak)
    out = {}
    for w in sorted(areas):
        supply = _pick_cheongyak(cheongyak, w)
        if supply is not None:
            out[w] = (round(supply, 2), "cheongyak", 0, 0)
            continue
        r = _nearest(reg, lambda t: t[0], w)
        if r is not None and _ratio_ok(w, r[1]):
            approx = 0 if _is_sure(year, r[3]) else 1
            out[w] = (round(r[1], 2), "register", approx, r[2])
            continue
        out[w] = (round(w * _estimate(own, peers, lawd, year, w), 2), "estimate", 1, 0)
    return out


def _comparable(d: dict) -> dict:
    """변경 판정용: 0.01㎡ 값이 아니라 표시되는 (공급평, source, approx)만 비교."""
    return {k: (supply_pyeong(v[0]), v[1], int(v[2])) for k, v in d.items()}


def resolve_all(conn: sqlite3.Connection, cheongyak: dict[int, list[tuple[float, float]]]) -> list[int]:
    """모든 단지의 (거래된 전용면적별) 공급면적을 확정해 apartment_area_types 에 쓴다.

    값(공급·source·approx)이 바뀐 단지 id 를 돌려주고 changed_apartments 에 표시한다.
    """
    from pipeline.db import mark_changed  # 순환 import 회피

    traded = _traded_areas(conn)
    aliases = {r[0] for r in conn.execute("SELECT old_id FROM apartment_aliases")}
    meta = {r[0]: (r[1], r[2]) for r in conn.execute("SELECT id, lawd_cd, build_year FROM apartments")}
    peers = _Peers(conn)
    old: dict[int, dict[float, tuple]] = {}
    for apt_id, excl, supply, source, approx in conn.execute(
        "SELECT apt_id, excl_area, supply_area, source, approx FROM apartment_area_types"
    ):
        old.setdefault(apt_id, {})[excl] = (round(supply, 2), source, int(approx))

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    changed: list[int] = []
    for apt_id in sorted(set(old) | set(traded)):
        if apt_id in aliases or apt_id not in meta or apt_id not in traded:
            new: dict = {}
        else:
            lawd, year = meta[apt_id]
            new = _desired(conn, apt_id, traded[apt_id], lawd, year, cheongyak.get(apt_id, []), peers)
        cur = old.get(apt_id, {})
        if _comparable(new) == _comparable(cur):
            continue
        conn.execute("DELETE FROM apartment_area_types WHERE apt_id=?", (apt_id,))
        conn.executemany(
            "INSERT INTO apartment_area_types(apt_id, excl_area, supply_area, source, approx, sample_n,"
            " updated_at) VALUES (?,?,?,?,?,?,?)",
            [(apt_id, w, v[0], v[1], v[2], v[3], now) for w, v in new.items()],
        )
        if apt_id not in aliases:
            changed.append(apt_id)
    mark_changed(conn, changed)
    conn.commit()
    return changed


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="공급면적 확정")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("resolve", help="청약홈·대장·추정을 합쳐 apartment_area_types 갱신")
    r.add_argument("--db", default="real_estate.db")
    r.add_argument("--cheongyak-dir", default="pipeline/data/cheongyak")
    r.add_argument("--changed-out", default="changed_apts.json")
    a = ap.parse_args(argv)
    from pipeline.cheongyak import load_notices, match_notices
    from pipeline.db import connect, migrate

    conn = connect(a.db)
    try:
        migrate(conn)
        matched = match_notices(conn, load_notices(a.cheongyak_dir))
        changed = resolve_all(conn, matched)
    finally:
        conn.close()
    with open(a.changed_out, "w", encoding="utf-8") as f:
        json.dump(changed, f)
    print(f"청약홈 연결 {len(matched)}개, 바뀐 단지 {len(changed)}개 -> {a.changed_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
