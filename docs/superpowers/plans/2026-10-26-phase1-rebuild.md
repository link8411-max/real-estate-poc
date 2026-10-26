# 1단계 뼈대 교체 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render 서버 없이 R2 정적 JSON + Supabase 요약 테이블 + Vercel 서버 함수로 매매·전월세 실거래를 보여주고, 지도·필터 페이지를 추가하고, 비어 있는 2026-02~10 매매와 전월세 전 기간을 채운다.

**Architecture:** 수집은 `pipeline/` 파이썬 패키지가 맡는다(국토부 API → SQLite 원본 → 변경 단지만 JSON으로 내보내 R2에 올리고, 요약 1행을 Supabase에 upsert). 프론트는 기존 Next.js를 유지하되 데이터 소스를 R2 정적 파일(`lib/data.ts`)과 `/api/v1/*` Route Handler(Supabase 조회)로 바꾼다. 백필과 최초 전체 내보내기는 사용자 Mac에서 로컬로 돌리고, 매일 수집만 GitHub Actions가 돌린다(SQLite 하나를 여러 잡이 동시에 쓰면 깨지므로 Actions 병렬 백필은 하지 않는다).

**Tech Stack:** Python 3.11 (requests, boto3, pytest), SQLite, Cloudflare R2, Supabase Postgres(PostgREST), Next.js 16 / React 19 / TypeScript / Tailwind 4 / Recharts, `@supabase/supabase-js`, 카카오맵 JS SDK, vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-rebuild-design.md` — 이 계획은 그 문서의 5.7절 "1단계"만 다룬다. 2단계(로그인·관심단지·알림·PWA)는 1단계가 끝난 뒤 별도 계획으로 쓴다.

## Global Constraints

- 운영 비용 0원. 유료 플랜·유료 API 전환 없음.
- 지역 수 **83** (10/27 API 실측으로 정정: 기존 목록은 77개였고 부천·화성·인천이 분구됐다). 기존 77에서 폐지 코드 `28110`(인천중구), `28140`(인천동구), `28260`(인천서구), `41190`(부천), `41590`(화성)을 빼고 다음 11개를 더한다: `28125` 제물포구, `28155` 영종구, `28275` 서해구, `28290` 검단구, `41192` 부천원미, `41194` 부천소사, `41196` 부천오정, `41591` 화성만세, `41593` 화성효행, `41595` 화성병점, `41597` 화성동탄. 서울 25 + 경기 47 + 인천 11 = 83. `28720` 옹진군은 거래가 0건이지만 목록에 남긴다.
- 폐지 코드 → 새 코드는 1:N이다(`SUCCEEDED_BY: dict[str, list[str]]`): `28110→[28125,28155]`, `28140→[28125]`, `28260→[28275,28290]`, `41190→[41192,41194,41196]`, `41590→[41591,41593,41595,41597]`. 국토부 API는 과거 거래도 새 코드로 재배정해 준다(옛 코드는 전 기간 0건)이므로 백필은 새 코드로만 돌린다. 옛 코드로 저장된 기존 단지는 `(dong, jibun, name)`이 같고 lawd_cd가 새 코드의 `PREDECESSORS`에 속하면 같은 단지로 보고 lawd_cd를 새 코드로 갱신한다.
- `apartments.id`는 영구 불변. 재부여·재생성 금지. 병합은 `apartment_aliases(old_id, canonical_id)`로만.
- 단지 매칭 1차 키 `apt_seq`(국토부 `aptSeq`, 예 `11680-578`), 2차 키 `(normalize_lawd(lawd_cd), dong, jibun, name)`.
- 금액 단위 만원(정수). 면적 ㎡(실수). 평형 그룹 = `ROUND(area, 0)`(기존 api_server.py 방식 유지).
- 취소된 거래(`cancel_date` 있음)는 JSON 거래 목록에는 남기되 통계·최근가·배지 계산에서는 뺀다.
- R2 파일은 전부 gzip으로 올리고 `Content-Encoding: gzip`, `Content-Type: application/json`, `Cache-Control: public, max-age=600`.
- 국토부 API 호출 간격 0.5초 이상, 개발계정 일 10,000회. 전월세 백필은 10,000회/일 안에서 날짜 범위를 나눠 돌린다.
- 매일 수집 잡은 GitHub Actions 30분 제한 안에 끝나야 한다(79지역 × 2개월 × 2종류 = 316회 호출 + 내보내기).
- 프론트 환경변수: `NEXT_PUBLIC_DATA_URL`(R2 공개 URL, 끝에 `/` 없음), `NEXT_PUBLIC_KAKAO_JS_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `NEXT_PUBLIC_API_URL`은 제거.
- 파이프라인 환경변수: `MOLIT_API_KEY`, `R2_*` 4개, `R2_PUBLIC_BUCKET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KAKAO_REST_API_KEY`. 로컬은 `.env`에서 읽는다(`python-dotenv`).
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. 취소 거래(`cdealDay` 있음)가 들어온 단지: 목록에는 "취소" 표시로 남고, 최근가·3개월 평균·전고점·급매 배지에서는 빠져야 한다. → Task 5, Task 6 테스트.
2. 전월세 응답의 `deposit="49,000"`(쉼표), `monthlyRent="0"`, `contractType=" "`(공백): 보증금 49000·월세 0·계약구분 null로 저장되고 전세로 분류돼야 한다. → Task 2 테스트.
3. 인천 옛 코드로 이미 들어 있는 단지에 새 코드로 같은 단지가 들어올 때 중복 단지가 생기지 않아야 한다(`apt_seq` 또는 정규화된 lawd_cd로 같은 행에 붙음). → Task 3 테스트.
4. 매매 거래가 하나도 없고 전월세만 있는 단지: 요약 행과 JSON이 예외 없이 만들어지고 `latest_trade_*`는 null이어야 한다. → Task 5, Task 6 테스트.
5. 이번 실행에서 바뀐 것이 "기존 거래의 취소 처리"뿐인 단지도 변경 단지로 잡혀 JSON이 다시 올라가야 한다. → Task 3, Task 4 테스트.

---

## 사전 준비 (사용자가 직접, 코드 밖)

- [ ] **P1.** Cloudflare 대시보드 → R2 → 새 버킷 `real-estate-public` 생성 → Settings → Public access → "Allow Access"(r2.dev 서브도메인). 나온 URL(예 `https://pub-xxxx.r2.dev`)을 `.env`에 `R2_PUBLIC_BUCKET=real-estate-public`, `R2_PUBLIC_URL=https://pub-xxxx.r2.dev`로 넣고, `frontend/.env.local`에 `NEXT_PUBLIC_DATA_URL=https://pub-xxxx.r2.dev`로 넣는다. 기존 R2 토큰이 새 버킷에도 쓰기 권한이 있는지 확인(토큰 생성 시 "모든 버킷"이면 됨).
- [ ] **P2.** Supabase 대시보드 → `real-estate` → Settings → API Keys → `service_role` 복사 → `.env`에 `SUPABASE_SERVICE_ROLE_KEY=` 추가 → `bash scripts/sync_github_secrets.sh` 실행. (스크립트의 secret 목록에 `R2_PUBLIC_BUCKET`도 추가해서 올린다 — Task 11에서 반영.)
- [ ] **P3.** 로컬 DB 이름 정리: `mv real_estate.db real_estate_local_20260121.db` (좌표 보유 사본). 이후 `real_estate.db`는 R2에서 내려받은 정본.

---

### Task 1: 지역 코드와 인천 개편 정규화

**Files:**
- Create: `pipeline/__init__.py` (빈 파일), `pipeline/regions.py`
- Create: `tests/__init__.py` (빈 파일), `tests/test_regions.py`
- Create: `pytest.ini` (`[pytest]\ntestpaths = tests`)
- Modify: `requirements.txt` — `python-dotenv>=1.0`, `pytest>=8` 추가

**Interfaces:**
- Produces: `REGIONS: dict[str, str]` (83개, 코드→표시명. 기존 `collect_daily.py`의 이름을 쓰되 폐지 5개를 빼고 Global Constraints의 새 11개를 더한다. 새 이름: `"28125": "제물포구", "28155": "영종구", "28275": "서해구", "28290": "검단구", "41192": "부천원미", "41194": "부천소사", "41196": "부천오정", "41591": "화성만세", "41593": "화성효행", "41595": "화성병점", "41597": "화성동탄"`), `SUCCEEDED_BY: dict[str, list[str]]`(Global Constraints 값 그대로), `PREDECESSORS: dict[str, list[str]]`(SUCCEEDED_BY를 뒤집은 것, 예 `"28125": ["28110","28140"]`), `is_retired(code: str) -> bool`, `candidate_codes(code: str) -> list[str]`(`[code] + PREDECESSORS.get(code, [])`; 단지 매칭에 쓴다), `CITY_OF: dict[str, str]` (코드 앞 2자리 → `"서울" | "경기" | "인천"`), `city_of(code: str) -> str`.

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/test_regions.py`

```python
from pipeline.regions import REGIONS, SUCCEEDED_BY, PREDECESSORS, is_retired, candidate_codes, city_of

def test_region_count_is_83():
    assert len(REGIONS) == 83

def test_retired_codes_removed_and_new_present():
    for old in ("28110", "28140", "28260", "41190", "41590"): assert old not in REGIONS and is_retired(old)
    for new in ("28125", "28155", "28275", "28290", "41192", "41194", "41196", "41591", "41593", "41595", "41597"): assert new in REGIONS

def test_predecessors_and_candidates():
    assert PREDECESSORS["28125"] == ["28110", "28140"]
    assert candidate_codes("41595") == ["41595", "41590"]
    assert candidate_codes("11680") == ["11680"]

def test_city_of():
    assert city_of("11680") == "서울" and city_of("41135") == "경기" and city_of("28290") == "인천"
```

- [ ] **Step 2: 실패 확인** — Run: `pytest tests/test_regions.py -v` → Expected: FAIL `ModuleNotFoundError: pipeline`
- [ ] **Step 3: `pipeline/regions.py` 구현** — 위 Interfaces의 이름·값 그대로.
- [ ] **Step 4: 통과 확인** — Run: `pytest tests/test_regions.py -v` → Expected: 4 passed
- [ ] **Step 5: Commit** — `git add pipeline tests pytest.ini requirements.txt && git commit -m "feat(pipeline): 83개 지역 코드와 분구 승계 매핑"`

---

### Task 2: 국토부 API 클라이언트 (매매 + 전월세)

**Files:**
- Create: `pipeline/molit_client.py`, `tests/test_molit_client.py`, `tests/fixtures/trade_sample.xml`, `tests/fixtures/rent_sample.xml`

**Interfaces:**
- Produces:
  - `@dataclass TradeItem: apt_name: str; apt_seq: str | None; lawd_cd: str; dong: str; jibun: str; build_year: int | None; deal_date: str  # YYYY-MM-DD; amount: int  # 만원; area: float; floor: int; cancel_date: str | None`
  - `@dataclass RentItem: apt_name, apt_seq, lawd_cd, dong, jibun, build_year, deal_date, deposit: int, monthly_rent: int, area, floor, contract_type: str | None  # "신규"|"갱신"|None, contract_term: str | None, use_rr_right: bool | None, pre_deposit: int | None, pre_monthly_rent: int | None`
  - `parse_trade_xml(xml: str, lawd_cd: str) -> list[TradeItem]`, `parse_rent_xml(xml: str, lawd_cd: str) -> list[RentItem]`
  - `fetch_trades(lawd_cd: str, deal_ymd: str, *, session=None) -> list[TradeItem]`, `fetch_rents(...) -> list[RentItem]` — `numOfRows=1000`부터 시작해 `totalCount`가 넘치면 `pageNo`를 올려 전부 받는다. 429/502/timeout은 지수 백오프 5회(기존 `collect_daily.fetch_data_with_retry` 로직 이전). 실패 시 `MolitError(lawd_cd, deal_ymd, reason)` raise.
  - `TRADE_URL`, `RENT_URL` 상수(스펙 5.1·7절의 엔드포인트).

- [ ] **Step 1: 픽스처 작성** — `tests/fixtures/trade_sample.xml`: 10/26 실호출 응답 형식 그대로 item 3개(하나는 `cdealDay`에 `26.10.20`, `cdealType` `O`). `tests/fixtures/rent_sample.xml`: item 3개 — ① `deposit`=`49,000`, `monthlyRent`=`0`, `contractType`=` ` ② `deposit`=`10,000`, `monthlyRent`=`150`, `contractType`=`갱신`, `useRRRight`=`사용`, `preDeposit`=`9,000`, `preMonthlyRent`=`150` ③ `aptSeq` 비어 있음.
- [ ] **Step 2: 실패하는 테스트 작성** — `tests/test_molit_client.py`

```python
def test_parse_trade_sample():
    items = parse_trade_xml(read("trade_sample.xml"), "11680")
    assert len(items) == 3
    assert items[0].apt_seq == "11680-280" and items[0].amount == 202500 and items[0].deal_date == "2026-10-06"
    cancelled = [i for i in items if i.cancel_date]
    assert len(cancelled) == 1 and cancelled[0].cancel_date == "2026-10-20"

def test_parse_rent_sample_handles_commas_blanks_and_missing_seq():
    items = parse_rent_xml(read("rent_sample.xml"), "11680")
    assert items[0].deposit == 49000 and items[0].monthly_rent == 0 and items[0].contract_type is None
    assert items[1].contract_type == "갱신" and items[1].use_rr_right is True and items[1].pre_deposit == 9000
    assert items[2].apt_seq is None

def test_fetch_trades_paginates(monkeypatch):  # totalCount=1500 → 2번 호출
    ...  # requests.get을 가짜로 바꿔 pageNo 1,2가 호출되는지와 합친 길이를 assert

def test_fetch_raises_molit_error_after_retries(monkeypatch):
    ...  # 항상 429 → MolitError, 호출 횟수 5
```

- [ ] **Step 3: 실패 확인** — Run: `pytest tests/test_molit_client.py -v` → Expected: FAIL (import error)
- [ ] **Step 4: 구현** — `pipeline/molit_client.py`. 날짜는 `dealYear/dealMonth/dealDay`로, 취소일 `cdealDay`는 `YY.MM.DD` → `20YY-MM-DD`. 숫자 필드는 쉼표 제거 후 int, 공백은 None. `useRRRight`: `"사용"`→True, 공백→None.
- [ ] **Step 5: 통과 확인** — Run: `pytest tests/test_molit_client.py -v` → Expected: 4 passed
- [ ] **Step 6: Commit** — `git commit -m "feat(pipeline): 국토부 매매·전월세 API 클라이언트"`

---

### Task 3: SQLite 스키마 이전과 저장 (apt_seq 매칭, 전월세, 변경 단지 추적)

**Files:**
- Create: `pipeline/db.py`, `tests/test_db.py`
- Modify: `schema.sql` — 아래 변경을 문서로도 반영

**Interfaces:**
- Produces:
  - `connect(path: str) -> sqlite3.Connection` (row_factory=Row, `PRAGMA journal_mode=WAL`)
  - `migrate(conn) -> None` — 멱등. 추가: `apartments.apt_seq TEXT` + `CREATE UNIQUE INDEX IF NOT EXISTS idx_apt_seq ON apartments(apt_seq) WHERE apt_seq IS NOT NULL`; `apartments.household_count INT`; 테이블 `rents(id PK, apt_id, deposit INT, monthly_rent INT, area REAL, floor INT, deal_date TEXT, contract_type TEXT, contract_term TEXT, use_rr_right INT, pre_deposit INT, pre_monthly_rent INT, unique_hash TEXT UNIQUE, created_at)`; 테이블 `apartment_aliases(old_id INT PK, canonical_id INT)`; 테이블 `regions(code TEXT PK, city_name, district_name, succeeded_by TEXT)`가 없으면 생성하고 `succeeded_by` 컬럼이 없으면 추가, `REGIONS`로 83행 채움 + 폐지 코드 5개도 행으로 남기고 `succeeded_by`에 새 코드들을 쉼표로 이어 저장(예 `"41191,41194,41196"` 형식이 아니라 정확히 `",".join(SUCCEEDED_BY[old])`); 테이블 `changed_apartments(apt_id INT PK, changed_at TEXT)`.
  - `upsert_apartment(conn, *, name, lawd_cd, dong, jibun, build_year, apt_seq) -> int` — ① apt_seq로 조회 ② 없으면 `(dong, jibun, name)`이 같고 `lawd_cd IN candidate_codes(lawd_cd)`인 행 조회 → 찾으면 apt_seq가 비어 있으면 채우고, 행의 lawd_cd가 폐지 코드이면 새 lawd_cd로 UPDATE하고 id 반환 ③ 없으면 INSERT. 수집기는 항상 새 코드로 호출하므로 `lawd_cd` 인자는 폐지 코드가 아니다.
  - `insert_trade(conn, apt_id: int, item: TradeItem) -> bool` — unique_hash = md5(`f"{apt_name}|{floor}|{area}|{deal_date}|{amount}"`)(기존 `insight_engine.generate_deal_hash`와 동일하게 유지해 과거 데이터와 중복 판정이 이어지게). 새로 INSERT되면 True. 이미 있는데 `cancel_date`가 새로 생겼으면 UPDATE하고 True. 그 외 False. True일 때 `changed_apartments`에 기록.
  - `insert_rent(conn, apt_id, item: RentItem) -> bool` — unique_hash = md5(`f"R|{apt_name}|{floor}|{area}|{deal_date}|{deposit}|{monthly_rent}"`). 동일 규칙.
  - `pop_changed(conn) -> list[int]` — changed_apartments를 읽고 비운다.
  - `mark_changed(conn, apt_ids: Iterable[int]) -> None`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/test_db.py` (in-memory `:memory:`)

```python
def test_migrate_is_idempotent_and_adds_columns(conn):
    migrate(conn); migrate(conn)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(apartments)")}
    assert {"apt_seq", "household_count"} <= cols
    assert conn.execute("select succeeded_by from regions where code='28260'").fetchone()[0] == "28275,28290"

def test_upsert_matches_by_apt_seq_then_address(conn):
    a = upsert_apartment(conn, name="래미안", lawd_cd="11680", dong="역삼동", jibun="1", build_year=2000, apt_seq="11680-1")
    b = upsert_apartment(conn, name="래미안", lawd_cd="11680", dong="역삼동", jibun="1", build_year=2000, apt_seq=None)
    c = upsert_apartment(conn, name="다른이름", lawd_cd="11680", dong="역삼동", jibun="2", build_year=2000, apt_seq="11680-1")
    assert a == b == c

def test_upsert_old_incheon_code_merges_into_new(conn):  # Review Focus 3
    old = upsert_apartment(conn, name="청라X", lawd_cd="28260", dong="청라동", jibun="5", build_year=2010, apt_seq=None)
    new = upsert_apartment(conn, name="청라X", lawd_cd="28275", dong="청라동", jibun="5", build_year=2010, apt_seq="28275-9")
    assert old == new
    assert conn.execute("select lawd_cd, apt_seq from apartments where id=?", (old,)).fetchone() == ("28275", "28275-9")

def test_insert_trade_dedup_and_cancel_marks_changed(conn):  # Review Focus 5
    ...  # 같은 item 두 번 → 두 번째 False, pop_changed == [apt_id] 한 번만
    ...  # 세 번째는 cancel_date 추가된 item → True, pop_changed == [apt_id], DB의 cancel_date 갱신

def test_insert_rent_dedup(conn): ...
```

- [ ] **Step 2: 실패 확인** — Run: `pytest tests/test_db.py -v` → Expected: FAIL
- [ ] **Step 3: 구현** — `pipeline/db.py`
- [ ] **Step 4: 통과 확인** — Run: `pytest tests/test_db.py -v` → Expected: 5 passed
- [ ] **Step 5: `schema.sql` 갱신 후 Commit** — `git commit -m "feat(pipeline): apt_seq 매칭·전월세 테이블·변경 단지 추적"`

---

### Task 4: 수집 CLI

**Files:**
- Create: `pipeline/collect.py`, `tests/test_collect.py`

**Interfaces:**
- Consumes: Task 1–3.
- Produces:
  - `month_range(start: str, end: str) -> list[str]` (`"202602","202608"` → 7개)
  - `current_and_previous_month(today: date) -> list[str]`
  - `collect(conn, *, kinds: set[str], months: list[str], regions: dict[str,str] = REGIONS, fetch_trades=fetch_trades, fetch_rents=fetch_rents, delay: float = 0.5, log=print) -> CollectResult(fetched: int, saved: int, failed: list[tuple[str,str,str]])`
  - CLI: `python -m pipeline.collect --db real_estate.db --kind trade|rent|both [--months 202609,202610 | --from 202602 --to 202608 | --daily]` 끝나면 `changed_apts.json`(`[apt_id,...]`, `pop_changed` 결과)을 `--changed-out` 경로(기본 `changed_apts.json`)에 쓴다. `--daily`는 이번달·지난달.

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_month_range(): assert month_range("202511", "202602") == ["202511","202512","202601","202602"]

def test_collect_saves_and_reports_changed(conn, tmp_path):
    fake_trades = lambda lawd, ym, **kw: [TradeItem(...)] if lawd == "11680" else []
    res = collect(conn, kinds={"trade"}, months=["202610"], regions={"11680": "강남구", "11140": "중구"}, fetch_trades=fake_trades, fetch_rents=lambda *a, **k: [], delay=0)
    assert res.saved == 1 and res.failed == []
    assert pop_changed(conn) == [1]

def test_collect_records_failed_region_and_continues(conn):
    def boom(lawd, ym, **kw): raise MolitError(lawd, ym, "429")
    res = collect(conn, kinds={"trade"}, months=["202610"], regions={"11680":"강남구"}, fetch_trades=boom, fetch_rents=None, delay=0)
    assert res.failed == [("11680", "202610", "429")]
```

- [ ] **Step 2: 실패 확인** — `pytest tests/test_collect.py -v` → FAIL
- [ ] **Step 3: 구현** — 로그 형식은 기존 `collect_daily.py`와 같게(`[시각]   지역명: +N건 (전체 M건 중 신규)`). 0건 지역도 한 줄 남긴다(인천처럼 조용히 빠지는 일을 막기 위해).
- [ ] **Step 4: 통과 확인** — `pytest tests/test_collect.py -v` → 3 passed
- [ ] **Step 5: 실제 API로 스모크** — Run: `python -m pipeline.collect --db /tmp/smoke.db --kind both --months 202610` (`.env`의 키 사용, 약 160회 호출) → Expected: 로그에 79개 지역 × 2종류, `failed: 0`, `changed_apts.json` 생성. 끝나면 `/tmp/smoke.db` 삭제.
- [ ] **Step 6: Commit** — `git commit -m "feat(pipeline): 수집 CLI (매매·전월세, 월 범위, 변경 단지 출력)"`

---

### Task 5: 단지 요약 계산 (평형별 시세, 배지, 전세가율)

**Files:**
- Create: `pipeline/summary.py`, `tests/test_summary.py`

**Interfaces:**
- Consumes: Task 3 스키마.
- Produces:
  - `trade_area_stats(conn, apt_id, today: date) -> list[AreaStat]` — `AreaStat = {area:int, count, max_amount, min_amount, avg_amount, latest_amount, latest_date, recent_avg (3개월, 거래 없으면 None), recent_count, peak_date}`. 취소 거래 제외. 정렬 area 오름차순.
  - `rent_area_stats(conn, apt_id, today) -> list[RentAreaStat]` — `{area, jeonse_count, wolse_count, latest_deposit, latest_monthly_rent, latest_date, recent_jeonse_avg (3개월, 월세 0인 건만)}`
  - `metrics(trade_stats, rent_stats, today) -> dict` — 키: `bargain_amount, bargain_percent`(최신 거래 평형의 latest_amount − recent_avg, recent_count ≥ 3일 때만), `recovery_rate`(latest/peak×100), `peak_date`, `days_since_last_tx`, `jeonse_ratio`(같은 평형 recent_jeonse_avg / recent_avg × 100, 둘 다 있을 때만). 없는 값은 키 자체를 넣지 않는다.
  - `apartment_summary(conn, apt_id, today) -> dict` — Supabase `apartments` 행과 같은 키(Task 9 스키마): `id, name, lawd_cd, city, dong, jibun, build_year, apt_seq, lat, lng, latest_trade_amount, latest_trade_date, latest_trade_area, latest_jeonse_deposit, latest_jeonse_date, trade_count, rent_count, recent_avg, peak_amount, jeonse_ratio, area_stats(json), rent_area_stats(json), metrics(json), updated_at`.

- [ ] **Step 1: 실패하는 테스트 작성** — 픽스처: 단지 1개에 84㎡ 거래 5건(최근 3개월에 3건, 그중 1건은 cancel_date 있음), 59㎡ 거래 1건, 전세 2건(84㎡), 월세 1건.

```python
def test_trade_area_stats_excludes_cancelled_and_groups_by_rounded_area(conn):  # Review Focus 1
    stats = trade_area_stats(conn, apt_id, date(2026,10,26))
    s84 = next(s for s in stats if s["area"] == 84)
    assert s84["count"] == 4 and s84["recent_count"] == 2
    assert s84["latest_amount"] == <취소 아닌 최신 금액>

def test_metrics_bargain_requires_three_recent_trades(...)
def test_jeonse_ratio_uses_same_area(...)  # 84㎡ 전세 평균 / 84㎡ 매매 3개월 평균
def test_summary_for_rent_only_apartment_has_null_trade_fields(conn):  # Review Focus 4
    row = apartment_summary(conn, rent_only_id, date(2026,10,26))
    assert row["latest_trade_amount"] is None and row["rent_count"] == 1 and row["metrics"] == {}
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — SQL은 기존 `api_server.py:473-498`의 area_stats 쿼리를 옮기되 `cancel_date IS NULL` 조건을 추가하고 `date('now')` 대신 `today` 인자를 쓴다.
- [ ] **Step 4: 통과 확인** → 4 passed
- [ ] **Step 5: Commit** — `git commit -m "feat(pipeline): 단지 요약·평형별 시세·배지·전세가율 계산"`

---

### Task 6: 정적 JSON 내보내기

**Files:**
- Create: `pipeline/export_json.py`, `tests/test_export_json.py`

**Interfaces:**
- Consumes: Task 5.
- Produces (모두 `dict` 반환; 파일 쓰기는 `write_gz(path, obj)`):
  - `build_apt_trade(conn, apt_id, today) -> dict` → `{apartment:{id,name,dong,lawd_cd,region_name,city,jibun,build_year,apt_seq,lat,lng}, area_stats, metrics, transactions:[{id,amount,area,floor,deal_date,cancel_date}]}` (transactions는 deal_date 내림차순, 취소 포함)
  - `build_apt_rent(conn, apt_id, today) -> dict` → `{apartment, rent_area_stats, rents:[{id,deposit,monthly_rent,area,floor,deal_date,contract_type,use_rr_right,pre_deposit,pre_monthly_rent}]}`
  - `build_region(conn, lawd_cd, today) -> dict` → `{code, name, city, succeeded_by, apartments:[apartment_summary 축약: id,name,dong,build_year,trade_count,latest_trade_amount,latest_trade_date,latest_jeonse_deposit,lat,lng]}`
  - `build_stats(conn, today) -> dict` → 기존 `/api/stats` + `/api/stats/regions` 합본: `{data_updated_at, data_range:{min_date,max_date}, total_apartments, recent_transactions_30d, regions:[{code,name,city,avg_amount,tx_count_12m,yoy_change}], top_up:[…3], top_down:[…3]}`
  - `build_search_index(conn) -> list[list]` → `[[id, name, dong, lawd_cd, build_year], …]`
  - `build_meta(conn, today) -> dict` → `{data_updated_at, data_range, apartment_count, trade_count, rent_count}`
  - `export(conn, out_dir: str, *, apt_ids: list[int] | None, today) -> list[str]` — `apt_ids=None`이면 전 단지. 항상 region(영향받은 지역만, None이면 전부)·stats·search·meta를 다시 만든다. 반환은 쓴 파일의 R2 키 목록(`v1/apt/123/trade.json` 형식, 로컬 경로는 `out_dir/v1/...json.gz`).
  - `write_gz(path, obj)` — `json.dumps(ensure_ascii=False, separators=(",",":"))` → gzip.

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_build_apt_trade_keeps_cancelled_in_list_but_not_in_stats(conn): ...  # Review Focus 1
def test_export_changed_only_writes_only_those_apts_plus_shared_files(conn, tmp_path):
    keys = export(conn, str(tmp_path), apt_ids=[1], today=...)
    assert "v1/apt/1/trade.json" in keys and "v1/apt/2/trade.json" not in keys
    assert {"v1/stats/summary.json", "v1/search/index.json", "v1/meta.json"} <= set(keys)
    assert (tmp_path / "v1/apt/1/trade.json.gz").exists()
def test_export_rent_only_apartment(conn, tmp_path): ...  # Review Focus 4: trade.json도 생성되고 transactions == []
def test_search_index_shape(conn): assert build_search_index(conn)[0] == [1, "래미안", "역삼동", "11680", 2000]
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** → 4 passed
- [ ] **Step 5: Commit** — `git commit -m "feat(pipeline): 단지·지역·통계·검색 JSON 내보내기"`

---

### Task 7: R2 발행 (공개 버킷, gzip 헤더, 변경분만)

**Files:**
- Create: `pipeline/r2_publish.py`, `tests/test_r2_publish.py`
- Modify: `r2_utils.py` — `get_r2_client()`만 재사용

**Interfaces:**
- Produces: `publish(out_dir: str, keys: list[str], *, bucket: str = env R2_PUBLIC_BUCKET, client=None, max_workers: int = 8) -> int` — 각 키에 대해 `out_dir/{key}.gz`를 `put_object(Bucket, Key=key, Body, ContentType="application/json", ContentEncoding="gzip", CacheControl="public, max-age=600")`. 스레드풀로 병렬. 성공 개수 반환, 실패는 예외 모아 마지막에 raise.
- CLI: `python -m pipeline.r2_publish --out out --keys keys.json`

- [ ] **Step 1: 실패하는 테스트** — 가짜 client(`put_object` 호출 기록)를 주입해 헤더 3개와 키·본문(gzip 바이트)을 assert. 실패 1건 섞으면 나머지는 올라가고 마지막에 `PublishError` raise.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** → 2 passed
- [ ] **Step 5: 실제 R2 스모크** — `python -c "..."`로 `v1/meta.json` 하나만 올린 뒤 `curl -sI $R2_PUBLIC_URL/v1/meta.json` → Expected: `content-encoding: gzip`, `cache-control: public, max-age=600`, `curl -s --compressed` 결과가 JSON.
- [ ] **Step 6: Commit** — `git commit -m "feat(pipeline): R2 공개 버킷 발행"`

---

### Task 8: 좌표 — 로컬 사본에서 이식 + 카카오 지오코딩

**Files:**
- Create: `pipeline/geocode.py`, `pipeline/migrate_coords.py`, `tests/test_geocode.py`

**Interfaces:**
- Produces:
  - `migrate_coords(src_db: str, dst_conn) -> int` — src의 `(dong, jibun, name)`과 같고 dst 행의 `lawd_cd`가 src 행 lawd_cd의 `candidate_codes` 안에 있는(또는 그 반대) 행에 `(latitude, longitude, geocode_quality)`를 복사. dst의 좌표 없는 행만. 복사 건수 반환.
  - `geocode_address(lawd_cd, dong, jibun, *, session=None) -> tuple[float,float,str] | None` — 카카오 `v2/local/search/address.json` query=`f"{REGION_FULLNAME[lawd_cd]} {dong} {jibun}"`(`REGION_FULLNAME`은 Task 1 `REGIONS`에 시도명을 붙인 것, `regions.py`에 추가). 결과 없으면 None. 반환 quality: `"kakao_address"`.
  - `fill_missing_coords(conn, *, limit: int = 20000, delay: float = 0.05, geocode=geocode_address) -> tuple[int,int]` — (성공, 실패). 실패는 `geocode_quality="failed"`로 기록해 다음 실행에서 재시도하지 않는다(`--retry-failed`로만).
  - CLI: `python -m pipeline.migrate_coords --src real_estate_local_20260121.db --db real_estate.db`, `python -m pipeline.geocode --db real_estate.db [--retry-failed]`

- [ ] **Step 1: 실패하는 테스트** — migrate: src/dst 메모리 DB 둘, 옛 인천 코드 행이 새 코드 행에 붙는 케이스 포함. geocode: 가짜 geocode 함수로 성공/실패 기록 확인.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** → passed
- [ ] **Step 5: Commit** — `git commit -m "feat(pipeline): 좌표 이식과 카카오 지오코딩"`

---

### Task 9: Supabase 스키마와 요약 동기화

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `pipeline/supabase_sync.py`, `tests/test_supabase_sync.py`

**Interfaces:**
- 스키마(`0001_init.sql`):
  - `regions(code text pk, name text, city text, succeeded_by text, lat float8, lng float8, apartment_count int, avg_amount int, updated_at timestamptz)`
  - `apartments(id int pk, name, lawd_cd text, city text, dong, jibun, build_year int, apt_seq text, lat float8, lng float8, latest_trade_amount int, latest_trade_date date, latest_trade_area int, latest_jeonse_deposit int, latest_jeonse_date date, trade_count int, rent_count int, recent_avg int, peak_amount int, jeonse_ratio real, area_stats jsonb, rent_area_stats jsonb, metrics jsonb, updated_at timestamptz)` + 인덱스 `(lat, lng)`, `(lawd_cd)`, `(latest_trade_amount)`, `(build_year)`
  - `apartment_aliases(old_id int pk, canonical_id int)`
  - RLS: 세 테이블 `enable row level security` + `create policy "public read" ... for select using (true)`. 쓰기는 service role만.
  - 지도 범위 조회 함수: `apartments_in_bbox(min_lat, min_lng, max_lat, max_lng, mode text, max_rows int) returns setof apartments` (lat/lng 인덱스 범위 조건, mode `trade`면 latest_trade_amount not null, `rent`면 latest_jeonse_deposit not null, `order by trade_count desc limit max_rows`). PostGIS는 쓰지 않는다(2만 점에 불필요; 스펙의 PostGIS 언급은 빌더 재량으로 생략).
- `supabase_sync.py`:
  - `upsert_apartments(rows: list[dict], *, url=env, key=env, session=None, batch: int = 500) -> int` — `POST {url}/rest/v1/apartments` 헤더 `apikey`, `Authorization: Bearer`, `Prefer: resolution=merge-duplicates,return=minimal`.
  - `upsert_regions(rows) -> int` — 같은 방식. `lat/lng`는 지역 내 단지 좌표 평균, `avg_amount`는 Task 6 `build_stats`의 지역 avg_amount.
  - `sync(conn, apt_ids: list[int] | None, today) -> tuple[int,int]` — apt_ids의 `apartment_summary`를 upsert, 영향받은 지역 upsert.
  - CLI: `python -m pipeline.supabase_sync --db real_estate.db [--changed changed_apts.json | --all]`

- [ ] **Step 1: 실패하는 테스트** — 가짜 session으로 요청 URL·헤더·배치 크기(1,001행 → 3회 호출)·본문 키를 assert.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현 + 마이그레이션 적용** — SQL 작성 후 Supabase MCP `apply_migration`(project `dytfzufccqsakigehjkx`, name `init`)으로 적용. `list_tables`로 3개 테이블 확인.
- [ ] **Step 4: 통과 확인** → passed
- [ ] **Step 5: 실제 스모크** — 테스트 행 1개 upsert → MCP `execute_sql "select count(*) from apartments"` = 1 → 삭제.
- [ ] **Step 6: Commit** — `git commit -m "feat: Supabase 스키마와 단지 요약 동기화"`

---

### Task 10: 최초 이전 실행 (로컬, 사용자 Mac)

**Files:**
- Create: `scripts/initial_migration.sh` — 아래 단계를 순서대로 담은 스크립트(각 단계는 환경변수 `STEP=`로 건너뛸 수 있게). `caffeinate -i` 로 감싼다.

- [ ] **Step 1: 정본 내려받기** — `python r2_utils.py download` → `real_estate.db`(R2 사본, 2026-10까지). `sqlite3 real_estate.db "select max(deal_date) from transactions"` → `2026-10-2x`.
- [ ] **Step 2: 스키마 이전 + 좌표 이식** — `python -c "from pipeline.db import connect, migrate; migrate(connect('real_estate.db'))"` → `python -m pipeline.migrate_coords --src real_estate_local_20260121.db --db real_estate.db` → Expected 로그: 이식 ≈ 12,900건.
- [ ] **Step 3: 매매 백필** — `python -m pipeline.collect --db real_estate.db --kind trade --from 202602 --to 202610` (79×9 = 711회, 약 8분). Expected: failed 0. 확인: `select count(*) from transactions where deal_date between '2026-05-01' and '2026-08-31'` > 50,000; `select count(*) from transactions t join apartments a on a.id=t.apt_id where a.lawd_cd in ('28125','28155','28275','28290') and deal_date >= '2026-07-01'` > 0.
- [ ] **Step 4: 전월세 백필 (2일에 나눠)** — 1일차 `--kind rent --from 201101 --to 201812` (79×96 = 7,584회), 2일차 `--from 201901 --to 202610` (79×94 = 7,426회). 각 1시간 안팎. Expected: failed 0. 확인: `select count(*) from rents` > 2,000,000.
- [ ] **Step 5: 좌표 채우기** — `python -m pipeline.geocode --db real_estate.db` → Expected: 성공 ≥ 5,000, `select count(*) from apartments where latitude is null and geocode_quality is null` = 0.
- [ ] **Step 6: 전체 내보내기 + 발행 + 동기화** — `python -m pipeline.export_json --db real_estate.db --out out --all` → `python -m pipeline.r2_publish --out out --keys out/keys.json`(약 4만 파일, 10~20분) → `python -m pipeline.supabase_sync --db real_estate.db --all`. 확인: `curl -s --compressed $R2_PUBLIC_URL/v1/meta.json`의 `rent_count` > 0; MCP `execute_sql "select count(*) from apartments where lat is not null"` ≈ 18,000.
- [ ] **Step 7: 정본 업로드** — `python r2_utils.py upload`.
- [ ] **Step 8: Commit** — `git add scripts/initial_migration.sh && git commit -m "chore: 최초 이전 스크립트"`

---

### Task 11: 매일 수집 워크플로 교체

**Files:**
- Modify: `.github/workflows/collect-daily.yml` (전면 교체), `scripts/sync_github_secrets.sh`(secret 목록에 `R2_PUBLIC_BUCKET` 추가)
- Create: `data/last_run.json`, `.github/workflows/backfill.yml`
- Delete: `collect_daily.py`, `collect_all.py`, `collect_2006_2010.py`, `collect_incremental.py`, `collect_smart.py`, `collector_core.py`, `scheduler.py`, `monitor.sh`, `insight_engine.py`, `*.log`, `progress.json`(gitignore 됨)

**Interfaces:** 잡 순서 — checkout → python 3.11 → `pip install -r requirements.txt` → `python r2_utils.py download` → `python -m pipeline.collect --kind both --daily --changed-out changed_apts.json` → `python -m pipeline.geocode --db real_estate.db --limit 500` → `python -m pipeline.export_json --changed changed_apts.json --out out` → `python -m pipeline.r2_publish --out out --keys out/keys.json` → `python -m pipeline.supabase_sync --changed changed_apts.json` → `python r2_utils.py upload` → `data/last_run.json`에 `{"ran_at", "saved", "failed"}` 쓰고 `git commit -m "chore: daily run" && git push`(`permissions: contents: write`, `actions/checkout`에 `token: ${{ github.token }}`). cron 3개와 `workflow_dispatch` 유지. `timeout-minutes: 30`. `concurrency: group: collect, cancel-in-progress: false`.
`backfill.yml`: `workflow_dispatch` inputs `kind`, `from`, `to`; 같은 단계. (SQLite 경합을 피하려고 `concurrency` 그룹을 daily와 같은 `collect`로 둔다.)

- [ ] **Step 1: 워크플로 작성**
- [ ] **Step 2: 로컬에서 같은 순서를 `--daily`로 한 번 돌려 확인** — Expected: 각 단계 exit 0, `changed_apts.json` 길이 > 0, R2에 변경 단지 파일 갱신(`curl -sI`의 `last-modified`).
- [ ] **Step 3: 옛 스크립트 삭제, Commit, push** — `git commit -m "feat(ci): pipeline 기반 매일 수집 워크플로"` → `git push origin main`
- [ ] **Step 4: 수동 실행** — `gh workflow run "Daily Collection" -R link8411-max/real-estate-poc` → `gh run watch` → Expected: success, 25분 이내, `data/last_run.json` 커밋이 생김.

---

### Task 12: 프론트 데이터 계층 + 검색

**Files:**
- Create: `frontend/src/lib/data.ts`, `frontend/src/lib/types.ts`, `frontend/src/lib/search.ts`, `frontend/src/lib/format.ts`, `frontend/src/lib/__tests__/search.test.ts`, `frontend/src/lib/__tests__/format.test.ts`, `frontend/vitest.config.ts`
- Modify: `frontend/package.json` — devDependencies `vitest`, scripts `"test": "vitest run"`

**Interfaces:**
- `types.ts`: Task 6 JSON과 1:1인 `AptTrade, AptRent, RegionFile, StatsFile, SearchIndexRow = [number,string,string,string,number|null], MetaFile, AreaStat, RentAreaStat, Metrics`.
- `data.ts`: `DATA_URL = process.env.NEXT_PUBLIC_DATA_URL!`; `fetchAptTrade(id: number, init?: RequestInit): Promise<AptTrade | null>`(404 → null), `fetchAptRent`, `fetchRegion(code: string)`, `fetchStats()`, `fetchMeta()`, `fetchSearchIndex()`(모듈 레벨 Promise 캐시). 서버 컴포넌트에서는 `{ next: { revalidate: 600 } }`를 기본 init으로.
- `search.ts`: `toChosung(s: string): string`, `searchIndex(rows: SearchIndexRow[], q: string, limit = 30): SearchIndexRow[]` — 공백 제거 후 ① 이름 포함 ② 동 포함 ③ 초성 일치(q가 전부 초성일 때) 순으로 정렬.
- `format.ts`: `formatManwon(n: number): string`(`125000` → `"12억 5,000"`), `areaToPyeong(m2: number): number`(÷3.3058 반올림), `formatDeal(d: string): string`(`"2026-10-06"` → `"26.10.06"`).

- [ ] **Step 1: 실패하는 테스트**

```ts
test("초성 검색", () => { expect(toChosung("래미안")).toBe("ㄹㅁㅇ"); expect(searchIndex(rows, "ㄹㅁㅇ").map(r=>r[1])).toContain("래미안대치팰리스"); });
test("이름 부분 일치가 동 일치보다 먼저", ...);
test("formatManwon", () => { expect(formatManwon(125000)).toBe("12억 5,000"); expect(formatManwon(9500)).toBe("9,500"); expect(formatManwon(100000)).toBe("10억"); });
```

- [ ] **Step 2: 실패 확인** — `cd frontend && npm test` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — `npm test` → passed; `npx tsc --noEmit` → 0 errors
- [ ] **Step 5: Commit** — `git commit -m "feat(web): R2 데이터 계층, 클라이언트 검색, 포맷 유틸"`

---

### Task 13: 페이지 재구축 (기존 페이지 코드는 버리고 새로 만든다)

사용자 지시(10/27): 기존 페이지는 버그가 많으므로 고쳐 쓰지 않고 **새로 만든다.** 페이지 파일은 얇게 두고 로직과 UI는 `components/`·`lib/`의 작은 단위로 쪼개 각각 테스트를 붙인다. 기존 `page.tsx`들은 참고만 하고 코드를 복사하지 않는다.

**Files:**
- Rewrite(내용 전부 교체): `frontend/src/app/page.tsx`, `search/page.tsx`, `browse/page.tsx`, `stats/page.tsx`, `compare/page.tsx`, `apartment/[id]/page.tsx`, `apartment/[id]/layout.tsx`, `sitemap.ts`, `api/og/[id]/route.tsx`, `layout.tsx`, `components/PriceChart.tsx`
- Create: `frontend/src/lib/history.ts`, `frontend/src/lib/compare.ts`(비교 목록 localStorage 읽기/쓰기, 최대 2개), `frontend/src/components/SearchBox.tsx`, `RegionBrowser.tsx`, `ApartmentHeader.tsx`, `InsightBadges.tsx`, `AreaStatsTable.tsx`, `DealList.tsx`(무한스크롤은 클라이언트 슬라이스 50건씩), `CompareTable.tsx`, `RegionStatsTable.tsx`(정렬 6종), `RecentDeals.tsx`
- Create tests (`frontend/src/**/__tests__/*.test.ts(x)`): `history.test.ts`, `compare.test.ts`, `SearchBox.test.tsx`, `InsightBadges.test.tsx`, `AreaStatsTable.test.tsx`, `DealList.test.tsx`, `RegionStatsTable.test.tsx`, `CompareTable.test.tsx`
- Delete: `frontend/src/app/monitor/`, `frontend/src/app/perf-test/`
- Modify: `frontend/.env.local`(`NEXT_PUBLIC_API_URL` 삭제), `robots.ts`(Disallow에서 `/monitor`, `/perf-test` 제거)

**Interfaces:**
- 데이터는 전부 Task 12 함수로. 홈 최근 거래 6건은 `stats.recent`(Task 6 `build_stats`의 `recent:[{apt_id,name,region_name,amount,area,deal_date}]` 6건).
- `history.ts`: `monthlyHistory(items, {area?, valueKey:"amount"|"deposit"}) -> {month:"YYYY-MM", avg, count}[]` — 취소 거래 제외, 오름차순.
- `compare.ts`: `getCompareIds(): number[]`, `toggleCompare(id): number[]`(2개 초과면 가장 오래된 것 제거), `clearCompare()`.
- `InsightBadges({metrics})`: `bargain_percent ≤ -5` → "급매", `recovery_rate < 80` → "전고점 대비 -N%", `days_since_last_tx ≥ 180` → "거래 없음 N일", `jeonse_ratio` 있으면 "전세가율 N%". 없으면 아무것도 렌더링하지 않는다.
- `AreaStatsTable({stats, selected, onSelect})`: 행 클릭 시 평형 선택(토글). 금액은 `formatManwon`, 면적은 "84㎡ (34평)".
- `DealList({transactions, area})`: 선택 평형 필터, 취소 거래는 취소선 + "취소" 뱃지, 50건씩 더 보기(IntersectionObserver).
- `RegionStatsTable({regions, sort})`: 정렬 키 `name|avg_desc|avg_asc|count_desc|count_asc|yoy_desc|yoy_asc`.
- 컴포넌트 테스트는 `@testing-library/react` + `jsdom`으로 렌더링 결과와 상호작용(클릭 후 상태)을 확인한다. 기존 디자인(Tailwind, lucide 아이콘, 카드 레이아웃)은 유지하되 코드는 새로 쓴다.

- [ ] **Step 1: 테스트 환경** — `npm i -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom`, `vitest.config.ts`에 `environment: "jsdom"`, `setupFiles`. 빈 컴포넌트 테스트 하나로 환경 동작 확인.
- [ ] **Step 2: `history.ts`, `compare.ts` 테스트 → 구현**
- [ ] **Step 3: 컴포넌트별로 "테스트 작성 → 실패 확인 → 구현 → 통과" 반복** — 위 8개 테스트 파일 순서대로.
- [ ] **Step 4: 페이지 조립** — 각 `page.tsx`를 컴포넌트 조합으로 새로 작성. 옛 페이지 삭제(monitor, perf-test).
- [ ] **Step 5: 빌드 확인** — `cd frontend && npm test && npx tsc --noEmit && npm run build` → 모두 통과. `grep -r NEXT_PUBLIC_API_URL src` → 없음.
- [ ] **Step 6: 브라우저 확인** — `/`, `/search?q=래미안`, `/search?q=ㄹㅁㅇ`, `/browse?city=인천`(새 구 4개, 옛 구는 새 구 아래 묶임), `/apartment/<id>`(배지·차트·평형 선택·목록·취소 표시), `/compare?ids=a,b`, `/stats`(정렬) — 스크린샷, 콘솔 에러 0.
- [ ] **Step 7: Commit** — `git commit -m "feat(web): 페이지 재구축 (정적 데이터, 컴포넌트 분리, 테스트)"`

---

### Task 14: 단지 상세에 전월세 탭·전세가율

**Files:**
- Create: `frontend/src/components/RentSection.tsx`, `frontend/src/components/DealTabs.tsx`
- Modify: `frontend/src/app/apartment/[id]/page.tsx`, `frontend/src/components/PriceChart.tsx`(보증금 시리즈를 받을 수 있게 `valueLabel` prop)

**Interfaces:** `DealTabs` — `매매 | 전세 | 월세` 세그먼트, URL 쿼리 `?tab=trade|jeonse|wolse`. `RentSection({ rent: AptRent, tab })` — 평형별 카드(`rent_area_stats`), 전세 차트(`monthlyHistory`를 deposit 기준으로 재사용: `lib/history.ts`에 `valueKey` 인자 추가), 목록(계약구분·갱신요구권·이전 보증금 표시). 매매 탭 요약에 `metrics.jeonse_ratio`가 있으면 "전세가율 NN%" 배지.

- [ ] **Step 1: `RentSection.test.tsx`, `DealTabs.test.tsx` 작성(탭 전환, 전세/월세 분리, 갱신 표시) → 실패 확인 → 구현**
- [ ] **Step 2: 상세 페이지에서 `fetchAptRent`를 병렬 호출해 조립**
- [ ] **Step 3: 확인** — `npm test && npx tsc --noEmit`; 브라우저에서 전세·월세 탭, 전월세만 있는 단지(Review Focus 4)에서 매매 탭이 "거래 없음"을 보여주는지.
- [ ] **Step 4: Commit** — `git commit -m "feat(web): 단지 상세 전월세 탭과 전세가율"`

---

### Task 15: `/api/v1` Route Handlers (지도 범위·필터·검색)

**Files:**
- Create: `frontend/src/lib/supabase/server.ts`, `frontend/src/lib/filters.ts`, `frontend/src/lib/__tests__/filters.test.ts`, `frontend/src/app/api/v1/map/route.ts`, `frontend/src/app/api/v1/apartments/route.ts`, `frontend/src/app/api/v1/search/route.ts`, `docs/api/openapi.yaml`
- Modify: `frontend/package.json` — `@supabase/supabase-js`

**Interfaces:**
- `server.ts`: `supabaseServer()` — anon key로 생성(공개 읽기 RLS). 
- `filters.ts`: `parseApartmentFilters(sp: URLSearchParams): ApartmentFilters` — `lawd?: string[]; city?: string; minPrice?: number; maxPrice?: number; minArea?: number; maxArea?: number; builtFrom?: number; builtTo?: number; activeMonths?: number; sort: "latest"|"price_desc"|"price_asc"|"count_desc"|"yoy_desc"; page: number(1부터, 50개)`; 잘못된 값은 무시(기본값). `applyFilters(query, f)` — supabase 쿼리 빌더에 적용.
- `GET /api/v1/map?minLat&minLng&maxLat&maxLng&level&mode=trade|rent` → `level ≤ 7`: `rpc("apartments_in_bbox", {..., max_rows: 500})` 결과 `{type:"apartments", items:[{id,name,lat,lng,latest_trade_amount,latest_jeonse_deposit,trade_count,build_year}]}`; `level > 7`: `regions` 테이블에서 bbox 안 `{type:"regions", items:[{code,name,lat,lng,apartment_count,avg_amount}]}`.
- `GET /api/v1/apartments?…필터` → `{items:[apartments 요약 행 중 id,name,dong,lawd_cd,build_year,latest_trade_amount,latest_trade_date,trade_count,jeonse_ratio,lat,lng], page, total}`.
- `GET /api/v1/search?q=` → `apartments` `name ilike %q%` 20건(인덱스 받기 전 첫 검색용).
- 에러 `{error:{code,message}}`, 상태 400/500. 응답 헤더 `Cache-Control: public, s-maxage=300`.

- [ ] **Step 1: `filters.test.ts` 작성** — 파싱 기본값, 잘못된 숫자 무시, sort 화이트리스트.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현 + `openapi.yaml`에 세 엔드포인트 기술**
- [ ] **Step 4: 통과 확인 + 로컬 호출** — `npm test`; `curl "localhost:3000/api/v1/map?minLat=37.49&minLng=127.02&maxLat=37.52&maxLng=127.07&level=5&mode=trade"` → items > 0.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): v1 지도 범위·필터·검색 엔드포인트"`

---

### Task 16: 지도 페이지와 필터 패널

**Files:**
- Create: `frontend/src/app/map/page.tsx`, `frontend/src/components/KakaoMap.tsx`, `frontend/src/components/MapMarkers.tsx`, `frontend/src/components/FilterPanel.tsx`, `frontend/src/lib/useMapData.ts`
- Modify: `frontend/src/app/layout.tsx`(카카오맵 SDK `<Script src="//dapi.kakao.com/v2/maps/sdk.js?appkey=…&autoload=false" strategy="beforeInteractive">`), `page.tsx`(지도 진입 버튼)

**Interfaces:** `KakaoMap({ center, level, onIdle(bounds, level) })` — `window.kakao.maps.load` 후 지도 생성, `idle` 이벤트 debounce 300ms. `useMapData(bounds, level, mode, filters)` — `/api/v1/map` 호출, 이전 요청 AbortController로 취소. 마커: 단지 모드는 `CustomOverlay`에 `formatManwon(latest)` 라벨(전세 모드는 보증금), 클릭 → `/apartment/[id]`; 지역 모드는 지역명 + 평균가 원형 오버레이, 클릭 → 그 지역으로 줌(level 6). `FilterPanel` — Task 15 필터 중 가격대·평형·준공·거래종류, 데스크톱은 좌측 패널, 모바일(<768px)은 하단 시트; 상태는 URL 쿼리에 동기화. 초기 center 서울시청 `(37.5665, 126.978)`, level 8.

- [ ] **Step 1: `FilterPanel.test.tsx`(값 변경이 URL 쿼리에 반영), `useMapData.test.ts`(bounds 변경 시 이전 요청 abort, 응답 type 분기) 작성 → 실패 확인 → 구현.** `KakaoMap`은 SDK 의존이라 테스트하지 않고 `window.kakao` 부재 시 안내 문구만 렌더링하는지 확인.
- [ ] **Step 2: 확인** — `npm test`; 브라우저: 줌 8에서 지역 원, 줌 5에서 단지 라벨, 전세 토글, 필터 적용 시 마커 수 변화, 모바일 폭(375px)에서 하단 시트. 콘솔 에러 0.
- [ ] **Step 3: Commit** — `git commit -m "feat(web): 카카오맵 기반 지도 탐색과 필터"`

---

### Task 17: 배포, Render 제거, 문서

**Files:**
- Delete: `api_server.py`, `startup.sh`, `render.yaml`, `test_api_performance.sh`, `test_browser_simulation.sh`, `PLAN.md`
- Modify: `CLAUDE.md`(구조·실행·환경변수·API를 새 구조로 전면 갱신), `.env.example`(새 변수 목록), `README.md` 없음 → `CLAUDE.md`가 문서.

- [ ] **Step 1: Vercel 환경변수 추가** — 대시보드에서 `NEXT_PUBLIC_DATA_URL`(Config). `git push origin main` → Vercel 자동 배포 → `https://real-estate-poc-self.vercel.app/map` 동작, `/apartment/<id>` 첫 응답 1초 이내(`curl -w %{time_total}`).
- [ ] **Step 2: Render 서비스 삭제** — Render MCP로는 삭제 불가하므로 사용자가 대시보드에서 `real-estate-poc` 서비스 Delete. 그 뒤 위 파일 삭제.
- [ ] **Step 3: 문서 갱신 + 최종 확인** — `pytest` 전체 passed, `cd frontend && npm test && npm run build` 성공.
- [ ] **Step 4: Commit, push** — `git commit -m "chore: Render 제거, 문서 갱신"` → `git push`

---

## Self-Review 메모 (작성 시점)

- 스펙 1단계 항목 ↔ 태스크: 좌표 이식(8,10), 전월세 수집기(2,3,4), 변경 단지 JSON(3,6), Supabase 스키마·요약(5,9), 좌표 채우기(8), 프론트 소스 교체(12,13,14), `/map`+필터(15,16), 백필(10), Render 끄기(17), 인천 개편(1,3,10), aptSeq(2,3), 비활성 방지 커밋(11), R2 헤더·변경분만(6,7). 스펙 5.5의 `/my`·PWA·관심단지는 2단계.
- 스펙 5.4의 `GET /apartments/{id}`는 상세 페이지가 R2 파일을 직접 쓰므로 1단계에서 뺐다(앱에서 필요해지면 2단계에서 추가).
- 스펙 4절의 PostGIS는 쓰지 않기로 했다(Task 9). 2만 점 bbox 조회는 일반 인덱스로 충분.
- 기존 배지 중 `dong_rank`(동네 가성비 순위)와 `floor_premium`은 1단계 `metrics`에서 뺐다. 상세 페이지는 그 두 배지를 숨긴다. 필요하면 2단계에서 Supabase 쿼리로 되살린다.
- 이름 일관성: `apartment_summary` 키 = Supabase 컬럼 = `types.ts` 필드. `normalize_lawd`, `pop_changed`, `fetchAptTrade`, `monthlyHistory`, `apartments_in_bbox` 는 각 태스크에서 같은 이름으로 쓴다.
