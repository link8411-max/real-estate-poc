#!/bin/bash
# Render 시작 스크립트
# 1. R2에서 DB 다운로드
# 2. uvicorn 실행

set -e

echo "=== Starting API Server ==="
echo "Time: $(date)"

# R2에서 DB 다운로드 (환경변수가 설정된 경우)
if [ -n "$R2_ENDPOINT" ]; then
    echo "[STARTUP] Downloading database from R2..."
    python r2_utils.py download || {
        echo "[STARTUP] Warning: Failed to download DB from R2, using existing or empty DB"
    }
else
    echo "[STARTUP] R2 not configured, skipping DB download"
fi

# DB 파일 확인
if [ -f "real_estate.db" ]; then
    DB_SIZE=$(du -h real_estate.db | cut -f1)
    echo "[STARTUP] Database ready: real_estate.db ($DB_SIZE)"
else
    echo "[STARTUP] Warning: No database file found"
fi

# uvicorn 실행
echo "[STARTUP] Starting uvicorn..."
exec uvicorn api_server:app --host 0.0.0.0 --port ${PORT:-8000}
