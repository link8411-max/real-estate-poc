"""건축물대장 전유공용면적 수집기: 단지별 주택형 공급면적을 register_types 에 저장한다.

호출 예산 안에서 최근 3년 매매가 많은 단지부터 처리하고, 거래·전월세에 나온
전용면적이 모두 잡히면(±0.05) 남은 페이지는 건너뛴다.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import time
from datetime import datetime, timezone

import requests

from pipeline import molit_client
from pipeline.db import connect, migrate
from pipeline.register_keys import register_keys
from pipeline.supply import UnitAccumulator, types_from_units

URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo"
PAGE_SIZE = 100
MAX_PAGES = 30
CALL_GAP = 0.1  # 호출 사이 대기(초)
TOLERANCE = 0.05


class RegisterError(Exception):
    pass


class BudgetExhausted(Exception):
    pass


def _parse(data: dict) -> tuple[list[dict], int]:
    """응답 JSON → (행 목록, totalCount). item 이 dict 하나·빈 문자열이어도 처리."""
    try:
        header = data["response"]["header"]
        body = data["response"]["body"]
    except (KeyError, TypeError) as e:
        raise RegisterError("malformed response") from e
    if str(header.get("resultCode")) != "00":
        raise RegisterError(f"resultCode {header.get('resultCode')}")
    items = body.get("items")
    item = items.get("item") if isinstance(items, dict) else None
    if item is None:
        rows: list[dict] = []
    elif isinstance(item, dict):
        rows = [item]
    else:
        rows = list(item)
    try:
        total = int(body.get("totalCount") or 0)
    except (TypeError, ValueError):
        total = 0
    return rows, total


def _get_page(session, params: dict, counter: list[int], budget: int | None) -> dict:
    """한 페이지 요청. 429·502·타임아웃은 백오프 재시도, 시도마다 호출 수 1 소모."""
    last = "unknown"
    for attempt in range(molit_client.MAX_RETRIES):
        if budget is not None and counter[0] >= budget:
            raise BudgetExhausted
        counter[0] += 1
        try:
            resp = session.get(URL, params=params, timeout=molit_client.TIMEOUT)
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last = type(e).__name__
        except requests.exceptions.RequestException as e:
            raise RegisterError(str(e)) from e
        else:
            if resp.status_code in (429, 502):
                last = f"HTTP {resp.status_code}"
            elif resp.status_code != 200:
                raise RegisterError(f"HTTP {resp.status_code}")
            else:
                try:
                    return resp.json()
                except ValueError as e:
                    raise RegisterError("invalid json") from e
        if attempt < molit_client.MAX_RETRIES - 1:
            time.sleep(molit_client._backoff(attempt))
    raise RegisterError(f"max retries exceeded: {last}")


def wanted_areas(conn: sqlite3.Connection, apt_id: int) -> set[float]:
    """그 단지 매매·전월세 전용면적(소수 둘째 자리) 집합."""
    rows = conn.execute(
        "SELECT area FROM transactions WHERE apt_id=? UNION SELECT area FROM rents WHERE apt_id=?",
        (apt_id, apt_id),
    ).fetchall()
    return {round(float(r[0]), 2) for r in rows}


def _covered(wanted: set[float], found: list[float]) -> bool:
    return all(any(abs(f - w) <= TOLERANCE + 1e-9 for f in found) for w in wanted)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _record(conn: sqlite3.Connection, apt_id: int, status: str, pages: int, types=()) -> None:
    if status != "error":  # 오류면 이전 결과를 그대로 둔다
        conn.execute("DELETE FROM register_types WHERE apt_id=?", (apt_id,))
        conn.executemany(
            "INSERT INTO register_types(apt_id, excl_area, supply_area, sample_n, agreement)"
            " VALUES (?,?,?,?,?)",
            [(apt_id, t.excl, t.supply, t.sample_n, t.agreement) for t in types],
        )
    conn.execute(
        "INSERT OR REPLACE INTO register_fetch(apt_id, status, pages, fetched_at) VALUES (?,?,?,?)",
        (apt_id, status, pages, _now()),
    )
    conn.commit()


def fetch_apartment(
    conn: sqlite3.Connection, apt_id: int, session, *, max_pages: int = MAX_PAGES,
    budget: int | None = None,
) -> int:
    """한 단지를 수집해 저장하고 쓴 호출 수를 돌려준다.

    budget 은 이 단지에 쓸 수 있는 최대 호출 수. 다 쓰고도 못 끝내면 저장하지
    않고(다음 실행 때 다시 큐에) 쓴 호출 수만 돌려준다.
    """
    key = register_keys(conn, apt_id)
    if key is None:
        _record(conn, apt_id, "no_key", 0)
        return 0
    wanted = wanted_areas(conn, apt_id)
    acc = UnitAccumulator()
    counter = [0]
    pages = 0
    status = "partial"
    try:
        for page in range(1, max_pages + 1):
            if page > 1:
                time.sleep(CALL_GAP)
            params = {
                "serviceKey": os.environ.get("MOLIT_API_KEY", ""),
                "sigunguCd": key.sigungu_cd, "bjdongCd": key.bjdong_cd, "platGbCd": "0",
                "bun": key.bun, "ji": key.ji,
                "numOfRows": PAGE_SIZE, "pageNo": page, "_type": "json",
            }
            rows, total = _parse(_get_page(session, params, counter, budget))
            pages = page
            acc.add_rows(rows)
            last = not rows or page * PAGE_SIZE >= total
            if last:
                acc.close()
            found = [t.excl for t in types_from_units(acc.finished_units())]
            if wanted and _covered(wanted, found):
                status = "done"
                break
            if last:
                status = "partial" if found else "empty"
                break
        else:
            acc.close()
        if status == "partial" and not wanted:
            status = "done"
    except BudgetExhausted:
        return counter[0]
    except RegisterError:
        _record(conn, apt_id, "error", pages)
        return counter[0]
    acc.close()
    types = types_from_units(acc.finished_units())
    if not types:
        status = "empty"
    _record(conn, apt_id, status, pages, types)
    return counter[0]


def fetch_queue(conn: sqlite3.Connection) -> list[int]:
    """아직 안 했거나 오류였던 단지: 최근 3년 매매 수 내림차순, 같으면 id 오름차순."""
    rows = conn.execute(
        """
        SELECT a.id,
               (SELECT COUNT(*) FROM transactions t
                 WHERE t.apt_id = a.id AND t.cancel_date IS NULL
                   AND t.deal_date >= date('now', '-3 years')) AS n
        FROM apartments a
        LEFT JOIN register_fetch f ON f.apt_id = a.id
        WHERE f.apt_id IS NULL OR f.status = 'error'
        ORDER BY n DESC, a.id ASC
        """
    ).fetchall()
    return [r[0] for r in rows]


def run(conn: sqlite3.Connection, session, *, budget: int) -> list[int]:
    """예산 안에서 큐를 처리하고 처리(저장)한 단지 id 목록을 돌려준다."""
    left = budget
    done: list[int] = []
    for apt_id in fetch_queue(conn):
        if left <= 0:
            break
        used = fetch_apartment(conn, apt_id, session, budget=left)
        left -= used
        row = conn.execute("SELECT status FROM register_fetch WHERE apt_id=?", (apt_id,)).fetchone()
        if row and row[0] != "error":
            done.append(apt_id)
        elif row is None:  # 예산 소진으로 저장 못 함
            break
        time.sleep(CALL_GAP)
    return done


def _make_session():
    return requests.Session()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="건축물대장 전유공용면적 수집")
    ap.add_argument("--db", default="real_estate.db")
    ap.add_argument("--budget", type=int, default=9500, help="이번 실행에서 쓸 최대 호출 수")
    ap.add_argument("--changed-out", default="changed_apts.json")
    a = ap.parse_args(argv)
    conn = connect(a.db)
    try:
        migrate(conn)
        changed = run(conn, _make_session(), budget=a.budget)
    finally:
        conn.close()
    with open(a.changed_out, "w", encoding="utf-8") as f:
        json.dump(changed, f)
    print(f"처리 단지 {len(changed)}개 -> {a.changed_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
