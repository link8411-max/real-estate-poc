"""단지 → 건축물대장 조회 키(sigunguCd·bjdongCd·bun·ji).

국토부 매매 응답의 법정동코드·본번·부번을 저장해 두고, 없는 단지는 지번과
같은 동의 다른 단지 법정동코드로 보충한다.
"""
from __future__ import annotations

import re
import sqlite3
from typing import NamedTuple

_JIBUN = re.compile(r"^(\d+)(?:-(\d+))?$")


class RegisterKey(NamedTuple):
    sigungu_cd: str
    bjdong_cd: str
    bun: str  # 4자리 0채움
    ji: str  # 4자리 0채움


def register_keys(conn: sqlite3.Connection, apt_id: int) -> RegisterKey | None:
    row = conn.execute(
        "SELECT lawd_cd, dong, jibun, umd_cd, bonbun, bubun FROM apartments WHERE id=?", (apt_id,)
    ).fetchone()
    if not row:
        return None
    lawd, dong, jibun, umd, bonbun, bubun = row
    if umd and bonbun and bubun:
        return RegisterKey(lawd, umd, bonbun, bubun)
    m = _JIBUN.match(jibun or "")
    if not m:  # 산·외·복수 부번 등은 대장 키로 만들 수 없다
        return None
    if not umd:
        r = conn.execute(
            "SELECT umd_cd FROM apartments WHERE lawd_cd=? AND dong=? AND umd_cd IS NOT NULL LIMIT 1",
            (lawd, dong),
        ).fetchone()
        if not r:
            return None
        umd = r[0]
    return RegisterKey(lawd, umd, m.group(1).zfill(4), (m.group(2) or "0").zfill(4))
