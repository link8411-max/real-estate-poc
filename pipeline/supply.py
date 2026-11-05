"""건축물대장 전유공용면적 행 → 주택형별 공급면적 (순수 계산, 네트워크 없음).

공급면적 = 전유 + 주거공용. 주거공용 판정은 etcPurps 단어로만 한다
(mainPurpsCdNm은 지하주차장을 "아파트"로 적는 단지가 있어 믿지 않는다).
"""
import math
from collections import Counter
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
RATIO_RANGE = (1.20, 1.45)  # 공급/전용 정상 범위
OLD_BUILD_YEAR = 1995  # 이 연도 이전 준공이면 "약"
MIN_AGREEMENT = 0.6  # 최빈값 비중이 이보다 낮으면 "약"


def supply_pyeong(supply_m2: float) -> int:
    """공급 ㎡ → 평(소수점 버림, 호갱노노와 동일)."""
    return math.floor(supply_m2 / M2_PER_PYEONG)


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
            key = self._key(r)
            self._last = key
            u = self._units.setdefault(key, [None, 0.0, False])
            area = float(r.get("area") or 0)
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
