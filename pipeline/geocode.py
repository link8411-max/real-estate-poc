from __future__ import annotations

import argparse
import os
import sys
import time

import requests
from dotenv import load_dotenv

from pipeline.db import connect, migrate
from pipeline.regions import REGION_FULLNAME

load_dotenv()

KAKAO_URL = "https://dapi.kakao.com/v2/local/search/address.json"
_FATAL_STATUSES = (401, 403, 429)


class GeocodeError(Exception):
    def __init__(self, status: int | None, text: str = ""):
        super().__init__(f"geocode error {status}: {text}")
        self.status = status
        self.text = text


def geocode_address(lawd_cd, dong, jibun, *, session=None):
    """카카오 주소검색. (lat, lng, "kakao_address") 또는 결과 없으면 None."""
    load_dotenv()
    key = os.environ.get("KAKAO_REST_API_KEY")
    if not key:
        raise GeocodeError(None, "KAKAO_REST_API_KEY not set")
    getter = session if session is not None else requests
    params = {"query": f"{REGION_FULLNAME[lawd_cd]} {dong} {jibun}"}
    headers = {"Authorization": f"KakaoAK {key}"}
    for attempt in range(4):
        resp = getter.get(KAKAO_URL, params=params, headers=headers, timeout=10)
        if resp.status_code == 429 and attempt < 3:
            time.sleep(1)
            continue
        break
    if resp.status_code != 200:
        raise GeocodeError(resp.status_code, resp.text[:200])
    docs = resp.json().get("documents") or []
    if not docs:
        return None
    return float(docs[0]["y"]), float(docs[0]["x"]), "kakao_address"


def fill_missing_coords(conn, *, limit=20000, delay=0.05, geocode=geocode_address,
                        retry_failed=False, log=print):
    """좌표 없는 단지를 지오코딩한다. (성공, 실패) 반환. 쿼터/인증 오류는 조기 종료."""
    cond = "latitude IS NULL"
    if not retry_failed:
        cond += " AND (geocode_quality IS NULL OR geocode_quality != 'failed')"
    rows = conn.execute(
        f"SELECT id, lawd_cd, dong, jibun FROM apartments WHERE {cond} ORDER BY id LIMIT ?",
        (limit,),
    ).fetchall()
    ok = failed = 0
    for i, r in enumerate(rows, 1):
        try:
            res = geocode(r["lawd_cd"], r["dong"], r["jibun"])
        except GeocodeError as e:
            if e.status in _FATAL_STATUSES or e.status is None:
                log(f"geocode stopped early ({e.status}): {e.text}")
                break
            raise
        if res:
            conn.execute(
                "UPDATE apartments SET latitude=?, longitude=?, geocode_quality=? WHERE id=?",
                (res[0], res[1], res[2], r["id"]),
            )
            ok += 1
        else:
            conn.execute("UPDATE apartments SET geocode_quality='failed' WHERE id=?", (r["id"],))
            failed += 1
        if i % 200 == 0:
            conn.commit()
        if i % 500 == 0:
            log(f"geocode {i}/{len(rows)} ok={ok} failed={failed}")
        time.sleep(delay)
    conn.commit()
    log(f"geocode done ok={ok} failed={failed}")
    return ok, failed


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="카카오 지오코딩으로 빈 좌표 채우기")
    p.add_argument("--db", required=True)
    p.add_argument("--retry-failed", action="store_true")
    p.add_argument("--limit", type=int, default=20000)
    p.add_argument("--delay", type=float, default=0.05)
    a = p.parse_args(argv)
    conn = connect(a.db)
    migrate(conn)
    fill_missing_coords(conn, limit=a.limit, delay=a.delay, retry_failed=a.retry_failed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
