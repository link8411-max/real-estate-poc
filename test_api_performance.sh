#!/bin/bash
# API 성능 테스트 스크립트

API_BASE="http://127.0.0.1:8000"
RUNS=10

echo "=========================================="
echo "API 성능 테스트 시작"
echo "=========================================="

# 1. 서버 재시작 후 콜드 스타트 테스트
echo ""
echo "[테스트 1] 서버 재시작 후 첫 호출 (콜드 스타트)"
echo "-------------------------------------------"
lsof -ti :8000 | xargs kill -9 2>/dev/null
sleep 1
cd /Users/hongseong-il/.gemini/antigravity/scratch/real-estate-poc
python3 api_server.py > /dev/null 2>&1 &
sleep 2

echo "첫 번째 호출:"
time curl -s -o /dev/null -w "HTTP %{http_code} | Total: %{time_total}s | TTFB: %{time_starttransfer}s | Connect: %{time_connect}s\n" \
  "$API_BASE/api/search?q=기흥&limit=30"

echo "두 번째 호출:"
time curl -s -o /dev/null -w "HTTP %{http_code} | Total: %{time_total}s | TTFB: %{time_starttransfer}s | Connect: %{time_connect}s\n" \
  "$API_BASE/api/search?q=기흥&limit=30"

echo "세 번째 호출:"
time curl -s -o /dev/null -w "HTTP %{http_code} | Total: %{time_total}s | TTFB: %{time_starttransfer}s | Connect: %{time_connect}s\n" \
  "$API_BASE/api/search?q=기흥&limit=30"

# 2. 연속 호출 테스트
echo ""
echo "[테스트 2] 연속 ${RUNS}회 호출 (검색 API)"
echo "-------------------------------------------"
for i in $(seq 1 $RUNS); do
  curl -s -o /dev/null -w "[$i] Total: %{time_total}s | TTFB: %{time_starttransfer}s\n" \
    "$API_BASE/api/search?q=강남&limit=30"
done

# 3. 거래 API 테스트
echo ""
echo "[테스트 3] 거래 API ${RUNS}회"
echo "-------------------------------------------"
for i in $(seq 1 $RUNS); do
  curl -s -o /dev/null -w "[$i] Total: %{time_total}s | TTFB: %{time_starttransfer}s\n" \
    "$API_BASE/api/transactions?limit=6"
done

# 4. 통계 API 테스트
echo ""
echo "[테스트 4] 통계 API ${RUNS}회"
echo "-------------------------------------------"
for i in $(seq 1 $RUNS); do
  curl -s -o /dev/null -w "[$i] Total: %{time_total}s | TTFB: %{time_starttransfer}s\n" \
    "$API_BASE/api/stats"
done

# 5. CORS Preflight 시뮬레이션 (OPTIONS 요청)
echo ""
echo "[테스트 5] CORS Preflight (OPTIONS) 테스트"
echo "-------------------------------------------"
for i in $(seq 1 5); do
  curl -s -o /dev/null -w "[$i] OPTIONS Total: %{time_total}s | TTFB: %{time_starttransfer}s\n" \
    -X OPTIONS \
    -H "Origin: http://localhost:3000" \
    -H "Access-Control-Request-Method: GET" \
    "$API_BASE/api/search?q=기흥&limit=30"
done

# 6. 병렬 호출 테스트
echo ""
echo "[테스트 6] 병렬 5개 호출"
echo "-------------------------------------------"
for i in $(seq 1 3); do
  echo "라운드 $i:"
  time (
    curl -s -o /dev/null "$API_BASE/api/search?q=잠실&limit=30" &
    curl -s -o /dev/null "$API_BASE/api/search?q=반포&limit=30" &
    curl -s -o /dev/null "$API_BASE/api/search?q=강남&limit=30" &
    curl -s -o /dev/null "$API_BASE/api/transactions?limit=6" &
    curl -s -o /dev/null "$API_BASE/api/stats" &
    wait
  )
done

# 7. 새 연결 vs 기존 연결
echo ""
echo "[테스트 7] 연결 재사용 vs 새 연결"
echo "-------------------------------------------"
echo "연결 재사용 (keep-alive):"
time curl -s -o /dev/null -w "Total: %{time_total}s\n" \
  "$API_BASE/api/search?q=분당&limit=30" \
  "$API_BASE/api/search?q=판교&limit=30" \
  "$API_BASE/api/search?q=광교&limit=30"

echo ""
echo "매번 새 연결:"
time (
  curl -s -o /dev/null --no-keepalive -w "[1] Total: %{time_total}s\n" "$API_BASE/api/search?q=분당&limit=30"
  curl -s -o /dev/null --no-keepalive -w "[2] Total: %{time_total}s\n" "$API_BASE/api/search?q=판교&limit=30"
  curl -s -o /dev/null --no-keepalive -w "[3] Total: %{time_total}s\n" "$API_BASE/api/search?q=광교&limit=30"
)

echo ""
echo "=========================================="
echo "테스트 완료"
echo "=========================================="
