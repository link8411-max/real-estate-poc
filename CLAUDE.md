# 수도권 부동산 실거래가 서비스

## 한줄 요약
수도권(서울/경기/인천) 78개 시군구의 아파트 실거래가 데이터를 국토부 API에서 수집하여 DB에 저장하고, 웹에서 검색/조회/비교할 수 있는 서비스.

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| Backend | Python 3.9, FastAPI, SQLite |
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Data Source | 국토교통부 실거래가 API |

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
        └── src/app/
            ├── page.tsx              # 메인 (검색 + 지역탐색 + 최근거래)
            ├── browse/page.tsx       # 지역 탐색 (서울/경기/인천 → 구 → 아파트)
            ├── search/page.tsx       # 검색 결과
            ├── apartment/[id]/page.tsx  # 단지 상세 (차트, 거래내역)
            ├── compare/page.tsx      # 단지 비교
            └── monitor/page.tsx      # 수집 모니터링 대시보드
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

### 거래/검색
| 엔드포인트 | 설명 |
|------------|------|
| `GET /api/transactions?limit=20` | 최근 거래 목록 |
| `GET /api/search?q=강남` | 아파트명/지역명 검색 |
| `GET /api/apartments/{id}` | 단지 상세 (기본정보 + 최근거래 + 평형별시세) |
| `GET /api/apartments/{id}/history?months=60` | 가격 추이 (차트용) |

### 지역 탐색
| 엔드포인트 | 설명 |
|------------|------|
| `GET /api/regions/hierarchy` | 지역 계층 (서울/경기/인천 → 구/시 목록 + 통계) |
| `GET /api/regions/{code}/apartments` | 해당 지역 아파트 목록 |
| `GET /api/regions/{code}/stats` | 해당 지역 통계 |

### 모니터링
| 엔드포인트 | 설명 |
|------------|------|
| `GET /api/monitor` | DB 통계 (총 거래수, 지역별 현황) |
| `GET /api/progress` | 수집 진행 상황 (progress.json) |

---

## 데이터베이스 스키마

```sql
-- 아파트 기본 정보
apartments (
  id, name, lawd_cd, dong, jibun, build_year
)

-- 실거래 데이터
transactions (
  id, apt_id, amount, area, floor, deal_date, unique_hash, cancel_date
)

-- 분석 인사이트
transaction_insights (
  transaction_id, summary_text
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
- **문제**: 일부 지역(인천 등) 데이터 누락 (2024-10~12만 수집됨)
- **목표**: 2006년 1월 ~ 2026년 1월 전체 수집 (78지역 × 241개월 = 18,798 API 호출)

---

## 주의사항

1. **API Rate Limit**: 국토부 API는 빈번한 호출 시 429 에러 발생. 최소 1초 간격 유지 필요.
2. **수집 재시작**: `progress.json` 덕분에 중단 후 이어서 수집 가능. 실패 항목도 기록됨.
3. **프론트엔드 환경변수**: `NEXT_PUBLIC_API_URL`로 백엔드 주소 설정 (기본: http://localhost:8000)
