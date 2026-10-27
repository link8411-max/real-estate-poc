from __future__ import annotations

import hashlib
import sqlite3
from datetime import datetime, timezone
from typing import Iterable

from pipeline.molit_client import RentItem, TradeItem
from pipeline.regions import REGIONS, SUCCEEDED_BY, candidate_codes, city_of, is_retired

# 폐지 코드의 옛 이름 (regions.district_name 에 "(폐지) " 접두로 저장)
_RETIRED_NAMES = {
    "28110": "인천중구", "28140": "인천동구", "28260": "인천서구",
    "41190": "부천", "41590": "화성",
}

_BASE_SCHEMA = """
CREATE TABLE IF NOT EXISTS apartments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    lawd_cd VARCHAR(5) NOT NULL,
    dong VARCHAR(50),
    jibun VARCHAR(20),
    build_year INT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    geocode_quality TEXT,
    UNIQUE(name, lawd_cd, dong, jibun)
);
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apt_id INT REFERENCES apartments(id),
    amount BIGINT NOT NULL,
    area DECIMAL(10, 4) NOT NULL,
    floor INT,
    deal_date DATE NOT NULL,
    unique_hash VARCHAR(64) UNIQUE,
    is_canceled BOOLEAN DEFAULT FALSE,
    cancel_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS transaction_insights (
    transaction_id INT PRIMARY KEY REFERENCES transactions(id),
    peak_drop_pct INT,
    gap_ratio INT,
    is_new_high BOOLEAN,
    summary_text TEXT
);
CREATE INDEX IF NOT EXISTS idx_trans_deal_date ON transactions(deal_date DESC);
CREATE INDEX IF NOT EXISTS idx_trans_apt_id ON transactions(apt_id);
CREATE INDEX IF NOT EXISTS idx_apt_lawd_cd ON apartments(lawd_cd);

CREATE TABLE IF NOT EXISTS regions (
    code VARCHAR(5) PRIMARY KEY,
    city_name VARCHAR(20) NOT NULL,
    district_name VARCHAR(20) NOT NULL,
    succeeded_by TEXT
);
CREATE TABLE IF NOT EXISTS rents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apt_id INT REFERENCES apartments(id),
    deposit INT NOT NULL,
    monthly_rent INT NOT NULL,
    area REAL NOT NULL,
    floor INT,
    deal_date TEXT NOT NULL,
    contract_type TEXT,
    contract_term TEXT,
    use_rr_right INT,
    pre_deposit INT,
    pre_monthly_rent INT,
    unique_hash TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rents_apt_id ON rents(apt_id);
CREATE TABLE IF NOT EXISTS apartment_aliases (
    old_id INTEGER PRIMARY KEY,
    canonical_id INT NOT NULL
);
CREATE TABLE IF NOT EXISTS changed_apartments (
    apt_id INTEGER PRIMARY KEY,
    changed_at TEXT
);
"""


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


def _add_column(conn: sqlite3.Connection, table: str, column: str, decl: str) -> None:
    if column not in _columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


def migrate(conn: sqlite3.Connection) -> None:
    """멱등 마이그레이션: 신규 DB는 전부 만들고, 운영 DB 모양에는 빠진 것만 추가한다."""
    conn.executescript(_BASE_SCHEMA)
    # 레거시(구 서버 시작 스크립트/Actions) 스키마 보강: 이후 코드가 읽고 쓰는 컬럼을 보장한다.
    _add_column(conn, "apartments", "latitude", "REAL")
    _add_column(conn, "apartments", "longitude", "REAL")
    _add_column(conn, "apartments", "geocode_quality", "TEXT")
    _add_column(conn, "transactions", "is_canceled", "BOOLEAN DEFAULT FALSE")
    _add_column(conn, "transactions", "cancel_date", "DATE")
    _add_column(conn, "transactions", "unique_hash", "VARCHAR(64)")
    _add_column(conn, "transactions", "created_at", "TIMESTAMP")  # ALTER 는 CURRENT_TIMESTAMP 기본값 불가
    _add_column(conn, "apartments", "apt_seq", "TEXT")
    _add_column(conn, "apartments", "household_count", "INT")
    _add_column(conn, "regions", "succeeded_by", "TEXT")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_apt_seq ON apartments(apt_seq) WHERE apt_seq IS NOT NULL"
    )
    rows = [(c, city_of(c), name, None) for c, name in REGIONS.items()]
    rows += [
        (old, city_of(old), "(폐지) " + _RETIRED_NAMES[old], ",".join(news))
        for old, news in SUCCEEDED_BY.items()
    ]
    conn.executemany(
        "INSERT INTO regions(code, city_name, district_name, succeeded_by) VALUES (?,?,?,?) "
        "ON CONFLICT(code) DO UPDATE SET city_name=excluded.city_name, "
        "district_name=excluded.district_name, succeeded_by=excluded.succeeded_by",
        rows,
    )
    try:  # FTS5 trigram 이 없는 SQLite 빌드에서도 마이그레이션은 계속된다.
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS apartments_fts USING fts5("
            "name, dong, content='apartments', content_rowid='id', tokenize='trigram')"
        )
    except sqlite3.OperationalError:
        pass
    conn.commit()


def upsert_apartment(
    conn: sqlite3.Connection, *, name: str, lawd_cd: str, dong: str, jibun: str,
    build_year: int | None, apt_seq: str | None,
) -> int:
    if apt_seq:
        row = conn.execute("SELECT id FROM apartments WHERE apt_seq=?", (apt_seq,)).fetchone()
        if row:
            return row[0]
    codes = candidate_codes(lawd_cd)
    marks = ",".join("?" * len(codes))
    row = conn.execute(
        f"SELECT id, apt_seq, lawd_cd FROM apartments "
        f"WHERE dong=? AND jibun=? AND name=? AND lawd_cd IN ({marks}) "
        f"ORDER BY (lawd_cd=?) DESC, id LIMIT 1",
        (dong, jibun, name, *codes, lawd_cd),
    ).fetchone()
    if row:
        apt_id, cur_seq, cur_cd = row[0], row[1], row[2]
        if not cur_seq and apt_seq:
            conn.execute("UPDATE apartments SET apt_seq=? WHERE id=?", (apt_seq, apt_id))
        if is_retired(cur_cd) and cur_cd != lawd_cd:
            conn.execute("UPDATE apartments SET lawd_cd=? WHERE id=?", (lawd_cd, apt_id))
        return apt_id
    cur = conn.execute(
        "INSERT INTO apartments(name, lawd_cd, dong, jibun, build_year, apt_seq) VALUES (?,?,?,?,?,?)",
        (name, lawd_cd, dong, jibun, build_year, apt_seq),
    )
    return cur.lastrowid


def mark_changed(conn: sqlite3.Connection, apt_ids: Iterable[int]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    conn.executemany(
        "INSERT INTO changed_apartments(apt_id, changed_at) VALUES (?,?) "
        "ON CONFLICT(apt_id) DO UPDATE SET changed_at=excluded.changed_at",
        [(i, now) for i in apt_ids],
    )


def pop_changed(conn: sqlite3.Connection) -> list[int]:
    with conn:
        ids = sorted(r[0] for r in conn.execute("SELECT apt_id FROM changed_apartments"))
        conn.execute("DELETE FROM changed_apartments")
    return ids


def _md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def insert_trade(conn: sqlite3.Connection, apt_id: int, item: TradeItem) -> bool:
    # 기존 insight_engine.generate_deal_hash 와 동일한 규칙 (과거 행과 중복 판정 유지)
    h = _md5(f"{item.apt_name}|{item.floor}|{item.area}|{item.deal_date}|{item.amount}")
    row = conn.execute("SELECT id, cancel_date FROM transactions WHERE unique_hash=?", (h,)).fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO transactions(apt_id, amount, area, floor, deal_date, unique_hash, "
            "is_canceled, cancel_date) VALUES (?,?,?,?,?,?,?,?)",
            (apt_id, item.amount, item.area, item.floor, item.deal_date, h,
             1 if item.cancel_date else 0, item.cancel_date),
        )
    elif item.cancel_date and not row[1]:
        conn.execute(
            "UPDATE transactions SET cancel_date=?, is_canceled=1 WHERE id=?", (item.cancel_date, row[0])
        )
    else:
        return False
    mark_changed(conn, [apt_id])
    return True


def insert_rent(conn: sqlite3.Connection, apt_id: int, item: RentItem) -> bool:
    h = _md5(
        f"R|{item.apt_name}|{item.floor}|{item.area}|{item.deal_date}|{item.deposit}|{item.monthly_rent}"
    )
    cur = conn.execute(
        "INSERT OR IGNORE INTO rents(apt_id, deposit, monthly_rent, area, floor, deal_date, "
        "contract_type, contract_term, use_rr_right, pre_deposit, pre_monthly_rent, unique_hash) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (apt_id, item.deposit, item.monthly_rent, item.area, item.floor, item.deal_date,
         item.contract_type, item.contract_term,
         None if item.use_rr_right is None else int(item.use_rr_right),
         item.pre_deposit, item.pre_monthly_rent, h),
    )
    if cur.rowcount == 0:
        return False
    mark_changed(conn, [apt_id])
    return True
