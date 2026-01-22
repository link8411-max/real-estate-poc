#!/bin/bash
# 브라우저 환경 시뮬레이션 테스트

API_BASE="http://127.0.0.1:8000"

echo "=========================================="
echo "브라우저 시뮬레이션 테스트"
echo "=========================================="

# 1. 브라우저와 동일한 헤더로 요청
echo ""
echo "[테스트 1] 브라우저 헤더 시뮬레이션 (CORS)"
echo "-------------------------------------------"
for i in $(seq 1 5); do
  curl -s -o /dev/null -w "[$i] Total: %{time_total}s | TTFB: %{time_starttransfer}s | Connect: %{time_connect}s | DNS: %{time_namelookup}s\n" \
    -H "Origin: http://localhost:3000" \
    -H "Referer: http://localhost:3000/" \
    -H "Accept: */*" \
    -H "Accept-Language: ko-KR,ko;q=0.9" \
    -H "sec-fetch-dest: empty" \
    -H "sec-fetch-mode: cors" \
    -H "sec-fetch-site: cross-site" \
    "$API_BASE/api/search?q=%EA%B8%B0%ED%9D%A5&limit=30"
done

# 2. OPTIONS 후 GET (실제 CORS 플로우)
echo ""
echo "[테스트 2] CORS 전체 플로우 (OPTIONS + GET)"
echo "-------------------------------------------"
for i in $(seq 1 3); do
  echo "라운드 $i:"
  echo -n "  OPTIONS: "
  curl -s -o /dev/null -w "%{time_total}s\n" \
    -X OPTIONS \
    -H "Origin: http://localhost:3000" \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: content-type" \
    "$API_BASE/api/search?q=%EA%B8%B0%ED%9D%A5&limit=30"

  echo -n "  GET:     "
  curl -s -o /dev/null -w "%{time_total}s\n" \
    -H "Origin: http://localhost:3000" \
    "$API_BASE/api/search?q=%EA%B8%B0%ED%9D%A5&limit=30"
done

# 3. localhost vs 127.0.0.1 비교
echo ""
echo "[테스트 3] localhost vs 127.0.0.1"
echo "-------------------------------------------"
echo "127.0.0.1:"
for i in $(seq 1 3); do
  curl -s -o /dev/null -w "  [$i] Total: %{time_total}s | DNS: %{time_namelookup}s\n" \
    "http://127.0.0.1:8000/api/search?q=%EA%B8%B0%ED%9D%A5&limit=30"
done

echo "localhost:"
for i in $(seq 1 3); do
  curl -s -o /dev/null -w "  [$i] Total: %{time_total}s | DNS: %{time_namelookup}s\n" \
    "http://localhost:8000/api/search?q=%EA%B8%B0%ED%9D%A5&limit=30"
done

# 4. IPv6 테스트
echo ""
echo "[테스트 4] IPv6 (::1) 테스트"
echo "-------------------------------------------"
for i in $(seq 1 3); do
  timeout 3 curl -s -o /dev/null -w "[$i] Total: %{time_total}s | DNS: %{time_namelookup}s\n" \
    "http://[::1]:8000/api/search?q=%EA%B8%B0%ED%9D%A5&limit=30" 2>/dev/null || echo "[$i] IPv6 연결 실패 또는 타임아웃"
done

# 5. 연결 지연 상세 분석
echo ""
echo "[테스트 5] 연결 단계별 시간"
echo "-------------------------------------------"
for i in $(seq 1 5); do
  curl -s -o /dev/null -w "[$i] DNS: %{time_namelookup}s → Connect: %{time_connect}s → TLS: %{time_appconnect}s → TTFB: %{time_starttransfer}s → Total: %{time_total}s\n" \
    -H "Origin: http://localhost:3000" \
    "$API_BASE/api/search?q=%EA%B8%B0%ED%9D%A5%EC%97%AD&limit=30"
done

# 6. Keep-alive 연결 테스트
echo ""
echo "[테스트 6] HTTP/1.1 Keep-Alive 효과"
echo "-------------------------------------------"
echo "개별 연결 (5회):"
time for i in $(seq 1 5); do
  curl -s -o /dev/null "http://127.0.0.1:8000/api/stats"
done

echo ""
echo "Keep-alive 연결 (5회 한번에):"
time curl -s -o /dev/null \
  "http://127.0.0.1:8000/api/stats" \
  "http://127.0.0.1:8000/api/stats" \
  "http://127.0.0.1:8000/api/stats" \
  "http://127.0.0.1:8000/api/stats" \
  "http://127.0.0.1:8000/api/stats"

echo ""
echo "=========================================="
echo "테스트 완료"
echo "=========================================="
