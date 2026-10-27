from __future__ import annotations

import argparse
import sqlite3
import sys
from collections import defaultdict

from pipeline.db import connect, mark_changed, migrate
from pipeline.regions import candidate_codes


def migrate_coords(src_db: str, dst_conn) -> int:
    """옛 로컬 DB의 좌표를 (dong, jibun, name) 일치 행에 복사한다. 좌표 없는 dst 행만."""
    src = sqlite3.connect(f"file:{src_db}?mode=ro", uri=True)
    try:
        by_key: dict[tuple, list[tuple]] = defaultdict(list)
        for name, lawd, dong, jibun, lat, lng, q in src.execute(
            "SELECT name, lawd_cd, dong, jibun, latitude, longitude, geocode_quality "
            "FROM apartments WHERE latitude IS NOT NULL"
        ):
            by_key[(dong, jibun, name)].append((lawd, lat, lng, q))
    finally:
        src.close()

    copied = 0
    rows = dst_conn.execute(
        "SELECT id, name, lawd_cd, dong, jibun FROM apartments WHERE latitude IS NULL"
    ).fetchall()
    for r in rows:
        dst_cands = set(candidate_codes(r["lawd_cd"]))
        for lawd, lat, lng, q in by_key.get((r["dong"], r["jibun"], r["name"]), []):
            if lawd in dst_cands or r["lawd_cd"] in candidate_codes(lawd):
                dst_conn.execute(
                    "UPDATE apartments SET latitude=?, longitude=?, geocode_quality=? WHERE id=?",
                    (lat, lng, q or "legacy", r["id"]),
                )
                mark_changed(dst_conn, [r["id"]])
                copied += 1
                break
    dst_conn.commit()
    return copied


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="옛 로컬 DB에서 좌표 이식")
    p.add_argument("--src", required=True)
    p.add_argument("--db", required=True)
    a = p.parse_args(argv)
    conn = connect(a.db)
    migrate(conn)
    print(f"copied {migrate_coords(a.src, conn)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
