"""국토부 단지명 변경으로 둘로 쪼개진 단지를 1:1로 확실한 쌍만 합친다.

L = apt_seq 없는 옛 단지, N = apt_seq 있는 새 단지. 같은 (lawd_cd, dong, jibun, build_year)에
L 정확히 1개와 N 정확히 1개만 있고, 거래 이력이 이름 변경 모양일 때만 합친다
(L 에 N 첫 거래 전 이력이 있고, 1년 넘게 끊기지 않았으며, N 첫 거래일 이후 L 거래는 모두 N 거래와 중복). 나머지는 사유와 함께 '애매'로 보고만 한다.
남는 쪽은 L 의 id, 이름·apt_seq 는 N 의 것. 사라진 N 의 id 는 apartment_aliases 에 남긴다.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import date, timedelta
from typing import Any

MAX_GAP_DAYS = 365  # L 마지막 거래 >= N 첫 거래 - 365일

# 묶음 찾기는 apartments 한 번 GROUP BY (거래 테이블은 보지 않는다 — 매일 migrate 에서 돈다).
_GROUPS_SQL = """
SELECT lawd_cd, dong, jibun, build_year,
       group_concat(CASE WHEN apt_seq IS NULL THEN id END),
       group_concat(CASE WHEN apt_seq IS NOT NULL THEN id END)
FROM apartments
WHERE jibun IS NOT NULL AND jibun != '' AND build_year IS NOT NULL AND dong IS NOT NULL
GROUP BY lawd_cd, dong, jibun, build_year
HAVING SUM(apt_seq IS NULL) > 0 AND SUM(apt_seq IS NOT NULL) > 0
ORDER BY lawd_cd, dong, jibun, build_year
"""


def _ids(csv: str | None) -> list[int]:
    return sorted(int(x) for x in csv.split(",")) if csv else []


def _groups(conn: sqlite3.Connection) -> list[tuple[Any, ...]]:
    return [(r[0], r[1], r[2], r[3], _ids(r[4]), _ids(r[5])) for r in conn.execute(_GROUPS_SQL)]


def _trade_key(r: tuple[Any, ...]) -> tuple[Any, ...]:
    # r = (deal_date, floor, area, amount) — 계획의 매매 중복 키
    return (r[0], r[1], round(float(r[2]), 2), r[3])


def _rename_reason(conn: sqlite3.Connection, keep_id: int, drop_id: int) -> str | None:
    """1×1 후보가 확실한 이름 변경이면 None, 아니면 애매 사유.

    확실한 이름 변경 = N 에 거래가 있고, L 에 N 첫 거래일보다 이른 거래가 있으며(L 이 옛 이력),
    L 마지막 거래가 N 첫 거래 365일 전 이후이고(이력이 이어짐),
    N 첫 거래일 이후의 L 거래는 전부 N 거래와 중복(같은 거래가 두 이름으로 들어온 것)일 때.
    1×1 후보(수십 개)에만 부른다 — 단지별 거래만 읽는다(idx_trans_apt_id).
    """
    sql = "SELECT deal_date, floor, area, amount FROM transactions WHERE apt_id = ?"
    n_rows = conn.execute(sql, (drop_id,)).fetchall()
    if not n_rows:
        return "new_has_no_trades"
    first = min(r[0] for r in n_rows)
    l_rows = conn.execute(sql, (keep_id,)).fetchall()
    if not any(r[0] < first for r in l_rows):
        return "no_older_history"
    last = max(r[0] for r in l_rows)
    if date.fromisoformat(last[:10]) < date.fromisoformat(first[:10]) - timedelta(days=MAX_GAP_DAYS):
        return "history_gap"  # 1년 넘게 끊긴 이력은 재건축 등일 수 있다
    pool: dict[tuple[Any, ...], int] = {}
    for r in n_rows:
        k = _trade_key(r)
        pool[k] = pool.get(k, 0) + 1
    for r in l_rows:
        if r[0] < first:
            continue
        k = _trade_key(r)
        if not pool.get(k):
            return "overlapping_distinct_trades"
        pool[k] -= 1
    return None


def _shape_reason(legacy: list[int], new: list[int]) -> str | None:
    if len(legacy) == 1 and len(new) == 1:
        return None
    if len(legacy) == 1:
        return "one_to_many"
    if len(new) == 1:
        return "many_to_one"
    return "many_to_many"


def _classify(conn: sqlite3.Connection, groups: list[tuple[Any, ...]]) -> list[tuple[tuple[Any, ...], str | None]]:
    out = []
    for g in groups:
        reason = _shape_reason(g[4], g[5])
        if reason is None:
            reason = _rename_reason(conn, g[4][0], g[5][0])
        out.append((g, reason))
    return out


def _pairs(conn: sqlite3.Connection) -> list[tuple[int, int]]:
    # 묶음 안의 후보 관계는 L×N 전부이므로 'L 의 후보 N 1개이고 N 의 후보 L 1개' == 묶음이 정확히 1×1.
    # 그중 거래 이력상 확실한 이름 변경만 쌍으로 본다.
    return [(g[4][0], g[5][0]) for g, reason in _classify(conn, _groups(conn)) if reason is None]


def _info(conn: sqlite3.Connection, apt_id: int) -> tuple[Any, ...]:
    return tuple(conn.execute(
        "SELECT a.id, a.name, a.apt_seq, (SELECT COUNT(*) FROM transactions t WHERE t.apt_id = a.id) "
        "FROM apartments a WHERE a.id = ?", (apt_id,),
    ).fetchone())


def find_rename_pairs(conn: sqlite3.Connection) -> tuple[list[tuple[int, int]], list[dict[str, Any]]]:
    pairs: list[tuple[int, int]] = []
    ambiguous: list[dict[str, Any]] = []
    for (lawd_cd, dong, jibun, build_year, legacy, new), reason in _classify(conn, _groups(conn)):
        if reason is None:
            pairs.append((legacy[0], new[0]))
            continue
        ambiguous.append({
            "lawd_cd": lawd_cd, "dong": dong, "jibun": jibun, "build_year": build_year, "reason": reason,
            "legacy": [{"id": r[0], "name": r[1], "trades": r[3]} for r in (_info(conn, i) for i in legacy)],
            "new": [{"id": r[0], "name": r[1], "apt_seq": r[2], "trades": r[3]}
                    for r in (_info(conn, i) for i in new)],
        })
    return pairs, ambiguous


def _match(conn: sqlite3.Connection, table: str, values: str, keep_id: int, drop_id: int,
           extra: str = "") -> tuple[list[tuple[tuple[Any, ...], tuple[Any, ...]]], int]:
    """자연키 (deal_date, floor, round(area,2), values...) 가 같은 L 행과 N 행을 1:1로 짝짓는다.

    행 모양: (id, deal_date, floor, area, *values, *extra). 반환: (짝 목록, N 행 수).
    """
    n_vals = len(values.split(","))
    sql = f"SELECT id, deal_date, floor, area, {values}{extra} FROM {table} WHERE apt_id = ? ORDER BY id"

    def key(r: tuple[Any, ...]) -> tuple[Any, ...]:
        return (r[1], r[2], round(float(r[3]), 2), *r[4:4 + n_vals])

    pool: dict[tuple[Any, ...], list[tuple[Any, ...]]] = {}
    drop_rows = [tuple(r) for r in conn.execute(sql, (drop_id,))]
    for r in drop_rows:
        pool.setdefault(key(r), []).append(r)
    matched = []
    for r in (tuple(x) for x in conn.execute(sql, (keep_id,)).fetchall()):
        cands = pool.get(key(r))
        if cands:
            matched.append((r, cands.pop(0)))
    return matched, len(drop_rows)


def merge_pair(conn: sqlite3.Connection, keep_id: int, drop_id: int) -> dict[str, int]:
    """drop_id(N) 를 keep_id(L) 로 합친다. 커밋은 호출자가 한다."""
    from pipeline.db import mark_changed  # 순환 import 회피

    # 매매: 중복이면 N 행을 남기고 L 행을 지운다(L 에만 해제일이 있으면 N 행에 옮긴다).
    dups, n_trades = _match(conn, "transactions", "amount", keep_id, drop_id, ", cancel_date")
    for l_row, n_row in dups:
        if l_row[5] and not n_row[5]:
            conn.execute("UPDATE transactions SET cancel_date = ?, is_canceled = 1 WHERE id = ?",
                         (l_row[5], n_row[0]))
    gone = [(l_row[0],) for l_row, _ in dups]
    conn.executemany("DELETE FROM transaction_insights WHERE transaction_id = ?", gone)
    conn.executemany("DELETE FROM transactions WHERE id = ?", gone)
    conn.execute("UPDATE transactions SET apt_id = ? WHERE apt_id = ?", (keep_id, drop_id))

    rdups, n_rents = _match(conn, "rents", "deposit, monthly_rent", keep_id, drop_id)
    conn.executemany("DELETE FROM rents WHERE id = ?", [(l_row[0],) for l_row, _ in rdups])
    conn.execute("UPDATE rents SET apt_id = ? WHERE apt_id = ?", (keep_id, drop_id))

    name, seq, lat, lng, quality, households = conn.execute(
        "SELECT name, apt_seq, latitude, longitude, geocode_quality, household_count "
        "FROM apartments WHERE id = ?", (drop_id,),
    ).fetchone()
    # apt_seq 유니크 인덱스·UNIQUE(name, lawd_cd, dong, jibun) 때문에 N 을 먼저 지운다.
    conn.execute("DELETE FROM apartments WHERE id = ?", (drop_id,))
    conn.execute(
        "UPDATE apartments SET name = ?, apt_seq = ?, "
        "geocode_quality = CASE WHEN latitude IS NULL THEN ? ELSE geocode_quality END, "
        "longitude = CASE WHEN latitude IS NULL THEN ? ELSE longitude END, "
        "latitude = COALESCE(latitude, ?), household_count = COALESCE(household_count, ?) WHERE id = ?",
        (name, seq, quality, lng, lat, households, keep_id),
    )
    conn.execute("UPDATE apartment_aliases SET canonical_id = ? WHERE canonical_id = ?", (keep_id, drop_id))
    conn.execute(
        "INSERT INTO apartment_aliases(old_id, canonical_id) VALUES (?, ?) "
        "ON CONFLICT(old_id) DO UPDATE SET canonical_id = excluded.canonical_id",
        (drop_id, keep_id),
    )
    mark_changed(conn, [keep_id, drop_id])  # N 은 {"moved_to"} stub·Supabase 삭제 대상으로 나간다
    return {
        "moved_trades": n_trades, "dropped_dup_trades": len(dups),
        "moved_rents": n_rents, "dropped_dup_rents": len(rdups),
    }


def merge_renamed(conn: sqlite3.Connection) -> int:
    """1:1 쌍을 모두 합치고 쌍 개수를 돌려준다. 쌍마다 한 트랜잭션."""
    pairs = _pairs(conn)
    for keep_id, drop_id in pairs:
        with conn:
            merge_pair(conn, keep_id, drop_id)
    return len(pairs)


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m pipeline.merge_apartments")
    p.add_argument("--db", required=True)
    p.add_argument("--report", required=True, metavar="FILE")
    p.add_argument("--dry-run", action="store_true")
    return p


def main(argv: list[str] | None = None) -> int:
    from pipeline.db import connect  # 순환 import 회피

    try:
        a = _build_parser().parse_args(argv)
    except SystemExit as e:
        return int(e.code or 0)
    # migrate 는 부르지 않는다: migrate 가 곧바로 합쳐 버려 dry-run 이 무의미해진다.
    conn = connect(a.db)
    try:
        pairs, ambiguous = find_rename_pairs(conn)
        report: dict[str, Any] = {"dry_run": a.dry_run, "pairs": [], "ambiguous": ambiguous}
        for k, d in pairs:
            lk, ld = _info(conn, k), _info(conn, d)
            report["pairs"].append({
                "keep_id": k, "drop_id": d, "legacy_name": lk[1], "new_name": ld[1], "apt_seq": ld[2],
                "legacy_trades": lk[3], "new_trades": ld[3],
            })
        if not a.dry_run:
            results = []
            for k, d in pairs:
                with conn:
                    results.append({"keep_id": k, "drop_id": d, **merge_pair(conn, k, d)})
            report["results"] = results
    finally:
        conn.close()
    with open(a.report, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"쌍 {len(pairs)}개{' (dry-run, 바꾸지 않음)' if a.dry_run else ' 합침'}, 애매 {len(ambiguous)}개 -> {a.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
