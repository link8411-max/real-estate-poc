# API 캐싱 전략 계획

## 목표
- API 응답 속도 개선 및 DB 부하 감소
- **실시간성 유지**: 데이터 수집 즉시 반영

---

## 핵심 전략: 이벤트 기반 캐시 무효화

```
국토부 API → [collect_robust.py] → DB 저장
                                      ↓
                              캐시 무효화 트리거
                                      ↓
                              모든 캐시 클리어
                                      ↓
                              다음 요청 시 새 데이터 반영
```

**장점:**
- 평소: 캐시로 빠른 응답 (10ms)
- 수집 시: 즉시 새 데이터 반영
- TTL 무제한 가능 (수집 이벤트가 무효화)

---

## 캐싱 대상

### 무거운 쿼리 (필수)
| API | 현재 | 캐시 후 |
|-----|------|---------|
| `/api/stats/regions` | 3-5초 | 10ms |
| `/api/regions/hierarchy` | 1-2초 | 10ms |

### 일반 API
| API | 캐싱 |
|-----|------|
| `/api/transactions` | O |
| `/api/stats` | O |
| `/api/search` | O |
| `/api/apartments/{id}` | O |
| `/api/apartments/{id}/history` | O |

### 캐싱 제외
| API | 이유 |
|-----|------|
| `/api/progress` | 수집 진행 상황 실시간 필요 |
| `/api/monitor` | 관리용, 항상 최신 필요 |

---

## 구현 방식

### 서버 메모리 캐싱 (dict 기반, TTL 없음)
```python
# TTL 없이 무제한 캐시 (이벤트로 무효화)
CACHE = {}

def clear_all_cache():
    """수집 완료 시 호출"""
    CACHE.clear()
```

### HTTP 캐시 헤더
```python
# 브라우저 캐시는 짧게 (새로고침 시 서버 확인)
headers={"Cache-Control": "public, max-age=60, stale-while-revalidate=30"}
```

---

## 수정 파일

| 파일 | 작업 |
|------|------|
| `api_server.py` | 캐시 로직 추가, 무효화 API |
| `collect_robust.py` | 수집 완료 시 캐시 무효화 호출 |

---

## 구현 상세

### 1. 캐시 설정 (api_server.py)
```python
# 전역 캐시 저장소 (TTL 없음 - 이벤트로 무효화)
CACHE = {
    "search": {},        # key: "검색어:limit"
    "stats": {},         # key: "market"
    "stats_regions": {}, # key: "all"
    "hierarchy": {},     # key: "all"
    "transactions": {},  # key: "limit:{n}"
    "apartment": {},     # key: "{apt_id}"
    "history": {},       # key: "{apt_id}:{months}:{area}"
}

def clear_all_cache():
    for cache in CACHE.values():
        cache.clear()
    print("[CACHE] All caches cleared")
```

### 2. API에 캐싱 적용 (예: 검색)
```python
@app.get("/api/search")
def search_apartments(q: str, limit: int = 20):
    cache_key = f"{q}:{limit}"
    if cache_key in CACHE["search"]:
        return CACHE["search"][cache_key]

    # ... DB 조회 로직 ...

    CACHE["search"][cache_key] = result
    return result
```

### 3. 캐시 무효화 API
```python
@app.post("/api/cache/clear")
async def clear_cache(secret: str = ""):
    if secret != "수집완료":  # 간단한 보안
        raise HTTPException(status_code=403)
    clear_all_cache()
    return {"status": "cleared", "time": time.time()}
```

### 4. 수집 스크립트에서 무효화 호출 (collect_robust.py)
```python
# 수집 완료 후 캐시 무효화
import requests

def notify_cache_clear():
    try:
        requests.post(
            "http://127.0.0.1:8000/api/cache/clear",
            params={"secret": "수집완료"},
            timeout=5
        )
        print("[수집] 캐시 무효화 완료")
    except:
        print("[수집] 캐시 무효화 실패 (서버 꺼져있음)")

# 배치 저장 후 호출
if saved_count > 0:
    notify_cache_clear()
```

---

## 검증 방법

### 1. 캐시 성능 테스트
```bash
# 첫 호출 (DB 조회)
time curl -s "http://127.0.0.1:8000/api/stats/regions" > /dev/null

# 두 번째 호출 (캐시 히트) - 훨씬 빨라야 함
time curl -s "http://127.0.0.1:8000/api/stats/regions" > /dev/null
```

### 2. 실시간성 테스트
```bash
# 1. 검색 결과 확인
curl -s "http://127.0.0.1:8000/api/search?q=테스트"

# 2. 캐시 무효화
curl -X POST "http://127.0.0.1:8000/api/cache/clear?secret=수집완료"

# 3. 다시 검색 (새 데이터 반영 확인)
curl -s "http://127.0.0.1:8000/api/search?q=테스트"
```

### 3. 100회 테스트
```bash
./test_api_performance.sh
```

### 4. 브라우저 테스트
- http://localhost:3000/perf-test 에서 100회 테스트
- 첫 호출 vs 이후 호출 속도 비교

---

## 예상 결과

| 상황 | 응답 시간 |
|------|----------|
| 첫 호출 (캐시 미스) | 50~500ms |
| 이후 호출 (캐시 히트) | **1~10ms** |
| 수집 후 첫 호출 | 50~500ms (새 데이터) |

---

# 배포 전략

## 요구사항
- 예산: **무료**
- 운영: **쉬운 관리 (Managed)**
- 규모: 소규모 시작

---

## 추천 구성

### 프론트엔드: Vercel (무료)
```
Next.js → Vercel 배포
- 무료 tier: 월 100GB 대역폭
- 자동 HTTPS, CDN
- GitHub 연동 자동 배포
```

### 백엔드 + DB: Supabase + Render
```
FastAPI → Render (API 서빙)
SQLite → Supabase (PostgreSQL로 마이그레이션)
```

---

## 추천 조합

| 옵션 | 프론트 | 백엔드 | DB | 난이도 | 비용 |
|------|--------|--------|-----|--------|------|
| **A (추천)** | Vercel | Render | Supabase (PostgreSQL) | 쉬움 | 무료 |
| B | Vercel | Railway | Supabase | 쉬움 | 무료 |
| C | Oracle VM | Oracle VM | SQLite | 중간 | 무료 |

---

## 옵션 A 상세 (Vercel + Render + Supabase)

### 1. 프론트엔드 (Vercel)
```bash
# frontend 폴더에서
npm i -g vercel
vercel
# GitHub 연동하면 push 시 자동 배포
```

### 2. 백엔드 (Render)
```
1. render.com 가입
2. New → Web Service
3. GitHub 연동 → real-estate-poc 선택
4. 설정:
   - Build Command: pip install -r requirements.txt
   - Start Command: uvicorn api_server:app --host 0.0.0.0 --port $PORT
```

### 3. 데이터베이스 (Supabase)
```
1. supabase.com 가입
2. 새 프로젝트 생성
3. SQLite → PostgreSQL 마이그레이션
4. 환경변수로 연결 문자열 설정
```

### 4. 환경 변수
```
# Vercel (프론트)
NEXT_PUBLIC_API_URL=https://your-api.onrender.com

# Render (백엔드)
DATABASE_URL=postgresql://...@supabase.co/postgres
```

---

## 데이터 수집 전략

### GitHub Actions (매일 자동 수집)
```yaml
# .github/workflows/collect.yml
name: Daily Collection
on:
  schedule:
    - cron: '0 15 * * *'  # 매일 자정 (KST) - 익일 공개 시점 이후

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: pip install requests psycopg2-binary
      - name: Run daily collection
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          MOLIT_API_KEY: ${{ secrets.MOLIT_API_KEY }}
        run: python collect_daily.py
```

**국토부 실거래가 업데이트**: 실시간 취합 → **익일 공개**
- 정확한 시간은 미공개 (콜센터 문의: 1644-9782)
- GitHub Actions는 KST 자정 이후로 설정

---

## 주의사항

### SQLite → PostgreSQL 마이그레이션
- Supabase 무료: 500MB
- 현재 DB 크기 확인 필요
- 필요시 오래된 데이터 정리

### Render 무료 tier
- 15분 미사용시 슬립
- 첫 요청 시 ~30초 콜드스타트
- 월 750시간 무료

---

## 향후 확장 시

| 상황 | 업그레이드 |
|------|-----------|
| 트래픽 증가 | Render Pro ($7/월) |
| DB 용량 증가 | Supabase Pro 또는 PlanetScale |
| 안정성 필요 | AWS/GCP 전환 |
