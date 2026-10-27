# 부동산 실거래가 서비스 (real-estate-poc)

국토부 실거래가(매매·전세·월세)를 매일 수집해 정적 JSON + Supabase 요약으로 발행하고, Next.js 사이트(Vercel)에서 지도·검색·단지 상세로 보여주는 서비스.

## 아키텍처

```
GitHub Actions (하루 3회 수집)
  → SQLite 정본 (R2 private 버킷 real-estate-db, real_estate.db)
  → 변경 단지만 정적 JSON 내보내기 → R2 public 버킷 real-estate-public (r2.dev URL)
  → 단지 요약 → Supabase (apartment_summary)
Next.js (Vercel) = 정적 JSON(상세·지역·통계) + Supabase(지도·목록·검색 API)
```

- 정본은 SQLite 한 파일이다. 워크플로가 매번 R2에서 받아 → 수집 → 업로드한다. 동시 실행은 `concurrency: collect` 로 막는다.
- Render/FastAPI 서버는 제거되었다. 백엔드 서버는 없다.

## 폴더 구조

```
pipeline/            Python 파이프라인 (아래 CLI 표)
  collect.py         MOLIT 수집 (매매/전월세) → SQLite, 변경 단지 id JSON
  molit_client.py    MOLIT API 클라이언트
  regions.py         수집 대상 시군구(REGIONS)
  db.py              스키마·멱등 마이그레이션 (connect, migrate)
  summary.py         단지 요약 지표 계산
  export_json.py     단지/지역/통계/검색 인덱스 JSON 내보내기
  r2_publish.py      out/ → R2 public 버킷 업로드(변경분만)
  geocode.py         카카오 지오코딩으로 빈 좌표 채우기
  migrate_coords.py  옛 로컬 DB 에서 좌표 이식 (1회성)
  supabase_sync.py   apartment_summary 동기화
r2_utils.py          정본 DB R2 download / upload / info
scripts/             initial_migration.sh, sync_github_secrets.sh, serve_out.py, make_og_font.sh
supabase/migrations/ 0001_init.sql
.github/workflows/   collect-daily.yml, backfill.yml
frontend/            Next.js 16 앱 (src/app, src/components, src/lib)
tests/               pytest
docs/                api/openapi.yaml, superpowers/specs·plans (설계·계획)
data/last_run.json   마지막 수집 기록 (Actions가 커밋 → 60일 비활성 방지)
```

## 로컬 개발

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                       # 값 채우기
cp frontend/.env.example frontend/.env.local
```

- 루트 `.env` 키: MOLIT_API_KEY, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BUCKET, R2_PUBLIC_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KAKAO_REST_API_KEY (선택: DB_PATH)
- `frontend/.env.local` 키: NEXT_PUBLIC_DATA_URL, NEXT_PUBLIC_KAKAO_JS_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL
- 값은 절대 문서·커밋에 쓰지 않는다 (`.env*` 는 gitignore).
- 로컬 데이터로 프론트 확인: `out/` 에 JSON 을 내보낸 뒤
  ```bash
  .venv/bin/python scripts/serve_out.py --dir out --port 8787   # 정적 JSON 서버
  cd frontend && npm install && npm run dev                      # NEXT_PUBLIC_DATA_URL=http://localhost:8787
  ```

## 파이프라인 CLI

모두 저장소 루트에서 `.venv/bin/python -m pipeline.<모듈>` 로 실행.

| 모듈 | 플래그 |
|---|---|
| `collect` | `--db`(기본 real_estate.db) `--kind trade\|rent\|both` ; 기간 택1: `--months YYYYMM,..` / `--from YYYYMM [--to YYYYMM]` / `--daily`(이번 달+지난 달) / `--retry-failed SUMMARY` ; `--regions 코드,..` `--changed-out`(기본 changed_apts.json) `--summary-out FILE` `--delay`(기본 0.5) |
| `export_json` | `--db`(필수) `--out`(필수) ; 택1: `--changed FILE` / `--all` ; `--today YYYY-MM-DD` |
| `r2_publish` | `--out`(필수) `--keys`(필수, out/keys.json) `--bucket` `--workers`(기본 8) |
| `supabase_sync` | `--db`(필수) ; 택1: `--changed FILE` / `--all` ; `--today YYYY-MM-DD` |
| `geocode` | `--db`(필수) `--retry-failed` `--limit`(기본 20000) `--delay`(기본 0.05) |
| `migrate_coords` | `--src`(옛 DB, 필수) `--db`(필수) |
| `python r2_utils.py` | `download` / `upload` / `info` (정본 DB, R2_BUCKET_NAME) |
| `python scripts/serve_out.py` | `--dir`(기본 out) `--port`(기본 8787) |

`collect` 의 기간 인자 `--from` 은 `--months`/`--daily`/`--retry-failed` 와 동시에 쓸 수 없다.

## 최초 이전 절차 (`scripts/initial_migration.sh`)

Mac 에서 실행. 단계(STEP, 쉼표 구분): `download migrate coords split trade rent1 rent2 rent3 geocode publish upload`. 기본(`all`)은 `download migrate coords split trade geocode`; 전월세·publish·upload 는 항상 명시.

```bash
gh workflow disable "Daily Collection" -R link8411-max/real-estate-poc   # CI 가 정본을 덮어쓰지 않게
bash scripts/initial_migration.sh                    # 기본 단계
STEP=rent1 bash scripts/initial_migration.sh         # rent1=201101-201512, rent2=201601-202012, rent3=202101-202610 (하루 한 덩어리)
STEP=publish,upload bash scripts/initial_migration.sh
gh workflow enable "Daily Collection" -R link8411-max/real-estate-poc    # upload 후
```

- MOLIT 일일 한도 10,000콜 중 CI 가 약 1,000콜 사용 → 이 스크립트는 하루 약 8,000콜 미만: split+trade ≈ 3,500, rent1/rent2 ≈ 각 4,980, rent3 ≈ 5,810. 각 단계 헤더에 `calls≈N` 출력.
- 수집 실패(`failed_count>0`)가 있으면 geocode/publish/upload 전에 멈추고 `--retry-failed` 명령을 출력한다.
- download 시 R2 last-modified 를 `.migration_state` 에 기록하고 upload 직전에 비교, 달라졌으면 중단 (`FORCE_UPLOAD=1` 로 무시).
- 필요: sqlite3, `.env` 의 MOLIT/R2/SUPABASE/KAKAO 키. GitHub Secrets 동기화는 `bash scripts/sync_github_secrets.sh`.

## 워크플로

- **Daily Collection** (`collect-daily.yml`): KST 07/13/19시(cron 3회) + 수동. R2 DB 다운로드 → geocode(`--limit 500`) → `collect --daily` → `export_json --changed` → `r2_publish` → `supabase_sync --changed` → DB 업로드 → `data/last_run.json` 커밋·푸시.
- **Backfill** (`backfill.yml`, 수동): 입력 kind/from/to/regions. 호출 수(지역×개월×종류) > 8,000 이면 시작 전에 실패. 같은 `collect` concurrency 그룹.

## 프론트엔드 (`frontend/`)

Next.js 16 (App Router) + Tailwind, 데이터는 `NEXT_PUBLIC_DATA_URL` 의 정적 JSON(ISR 10분)과 Supabase.

- 페이지: `/` `/search` `/browse` `/region/[code]` `/stats` `/compare` `/apartment/[id]`(매매/전세/월세 탭) `/map`(카카오 지도 + 필터), `robots.ts`, `sitemap.ts`, OG 이미지 `/api/og/[id]`
- 주요 컴포넌트(`src/components`): MapView / KakaoMap / MapMarkers / FilterPanel (지도), DealTabs / ApartmentTrades / RentSection / PriceChart / InsightBadges (상세), SearchBox / SearchPanel, RegionBrowser / RegionStatsTable, CompareTable, AreaUnitToggle·AreaLabel (평/㎡ 전환)
- `src/lib`: data.ts(JSON fetch), types.ts, useMapData.ts, mapFilters.ts·filters.ts, seo.ts, supabase/, areaUnit.ts
- 명령: `npm run dev` / `npm run build` / `npm test`(vitest) / `npx tsc --noEmit` / `npm run lint`

## API v1

Next.js Route Handler: `GET /api/v1/map`, `/api/v1/apartments`, `/api/v1/search`. 파라미터·응답 스키마는 `docs/api/openapi.yaml` 참조 (구현은 `frontend/src/app/api/v1/*`).

## 테스트

```bash
.venv/bin/pytest -q                              # 파이프라인·스크립트
cd frontend && npm test && npx tsc --noEmit      # 프론트 (배포 전 npm run build 도)
```

## 주의사항

- MOLIT 키는 하루 10,000콜 공용이다. 매일 수집이 약 1,000콜을 쓰므로 백필·이전은 하루 8,000콜 미만으로 나눠 돌린다.
- 카카오 JS 키는 허용 도메인(localhost, Vercel 도메인 등)을 개발자 콘솔에 등록해야 지도가 뜬다. REST 키(지오코딩)와 JS 키는 별개.
- R2 public 버킷은 r2.dev 주소를 쓰므로 요청 제한이 있다. 트래픽이 늘면 커스텀 도메인으로 교체하고 `NEXT_PUBLIC_DATA_URL` 변경.
- Supabase 무료 플랜은 DB 500MB 제한, 7일 무활동 시 일시정지 — 매일 수집의 sync 가 활동을 유지한다.
- Vercel Hobby 는 비상업 용도만 허용. 수익화 시 Pro 필요.
- `real_estate.db`, `*.db` 는 커밋하지 않는다. 이전 작업 중에는 CI 를 비활성화한다.
