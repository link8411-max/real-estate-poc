#!/bin/bash
# Render 시작 스크립트
# 서버 먼저 시작 → 백그라운드로 DB 다운로드 (health check 타임아웃 방지)

echo "=== Starting API Server ==="
echo "Time: $(date)"

# 빈 DB 생성 (서버 시작용)
if [ ! -f "real_estate.db" ]; then
    echo "[STARTUP] Creating empty database for initial startup..."
    sqlite3 real_estate.db <<'EOF'
CREATE TABLE IF NOT EXISTS apartments (
    id INTEGER PRIMARY KEY,
    name TEXT,
    lawd_cd TEXT,
    dong TEXT,
    jibun TEXT,
    build_year INTEGER
);
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY,
    apt_id INTEGER,
    amount INTEGER,
    area REAL,
    floor INTEGER,
    deal_date TEXT,
    unique_hash TEXT UNIQUE,
    cancel_date TEXT
);
CREATE TABLE IF NOT EXISTS transaction_insights (
    transaction_id INTEGER PRIMARY KEY,
    summary_text TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS apartments_fts USING fts5(
    name,
    dong,
    content='apartments',
    content_rowid='id',
    tokenize='trigram'
);
EOF
    echo "[STARTUP] Empty database created"
fi

# 서버를 먼저 시작 (백그라운드)
echo "[STARTUP] Starting uvicorn in background..."
uvicorn api_server:app --host 0.0.0.0 --port ${PORT:-8000} &
SERVER_PID=$!

# 서버가 시작될 때까지 잠시 대기
sleep 3

# R2에서 DB 다운로드 (서버 실행 중에 백그라운드로)
if [ -n "$R2_ENDPOINT" ]; then
    echo "[STARTUP] Downloading database from R2 in background..."
    (
        python r2_utils.py download && {
            DB_SIZE=$(du -h real_estate.db | cut -f1)
            echo "[STARTUP] Database downloaded: $DB_SIZE"

            # FTS5 인덱스 확인
            sqlite3 real_estate.db "SELECT COUNT(*) FROM apartments_fts;" 2>/dev/null || {
                echo "[STARTUP] Rebuilding FTS5 index..."
                sqlite3 real_estate.db <<'EOF'
CREATE VIRTUAL TABLE IF NOT EXISTS apartments_fts USING fts5(
    name, dong, content='apartments', content_rowid='id', tokenize='trigram'
);
INSERT OR IGNORE INTO apartments_fts(rowid, name, dong)
SELECT id, name, dong FROM apartments WHERE id NOT IN (SELECT rowid FROM apartments_fts);
EOF
            }
            echo "[STARTUP] Database ready!"
        }
    ) &
else
    echo "[STARTUP] R2 not configured, skipping DB download"
fi

# 서버 프로세스를 포그라운드로 (Render가 프로세스 추적)
wait $SERVER_PID
