from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import date, datetime, timezone
from typing import Any, Callable

import requests

from pipeline.db import connect
from pipeline.export_json import build_stats
from pipeline.regions import REGIONS, SUCCEEDED_BY, city_of
from pipeline.summary import apartment_summary


class SupabaseError(Exception):
    def __init__(self, status: int, text: str) -> None:
        super().__init__(f"Supabase {status}: {text}")
        self.status = status
        self.text = text


def _credentials(url: str | None, key: str | None) -> tuple[str, str]:
    url = url or os.environ.get("SUPABASE_URL")
    key = key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url:
        raise ValueError("SUPABASE_URL 환경변수가 필요합니다")
    if not key:
        raise ValueError("SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다")
    return url.rstrip("/"), key


def _upsert(
    table: str, conflict: str, rows: list[dict[str, Any]], url: str | None, key: str | None,
    session: Any, batch: int,
) -> int:
    url, key = _credentials(url, key)
    session = session if session is not None else requests
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    endpoint = f"{url}/rest/v1/{table}?on_conflict={conflict}"
    for i in range(0, len(rows), batch):
        resp = session.post(endpoint, headers=headers, data=json.dumps(rows[i:i + batch]))
        if not 200 <= resp.status_code < 300:
            raise SupabaseError(resp.status_code, resp.text[:300])
    return len(rows)


def upsert_apartments(
    rows: list[dict[str, Any]], *, url: str | None = None, key: str | None = None,
    session: Any = None, batch: int = 500,
) -> int:
    return _upsert("apartments", "id", rows, url, key, session, batch)


def upsert_regions(
    rows: list[dict[str, Any]], *, url: str | None = None, key: str | None = None,
    session: Any = None, batch: int = 500,
) -> int:
    return _upsert("regions", "code", rows, url, key, session, batch)


def region_rows(conn: sqlite3.Connection, today: date) -> list[dict[str, Any]]:
    agg = {
        r[0]: (r[1], r[2], r[3])
        for r in conn.execute(
            "SELECT lawd_cd, COUNT(*), AVG(latitude), AVG(longitude) FROM apartments GROUP BY lawd_cd"
        )
    }
    avg_amount = {r["code"]: r["avg_amount"] for r in build_stats(conn, today)["regions"]}
    names = {r[0]: r[1] for r in conn.execute("SELECT code, district_name FROM regions")}
    now = datetime.now(timezone.utc).isoformat()
    out: list[dict[str, Any]] = []
    for code in [*REGIONS, *SUCCEEDED_BY]:
        count, lat, lng = agg.get(code, (0, None, None))
        retired = code in SUCCEEDED_BY
        out.append({
            "code": code,
            "name": REGIONS[code] if not retired else names.get(code, "(폐지) " + code),
            "city": city_of(code),
            "succeeded_by": ",".join(SUCCEEDED_BY[code]) if retired else None,
            "lat": lat,
            "lng": lng,
            "apartment_count": count,
            "avg_amount": None if retired else avg_amount.get(code),
            "updated_at": now,
        })
    return out


def sync(
    conn: sqlite3.Connection, apt_ids: list[int] | None, today: date, *,
    upsert_apts: Callable[[list[dict[str, Any]]], int] = upsert_apartments,
    upsert_regs: Callable[[list[dict[str, Any]]], int] = upsert_regions,
) -> tuple[int, int]:
    if apt_ids is None:
        ids = [r[0] for r in conn.execute("SELECT id FROM apartments ORDER BY id")]
        affected: set[str] | None = None
    else:
        ids = sorted(set(apt_ids))
        marks = ",".join("?" * len(ids))
        affected = {
            r[0] for r in conn.execute(f"SELECT DISTINCT lawd_cd FROM apartments WHERE id IN ({marks})", ids)
        }
    sent = 0
    for i in range(0, len(ids), 500):
        sent += upsert_apts([apartment_summary(conn, a, today) for a in ids[i:i + 500]])
    regs = [r for r in region_rows(conn, today) if affected is None or r["code"] in affected]
    return sent, upsert_regs(regs) if regs else 0


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m pipeline.supabase_sync")
    p.add_argument("--db", required=True)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--changed", metavar="FILE", help="collect 가 쓴 변경 단지 id JSON 목록")
    g.add_argument("--all", action="store_true")
    p.add_argument("--today", metavar="YYYY-MM-DD")
    return p


def main(argv: list[str] | None = None) -> int:
    try:
        a = _build_parser().parse_args(argv)
        today = date.fromisoformat(a.today) if a.today else date.today()
    except SystemExit as e:
        return int(e.code or 0)
    except ValueError:
        print("--today 는 YYYY-MM-DD 형식이어야 합니다", file=sys.stderr)
        return 2
    apt_ids: list[int] | None = None
    if a.changed:
        try:
            with open(a.changed, encoding="utf-8") as f:
                apt_ids = [int(i) for i in json.load(f)]
        except (OSError, ValueError, TypeError) as e:
            print(f"--changed 파일을 읽을 수 없습니다: {e}", file=sys.stderr)
            return 2
    try:
        _credentials(None, None)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 2
    conn = connect(a.db)
    try:
        n_apt, n_reg = sync(conn, apt_ids, today)
    except SupabaseError as e:
        print(str(e), file=sys.stderr)
        return 1
    finally:
        conn.close()
    print(f"apartments {n_apt}, regions {n_reg} 동기화")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
