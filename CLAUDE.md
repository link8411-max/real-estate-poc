# 수도권 부동산 실거래가 서비스

## 한줄 요약
수도권(서울/경기/인천) 78개 시군구의 아파트 실거래가 데이터를 국토부 API에서 수집하여 DB에 저장하고, 웹에서 검색/조회/비교/분석할 수 있는 서비스.

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| Backend | Python 3.9, FastAPI, SQLite |
| Frontend | Next.js 16, TypeScript, Tailwind CSS, Recharts |
| Infra | Vercel (Frontend), Render (Backend), Cloudflare |
| Data Source | 국토교통부 실거래가 API |

---

## 배포 환경

| 서비스 | 플랫폼 | URL | 자동배포 |
|--------|--------|-----|----------|
| Frontend | Vercel | https://real-estate-poc-self.vercel.app | main push 시 |
| Backend | Render | https://real-estate-poc-jcez.onrender.com | main push 시 |
| CDN/DNS | Cloudflare | - | - |

---

## 프로젝트 구조

```
real-estate-poc/
├── CLAUDE.md                 # 이 파일 (프로젝트 컨텍스트)
│
├── [데이터베이스]
│   ├── real_estate.db        # 메인 DB (현재 2,313,733건 거래, 16,664개 아파트)
│   ├── real_estate_backup_*.db  # 백업
│   └── schema.sql            # DB 스키마 정의
│
├── [수집 스크립트]
│   ├── collect_robust.py     # ★ 메인 수집 스크립트 (지수 백오프, progress.json)
│   ├── collector_core.py     # API 호출 + DB 저장 핵심 클래스
│   ├── insight_engine.py     # 거래 분석/인사이트 생성
│   ├── progress.json         # 수집 진행 상황 (완료/실패 목록)
│   └── regions.json          # 78개 지역코드 매핑
│
├── [백엔드 API]
│   └── api_server.py         # FastAPI 서버 (port 8000)
│
└── [프론트엔드]
    └── frontend/
        ├── package.json
        └── src/
            ├── app/
            │   ├── layout.tsx            # 루트 레이아웃 (SEO 메타태그)
            │   ├── page.tsx              # 메인 페이지
            │   ├── sitemap.ts            # 동적 sitemap 생성
            │   ├── robots.ts             # robots.txt
            │   ├── browse/page.tsx       # 지역 탐색
            │   ├── search/page.tsx       # 검색 결과
            │   ├── stats/page.tsx        # 지역별 통계
            │   ├── compare/page.tsx      # 단지 비교
            │   ├── monitor/page.tsx      # 수집 모니터링
            │   ├── perf-test/page.tsx    # 성능 테스트
            │   ├── apartment/[id]/
            │   │   ├── layout.tsx        # 동적 메타태그
            │   │   └── page.tsx          # 단지 상세
            │   └── api/og/[id]/
            │       └── route.tsx         # OG 이미지 생성
            └── components/
                └── PriceChart.tsx        # 가격 추이 차트
```

---

## 실행 방법

### 1. 백엔드 시작
```bash
cd real-estate-poc
python3 api_server.py
# → http://localhost:8000
```

### 2. 프론트엔드 시작
```bash
cd real-estate-poc/frontend
npm run dev
# → http://localhost:3000
```

### 3. 데이터 수집 (필요시)
```bash
cd real-estate-poc

# progress.json 초기화 (처음부터 시작 시)
rm -f progress.json

# 백그라운드 수집 (맥 슬립 방지)
caffeinate -i nohup python3 collect_robust.py 2006 2026 > collect_robust.log 2>&1 &

# 진행 확인
tail -f collect_robust.log
# 또는 http://localhost:3000/monitor
```

---

## API 엔드포인트

### 검색/거래
| 엔드포인트 | 메서드 | 설명 | 파라미터 |
|------------|--------|------|----------|
| `/api/search` | GET | 아파트명/지역명 검색 (FTS5 trigram) | `q`: 검색어, `limit`: 결과 수 |
| `/api/transactions` | GET | 최근 거래 목록 | `limit`: 결과 수 (기본 20) |

### 단지 상세
| 엔드포인트 | 메서드 | 설명 | 응답 |
|------------|--------|------|------|
| `/api/apartments/ids` | GET | 전체 아파트 ID 목록 (sitemap용) | `number[]` |
| `/api/apartments/{id}` | GET | 단지 상세 정보 | apartment, transactions, area_stats, metrics |
| `/api/apartments/{id}/transactions` | GET | 거래 내역 페이징 | `limit`, `offset`, `area` 필터 |
| `/api/apartments/{id}/history` | GET | 가격 추이 (차트용) | `months`: 기간, `area`: 평형 필터 |

### 지역 탐색
| 엔드포인트 | 메서드 | 설명 |
|------------|--------|------|
| `/api/regions/hierarchy` | GET | 지역 계층 (서울/경기/인천 → 구/시 목록 + 통계) |
| `/api/regions/{code}/apartments` | GET | 해당 지역 아파트 목록 (`limit`, `offset`, `sort`) |
| `/api/regions/{code}/stats` | GET | 해당 지역 통계 |

### 통계/분석
| 엔드포인트 | 메서드 | 설명 |
|------------|--------|------|
| `/api/stats` | GET | 시장 주요 지표 + 데이터 기준 시점 |
| `/api/stats/regions` | GET | 지역별 통계 (평균가, 거래량, 전년비) |
| `/api/compare` | GET | 단지 비교 (`apt_ids`: "1,2" 형태) |

### 모니터링
| 엔드포인트 | 메서드 | 설명 |
|------------|--------|------|
| `/api/monitor` | GET | DB 통계 (총 거래수, 지역별 현황) |
| `/api/progress` | GET | 수집 진행 상황 (progress.json) |
| `/api/cache/stats` | GET | 캐시 통계 |
| `/api/cache/clear` | POST | 캐시 무효화 (`secret`: "수집완료") |

---

## API 응답 상세

### `/api/apartments/{id}` 응답 구조

```typescript
{
  apartment: {
    id: number;
    name: string;
    dong: string;
    lawd_cd: string;
    region_name: string;  // "서울 강남구"
    jibun: string;
    build_year: number;
  };
  transactions: [{
    id: number;
    amount: number;      // 만원 단위
    area: number;        // ㎡
    floor: number;
    deal_date: string;   // "2024-01-15"
    summary_text?: string;
  }];
  area_stats: [{
    area: number;
    max_amount: number;
    min_amount: number;
    avg_amount: number;
    count: number;
    latest_amount: number | null;
    latest_date: string | null;
    recent_avg: number | null;   // 최근 3개월 평균
    peak_date: string | null;    // 전고점 날짜
  }];
  metrics: {
    bargain_amount?: number;     // 급매 금액 (최근가 - 3개월평균)
    bargain_percent?: number;    // 급매 비율
    floor_premium?: number;      // 층별 프리미엄 %
    recovery_rate?: number;      // 전고점 회복률 %
    peak_date?: string;          // 전고점 날짜
    dong_rank?: number;          // 동네 내 가성비 순위
    dong_total?: number;         // 동네 내 총 단지 수
    days_since_last_tx?: number; // 마지막 거래 후 경과일
  };
}
```

### `/api/stats` 응답 구조

```typescript
{
  growth_rate: string;
  buying_power: string;
  active_nodes: string;
  recent_transactions_30d: number;
  total_apartments: number;
  status: string;
  data_updated_at: string;  // ISO 8601 형식
  data_range: {
    min_date: string;       // "2006-01-01"
    max_date: string;       // "2026-01-22"
  };
}
```

---

## 프론트엔드 페이지 상세

### 1. 메인 페이지 (`/`)
**파일:** `src/app/page.tsx`

**기능:**
- 아파트/지역 검색 입력
- 인기 검색어 퀵버튼 (잠실, 반포, 강남, 판교, 분당)
- 등록 단지 수, 최근 30일 거래 수 통계
- 서울/경기/인천 지역 탐색 카드
- 최근 거래 6건 목록

**컴포넌트:**
- 검색 폼 (Search 아이콘, input)
- 통계 카드 2개 (Building2, TrendingUp 아이콘)
- 지역 카드 3개 (MapPin 아이콘)
- 거래 카드 리스트

---

### 2. 검색 결과 (`/search`)
**파일:** `src/app/search/page.tsx`

**기능:**
- URL 쿼리 파라미터로 검색어 전달 (`?q=강남`)
- 실시간 검색 결과 표시 (최대 30건)
- 검색어 수정 가능
- AbortController로 이전 요청 취소

**표시 정보:**
- 아파트명, 지역명, 준공년도
- 거래 건수
- 최근 거래가, 면적, 거래일

---

### 3. 지역 탐색 (`/browse`)
**파일:** `src/app/browse/page.tsx`

**기능:**
- 3단계 드릴다운: 시/도 → 구/군 → 아파트 목록
- URL 쿼리로 상태 관리 (`?city=서울`, `?code=11680`)
- 뒤로가기 네비게이션

**표시 정보:**
- 시/도별: 구/시 개수, 총 단지 수, 총 거래 수
- 구/군별: 단지 수, 거래 건수
- 아파트별: 이름, 동, 준공년도, 거래건수, 최근 거래가

---

### 4. 단지 상세 (`/apartment/[id]`)
**파일:** `src/app/apartment/[id]/page.tsx`, `layout.tsx`

**기능:**
- 단지 기본 정보 (이름, 위치, 준공년도)
- 시세 요약 (최근 거래가, 전고점 대비)
- **5가지 인사이트 배지:**
  - 🔥 급매 (3개월 평균 대비 5% 이상 저렴)
  - 📈 평균 대비 높음
  - 📉 전고점 대비 20% 이상 하락
  - 💰 동네 내 가성비 1~3위
  - ⏸️ 180일 이상 거래 없음
  - 🏢 층별 프리미엄/할인
- 가격 추이 차트 (1년/2년/3년/전체)
- 평형별 시세 (클릭 시 필터링)
- 거래 내역 무한스크롤
- 비교 담기 기능 (localStorage)

**컴포넌트:**
- PriceChart (Recharts ComposedChart)
- 인사이트 배지
- 전고점 진행바
- 거래 목록 (IntersectionObserver)

---

### 5. 단지 비교 (`/compare`)
**파일:** `src/app/compare/page.tsx`

**기능:**
- 2개 단지 나란히 비교
- URL 쿼리로 ID 전달 (`?ids=1234,5678`)
- localStorage에서 비교 목록 로드
- 비교 항목에서 제거 가능

**비교 항목:**
- 위치, 준공년도
- 최근 거래가
- 전고점, 전고점 대비 %
- 거래 건수

---

### 6. 지역별 통계 (`/stats`)
**파일:** `src/app/stats/page.tsx`

**기능:**
- 서울/경기/인천 평균가 카드
- 상승률 Top 3, 하락률 Top 3
- 전체 지역 테이블 (정렬, 필터링)
- 지역명, 평균가, 거래량, 전년비 표시

**정렬 옵션:**
- 지역명 (가나다순)
- 평균가 (높은순/낮은순)
- 거래량 (많은순/적은순)
- 전년비 (상승순/하락순)

---

### 7. 수집 모니터링 (`/monitor`)
**파일:** `src/app/monitor/page.tsx`

**기능:**
- 총 거래수, 총 아파트수
- 지역별 수집 현황
- 일별/연도별 거래 통계
- 수집 진행률

---

## 컴포넌트 상세

### PriceChart
**파일:** `src/components/PriceChart.tsx`

**Props:**
```typescript
interface PriceChartProps {
  data: HistoryData[];
  loading?: boolean;
  selectedArea?: number | null;
}
```

**기능:**
- Recharts ComposedChart 사용
- 라인: 월별 평균가
- 바: 월별 거래량
- 기간 필터: 1년/2년/3년/전체
- 최고가/최저가/총거래 요약

---

## SEO / 공유 기능

### 메타태그
**루트 (`layout.tsx`):**
- title: "수도권 아파트 실거래가 - 서울/경기/인천"
- description: 78개 지역, 차별화 분석 소개
- OpenGraph, Twitter Card 설정
- lang="ko"

**아파트 상세 (`apartment/[id]/layout.tsx`):**
- 동적 title: "{아파트명} 실거래가 - {지역명}"
- 동적 description: 최근 거래가, 준공년도 포함
- 동적 OG 이미지: `/api/og/{id}`

### Sitemap (`sitemap.ts`)
- 정적 페이지: /, /browse, /search, /stats
- 동적 페이지: /apartment/{id} (API에서 ID 목록 조회)
- 24시간 revalidate

### Robots (`robots.ts`)
- Allow: /
- Disallow: /perf-test, /monitor, /api/
- Sitemap 위치 명시

### OG 이미지 (`api/og/[id]/route.tsx`)
- @vercel/og 사용 (Edge Runtime)
- 1200x630 이미지 생성
- 아파트명, 지역, 가격, 전고점 대비 표시

---

## 데이터베이스 스키마

```sql
-- 아파트 기본 정보
apartments (
  id INTEGER PRIMARY KEY,
  name TEXT,
  lawd_cd TEXT,      -- 지역코드
  dong TEXT,         -- 법정동
  jibun TEXT,        -- 지번
  build_year INTEGER
)

-- 실거래 데이터
transactions (
  id INTEGER PRIMARY KEY,
  apt_id INTEGER REFERENCES apartments(id),
  amount INTEGER,    -- 만원 단위
  area REAL,         -- 전용면적 ㎡
  floor INTEGER,
  deal_date TEXT,    -- YYYY-MM-DD
  unique_hash TEXT,  -- 중복 방지
  cancel_date TEXT   -- 취소일 (있으면 취소 거래)
)

-- 분석 인사이트
transaction_insights (
  transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id),
  summary_text TEXT
)

-- FTS5 검색 인덱스
apartments_fts (
  rowid,
  name,
  dong
)
```

---

## 지역 코드 (lawd_cd)

| 지역 | 코드 범위 | 개수 |
|------|----------|------|
| 서울 | 11xxx | 25개 구 |
| 경기 | 41xxx | 43개 시/구 |
| 인천 | 28xxx | 10개 구/군 |
| **합계** | - | **78개** |

---

## 캐싱 전략

### 백엔드 (api_server.py)
- 인메모리 딕셔너리 캐시 (TTL 없음)
- 수집 완료 시 이벤트로 전체 무효화
- 캐시 키:
  - `search`: "검색어:limit"
  - `apartment`: "{apt_id}"
  - `history`: "{apt_id}:{months}:{area}"
  - `hierarchy`: "all"

### 프론트엔드
- Next.js fetch cache (`revalidate: 3600`)
- Sitemap: 24시간 revalidate

---

## 수집 스크립트 설정 (collect_robust.py)

| 설정 | 값 | 설명 |
|------|-----|------|
| TIMEOUT | 30초 | API 응답 대기 시간 |
| MAX_RETRIES | 5회 | 최대 재시도 횟수 |
| API_DELAY | 1초 | API 호출 간격 (429 방지) |
| 백오프 | 2→4→8→16→32초 | 지수 백오프 대기 |

### progress.json 구조
```json
{
  "completed": ["11110_200601", "11110_200602", ...],
  "failed": [{"task": "41190_200801", "error": "timeout"}],
  "current": {"lawd_cd": "11680", "deal_ymd": "202301", "region": "강남구"},
  "stats": {"total_saved": 123456}
}
```

---

## 현재 데이터 현황

- **총 거래**: 2,313,733건
- **총 아파트**: 16,664개
- **데이터 범위**: 2006년 1월 ~ 2026년 1월
- **목표**: 78지역 × 241개월 = 18,798 API 호출

---

## 환경변수

### 프론트엔드 (`.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SITE_URL=https://sudogwon.com
```

### 백엔드
- `DB_PATH`: SQLite 파일 경로 (기본: "real_estate.db")

---

## 주의사항

1. **API Rate Limit**: 국토부 API는 빈번한 호출 시 429 에러 발생. 최소 1초 간격 유지 필요.
2. **수집 재시작**: `progress.json` 덕분에 중단 후 이어서 수집 가능.
3. **OG 이미지**: Edge Runtime에서만 동작 (Vercel 배포 필수)
4. **한글 폰트**: @vercel/og는 기본 폰트로 한글 지원
5. **비교 기능**: localStorage 사용으로 브라우저별 독립
