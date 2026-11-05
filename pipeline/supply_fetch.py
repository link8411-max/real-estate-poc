"""건축물대장 전유공용면적 수집기: 단지별 주택형 공급면적을 register_types 에 저장한다.

호출 예산 안에서 최근 3년 매매가 많은 단지부터 처리하고, 거래·전월세에 나온
전용면적이 모두 잡히면(±0.05) 남은 페이지는 건너뛴다.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

import requests

from pipeline import molit_client
from pipeline.db import connect, migrate
from pipeline.register_keys import _JIBUN, register_keys
from pipeline.supply import UnitAccumulator, types_from_units

URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo"
PAGE_SIZE = 100
MAX_PAGES = 30
CALL_GAP = 0.1  # 호출 사이 대기(초)
TOLERANCE = 0.05
MAX_CONSECUTIVE_ERRORS = 20  # 연속 이만큼 오류로 끝나면 중단(키 오류·서비스 장애 추정)


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
    code = str(header.get("resultCode"))
    if code == "03":  # NODATA: 결과 없음은 오류가 아니라 빈 응답
        return [], 0
    if code != "00":
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
    if types is not None and status not in ("error", "empty"):  # 오류·빈 응답이면 이전 결과를 그대로 둔다
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
        row = conn.execute("SELECT jibun FROM apartments WHERE id=?", (apt_id,)).fetchone()
        if not row or not _JIBUN.match(row[0] or ""):
            _record(conn, apt_id, "no_key", 0)  # 지번 자체를 쓸 수 없음: 영구
        # 지번은 정상인데 법정동 코드를 아직 모르면 기록하지 않고 큐에 둔다(Backfill 후 채워짐)
        return 0
    wanted = wanted_areas(conn, apt_id)
    if not wanted:  # 거래·전월세가 없으면 가져올 면적이 없다
        _record(conn, apt_id, "done", 0, None)
        return 0
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
        WHERE (f.apt_id IS NULL OR f.status = 'error')
          AND a.id NOT IN (SELECT old_id FROM apartment_aliases)
        ORDER BY n DESC, a.id ASC
        """
    ).fetchall()
    return [r[0] for r in rows]


def run(conn: sqlite3.Connection, session, *, budget: int, max_minutes: float | None = None,
        clock=time.monotonic) -> list[int]:
    """예산·시간 안에서 큐를 처리하고 처리(저장)한 단지 id 목록을 돌려준다."""
    left = budget
    deadline = None if max_minutes is None else clock() + max_minutes * 60
    done: list[int] = []
    errors = 0
    for apt_id in fetch_queue(conn):
        if left <= 0:
            break
        if deadline is not None and clock() >= deadline:
            print("시간 한도 도달: 진행분을 저장하고 멈춥니다")
            break
        try:
            used = fetch_apartment(conn, apt_id, session, budget=left)
        except Exception as e:  # 한 단지의 이상 데이터가 전체를 멈추지 않게
            print(f"단지 {apt_id} 처리 실패: {type(e).__name__}: {e}", file=sys.stderr)
            _record(conn, apt_id, "error", 0)
            used = 0
        left -= used
        row = conn.execute("SELECT status FROM register_fetch WHERE apt_id=?", (apt_id,)).fetchone()
        if row and row[0] == "error":
            errors += 1
            if errors >= MAX_CONSECUTIVE_ERRORS:
                print(f"연속 오류 {errors}건: 중단합니다", file=sys.stderr)
                break
        elif row:
            errors = 0
            done.append(apt_id)
        elif used > 0:  # 예산 소진으로 저장 못 함
            break
        if used > 0:
            time.sleep(CALL_GAP)
    return done


def coverage(conn: sqlite3.Connection) -> dict:
    """전환 기준: 최근 3년 매매 누적 80%를 덮는 상위 단지(top_n) 중 수집이 끝난 단지 비율."""
    rows = conn.execute(
        """
        SELECT a.id, COUNT(*) AS n FROM apartments a
        JOIN transactions t ON t.apt_id = a.id
        WHERE t.cancel_date IS NULL AND t.deal_date >= date('now', '-3 years')
        GROUP BY a.id ORDER BY n DESC, a.id ASC
        """
    ).fetchall()
    total = sum(n for _, n in rows)
    top: list[int] = []
    cum = 0
    for apt_id, n in rows:
        top.append(apt_id)
        cum += n
        if cum >= 0.8 * total:
            break
    done = 0
    for apt_id in top:
        ok = conn.execute(
            "SELECT 1 FROM register_fetch WHERE apt_id=? AND status IN ('done','partial','no_key','empty')"
            " UNION ALL SELECT 1 FROM apartment_area_types WHERE apt_id=? AND source='cheongyak' LIMIT 1",
            (apt_id, apt_id),
        ).fetchone()
        done += 1 if ok else 0
    n_top = len(top)
    return {"top_n": n_top, "done": done, "ratio": round(done / n_top, 3) if n_top else 0.0,
            "ready": done >= n_top}


def _make_session():
    return requests.Session()


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    cmd = "fetch"
    if argv and argv[0] == "coverage":
        cmd = argv.pop(0)
    ap = argparse.ArgumentParser(description="건축물대장 전유공용면적 수집 (coverage: 전환 기준 확인)")
    ap.add_argument("--db", default="real_estate.db")
    ap.add_argument("--budget", type=int, default=9500, help="이번 실행에서 쓸 최대 호출 수")
    ap.add_argument("--max-minutes", type=float, default=None, help="이 시간(분)이 지나면 깔끔히 멈춤")
    ap.add_argument("--changed-out", default="changed_apts.json")
    a = ap.parse_args(argv)
    if cmd == "coverage":
        conn = connect(a.db)
        try:
            migrate(conn)
            print(json.dumps(coverage(conn)))
        finally:
            conn.close()
        return 0
    conn = connect(a.db)
    try:
        migrate(conn)
        changed = run(conn, _make_session(), budget=a.budget, max_minutes=a.max_minutes)
    finally:
        conn.close()
    with open(a.changed_out, "w", encoding="utf-8") as f:
        json.dump(changed, f)
    print(f"처리 단지 {len(changed)}개 -> {a.changed_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
