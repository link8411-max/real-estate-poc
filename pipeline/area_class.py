"""같은 평형대를 한 묶음으로 보는 규칙 (frontend/src/lib/areaClass.ts 와 같은 규칙).

84.97㎡/85.01㎡ 처럼 소수점만 다른 같은 주택형, 84A/84B 처럼 타입만 다른 같은 전용 크기를
한 묶음으로 본다. 정수 버림(CAST(area AS INTEGER))은 85.01 을 85 로 갈라 놓기 때문이다.

규칙:
1. 서로 다른 면적을 오름차순 정렬.
2. 앞 면적과 차이 < 1.0㎡ 이고 묶음 첫 면적과 차이 < 2.0㎡ 이면 같은 묶음, 아니면 새 묶음.
3. 묶음 라벨 = 묶음 안에서 거래 수가 가장 많은 면적의 버림 정수(동률이면 작은 면적).

공용 픽스처: tests/fixtures/area_class_cases.json
"""
from __future__ import annotations

import math
import sqlite3
from collections.abc import Iterable

STEP_GAP = 1.0   # 앞 면적과의 최대 차이(미만)
SPAN_GAP = 2.0   # 묶음 첫 면적과의 최대 차이(미만)


def area_class_map(areas: Iterable[tuple[float, int]]) -> dict[float, int]:
    """한 단지의 (전용면적, 거래 수) 목록 → {면적: 묶음 라벨}."""
    counts: dict[float, int] = {}
    for area, n in areas:
        if area is None:
            continue
        a = float(area)
        counts[a] = counts.get(a, 0) + int(n)
    out: dict[float, int] = {}
    group: list[float] = []

    def flush() -> None:
        if not group:
            return
        # 거래 수 최다, 동률이면 작은 면적 (group 은 오름차순)
        best = max(group, key=lambda a: (counts[a], -a))
        label = math.floor(best)
        for a in group:
            out[a] = label

    for a in sorted(counts):
        if group and (a - group[-1] < STEP_GAP and a - group[0] < SPAN_GAP):
            group.append(a)
        else:
            flush()
            group = [a]
    flush()
    return out


def apt_area_classes(conn: sqlite3.Connection, apt_id: int) -> dict[float, int]:
    """그 단지의 묶음 지도. 매매(취소 포함)와 전월세 면적을 함께 세어 한 지도로 만든다.

    매매·전월세 탭이 같은 라벨을 써야 전세가율처럼 둘을 짝짓는 값이 맞는다. 취소 여부와 무관하게 세므로
    거래가 취소돼도 묶음이 흔들리지 않는다.
    """
    return all_area_classes(conn, [apt_id]).get(apt_id, {})


def all_area_classes(conn: sqlite3.Connection, apt_ids: Iterable[int] | None = None) -> dict[int, dict[float, int]]:
    """여러 단지의 묶음 지도를 GROUP BY 로 한꺼번에 만든다 (행마다 조회 금지).

    apt_ids 가 없으면 전 단지를 표마다 한 번 훑고, 있으면 900개씩 apt_id IN (...) 로 인덱스를 탄다.
    """
    per: dict[int, list[tuple[float, int]]] = {}

    def scan(where: str, params: list) -> None:
        for table in ("transactions", "rents"):
            for apt_id, area, n in conn.execute(
                f"SELECT apt_id, area, COUNT(*) FROM {table} WHERE area IS NOT NULL{where} "
                "GROUP BY apt_id, area",
                params,
            ):
                per.setdefault(apt_id, []).append((area, n))

    if apt_ids is None:
        scan("", [])
    else:
        ids = sorted(set(apt_ids))
        for i in range(0, len(ids), 900):
            chunk = ids[i:i + 900]
            scan(f" AND apt_id IN ({','.join('?' * len(chunk))})", chunk)
    return {k: area_class_map(v) for k, v in per.items()}


def class_of(classes: dict[float, int], area: float) -> int:
    """묶음 지도에 없는 면적(드묾)은 버림 정수로."""
    return classes.get(float(area), math.floor(area))
