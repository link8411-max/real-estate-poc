# 공급면적(공급평) 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 단지·전용면적에 공급면적을 구해 저장하고, 기능 플래그를 켜는 순간 사이트 전체의 "평"이 공급평(확신 없으면 "약 ○평")으로 바뀌게 한다.

**Architecture:** 파이프라인에 `pipeline/supply.py`(순수 계산) · `pipeline/supply_fetch.py`(건축물대장 수집) · `pipeline/cheongyak.py`(청약홈 연결)를 더하고, 결과를 `apartment_area_types` 표에 둔다. 내보내기 JSON과 Supabase에 공급 정보를 싣되, 프런트는 `NEXT_PUBLIC_SUPPLY_PYEONG=1`일 때만 공급평을 그린다(그 전엔 지금 화면 그대로). 건축물대장은 별도 GitHub Actions 워크플로가 하루 호출 한도 안에서 거래 많은 단지부터 채운다.

**Tech Stack:** Python 3.11 + SQLite(`pipeline/`, pytest), Next.js App Router + TypeScript(`frontend/`, vitest), Supabase(Postgres), GitHub Actions, R2.

**Spec:** `docs/superpowers/specs/2026-11-05-supply-area-design.md` (실행자는 계획과 함께 반드시 읽는다)

## Global Constraints

- 공급면적 = 전용 + 주거공용. 주거공용 판정은 `etcPurps` 단어로만 한다(`mainPurpsCdNm` 무시).
- 평 = `floor(공급㎡ / 3.3058)` (소수점 버림).
- 우선순위: 청약홈(`cheongyak`) → 건축물대장(`register`) → 추정(`estimate`, 항상 approx).
- 건축물대장 값 approx 조건: `build_year < 1995`, 또는 같은 주택형 표본 최빈값 비중 < 0.6. 공급/전용 비율이 `[1.20, 1.45]` 밖이면 건축물대장 값을 버리고 추정으로.
- 화면에 전용평과 공급평이 섞이면 안 된다. 플래그가 켜졌는데 공급 정보가 없으면 평을 쓰지 말고 ㎡만 쓴다.
- 표기: 평 모드 `33평 · 전용 84㎡` / `약 34평 · 전용 84㎡` / 묶음 범위 `33~34평 · 전용 84㎡`. ㎡ 모드 `84㎡ (33평)` / `84㎡ (약 34평)`.
- 건축물대장 API: `https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo`, `MOLIT_API_KEY`, `numOfRows=100`(최대), `_type=json`, 하루 10,000회(우리 예산 9,500).
- 호갱노노·네이버·KB를 자동 수집하지 않는다. 비밀값(`.env`)을 출력·커밋하지 않는다.
- push·main 합치기·배포·Supabase 운영 스키마 변경·Vercel 환경변수 변경은 사용자에게 먼저 묻는다.
- 테스트 명령: 파이썬 `.venv/bin/python -m pytest tests/<file> -q` (레포 루트), 프런트 `cd frontend && npx vitest run <path>`.

## Review Focus

1. 실거래 전용면적과 대장 전유면적이 소수점에서 어긋남(84.8 vs 84.80, 84.9231 vs 84.92) → ±0.05㎡ 안이면 같은 주택형, 아니면 같은 정수 묶음의 주택형 범위, 그것도 없으면 추정. (Task 5 `test_lookup_tolerance`, Task 7 `findType tolerance`)
2. 대장에 상가·근린생활시설 전유부가 섞인 지번 → 아파트 전유만 센다. (Task 2 `test_ignores_non_residential_units`)
3. API 응답 모양 변형: item 하나면 dict, totalCount가 문자열, 결과 없으면 `items: ""` → 모두 빈 목록/정수로 처리. (Task 3 `test_response_shapes`)
4. 지번이 `산`이거나 비어 있거나 `95-1외`처럼 이상함 → 대장 조회를 건너뛰고 추정으로. (Task 1 `test_register_keys_odd_jibun`)
5. 플래그가 꺼져 있으면 화면 문자열이 지금과 글자 하나 다르지 않다. (Task 7 `flag off keeps legacy labels`)

---

### Task 1: 단지에 법정동코드·본번·부번 저장

**Files:**
- Modify: `pipeline/molit_client.py` (`TradeItem`, `parse_trade_xml`)
- Modify: `pipeline/db.py` (`migrate`, `upsert_apartment`)
- Modify: `pipeline/collect.py:63-75` (`_save`가 새 값을 넘기게)
- Create: `pipeline/register_keys.py`
- Test: `tests/test_molit_client.py`, `tests/test_db.py`, `tests/test_register_keys.py`

**Interfaces:**
- Produces: `TradeItem.umd_cd: str | None`, `TradeItem.bonbun: str | None`, `TradeItem.bubun: str | None`; 컬럼 `apartments.umd_cd/bonbun/bubun TEXT`; `register_keys(conn, apt_id: int) -> RegisterKey | None` where `RegisterKey = NamedTuple(sigungu_cd: str, bjdong_cd: str, bun: str, ji: str)` (bun/ji 4자리 0채움).

- [ ] **Step 1: 실패하는 테스트 작성**
  - `test_parse_trade_keeps_location_codes`: 기존 픽스처 XML에 `<umdCd>10700</umdCd><bonbun>0095</bonbun><bubun>0001</bubun>`이 있으면 `TradeItem.umd_cd == "10700"`, `bonbun == "0095"`, `bubun == "0001"`. 태그가 없으면 셋 다 `None`.
  - `test_upsert_fills_location_codes_once`: 같은 단지를 코드 없이 한 번, 코드와 함께 한 번 upsert → 행에 코드가 채워짐. 이미 있는 코드는 덮어쓰지 않음.
  - `test_register_keys_from_columns`: umd_cd·bonbun·bubun 있으면 `RegisterKey("11710","10100","0019","0000")`.
  - `test_register_keys_dong_fallback`: 단지에 umd_cd가 없고 jibun `"95-1"`이면, 같은 lawd_cd·같은 dong 이름의 다른 단지 umd_cd를 빌려 `RegisterKey(lawd, umd, "0095", "0001")`.
  - `test_register_keys_odd_jibun`: jibun이 `""`, `None`, `"산12"`, `"95-1외"`, `"12-3-4"`면 `None`.
- [ ] **Step 2: 실행해서 실패 확인** — `.venv/bin/python -m pytest tests/test_molit_client.py tests/test_db.py tests/test_register_keys.py -q` → 새 테스트 FAIL.
- [ ] **Step 3: 구현** — `migrate`에 `_add_column` 3개. `upsert_apartment`에 키워드 인자 `umd_cd=None, bonbun=None, bubun=None` 추가, 찾은/새 행에 `COALESCE`로 빈 칸만 채운다. 전월세 응답에는 이 태그가 없으므로(2026-11-05 확인) `RentItem`은 바꾸지 않는다. `register_keys`의 jibun 규칙: `^\d+(-\d+)?$`만 허용.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, 전체 `.venv/bin/python -m pytest -q` PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(pipeline): 단지에 법정동코드·본번·부번 저장(건축물대장 조회 키)"`

---

### Task 2: 공급면적 순수 계산 (`pipeline/supply.py`)

**Files:**
- Create: `pipeline/supply.py`
- Create: `tests/fixtures/register/jamsil_els_p1.json`, `tests/fixtures/register/dogok_lexle_unit.json`, `tests/fixtures/register/eunma_unit.json`
- Test: `tests/test_supply.py`

**Interfaces:**
- Produces:
  - `M2_PER_PYEONG = 3.3058`, `OTHER_COMMON_WORDS: tuple[str, ...]` (스펙 3.2 목록 그대로), `RATIO_RANGE = (1.20, 1.45)`, `OLD_BUILD_YEAR = 1995`, `MIN_AGREEMENT = 0.6`
  - `supply_pyeong(supply_m2: float) -> int`
  - `is_residential_common(etc_purps: str | None) -> bool`
  - `is_apartment_unit(row: dict) -> bool` (전유 행의 `mainPurpsCdNm`/`etcPurps`에 "아파트" 또는 "공동주택"이 있으면 True)
  - `UnitAccumulator` — `add_rows(rows: list[dict]) -> None`, `finished_units() -> dict[tuple[str,str], tuple[float,float]]`(마지막 (동,호)는 다음 페이지에 이어질 수 있어 보류; `close()` 후엔 전부)
  - `TypeEstimate = NamedTuple(excl: float, supply: float, sample_n: int, agreement: float)`
  - `types_from_units(units: dict[...]) -> list[TypeEstimate]` — 전유를 소수 둘째 자리로 반올림해 묶고, 각 묶음의 공급(소수 둘째 자리) 최빈값과 그 비중

- [ ] **Step 1: 픽스처 만들기** — 레포 루트에서 `.env`를 읽어 아래를 한 번 받아 저장한다(키는 파일에 남기지 않는다). 잠실엘스 1페이지: `sigunguCd=11710 bjdongCd=10100 bun=0019 ji=0000 numOfRows=100 pageNo=1`. 도곡렉슬 한 호: `sigunguCd=11680 bjdongCd=11800 bun=0527 ji=0000 dongNm=212동 hoNm=602`. 은마 한 호: `sigunguCd=11680 bjdongCd=10600 bun=0316 ji=0000 dongNm=26 hoNm=808호`. 응답 JSON의 `response.body.items.item` 배열만 저장.
- [ ] **Step 2: 실패하는 테스트 작성**
  - `test_supply_pyeong_floors`: `supply_pyeong(111.52) == 33`, `supply_pyeong(109.29) == 33`, `supply_pyeong(84.75) == 25`, `supply_pyeong(149.88) == 45`.
  - `test_residential_words`: `"계단실,승강기"`·`"벽체"`·`"기타"`·`""`·`None` → True; `"지하주차장"`·`"기계실,전기실"`·`"주차장"`·`"관리사무소,방재실,MDF실"`·`"지하주차장연결통로"` → False.
  - `test_jamsil_els_types`: 픽스처로 `types_from_units` → excl 84.8의 supply 111.52, 59.96 → 84.75, 84.88 → 109.29, 119.93 → 149.88.
  - `test_dogok_parking_marked_apartment_excluded`: 도곡렉슬 한 호 → supply 109.37(= 84.9231 + 24.4517, 소수 둘째 자리 반올림 기준으로 계산값 비교 `abs(x-109.37)<0.01`).
  - `test_eunma_blank_and_gita_included`: 은마 한 호 → 112.35.
  - `test_page_boundary_unit_held`: 한 (동,호)의 행을 두 번의 `add_rows`로 나눠 넣어도 결과 공급이 같다; 첫 `add_rows` 직후 `finished_units()`에 그 호가 없다.
  - `test_ignores_non_residential_units`: 전유 행 `mainPurpsCdNm="제2종근린생활시설"`, `etcPurps="소매점"`인 호는 결과에 없다.
- [ ] **Step 3: 실행해서 실패 확인** — `.venv/bin/python -m pytest tests/test_supply.py -q` FAIL.
- [ ] **Step 4: 구현** — 위 시그니처대로. 공용 행은 `is_residential_common(etcPurps)`일 때만 더한다.
- [ ] **Step 5: 통과 확인** — PASS.
- [ ] **Step 6: 커밋** — `git commit -m "feat(pipeline): 건축물대장 행으로 주택형별 공급면적 계산"`

---

### Task 3: 건축물대장 수집기 (`pipeline/supply_fetch.py`)

**Files:**
- Create: `pipeline/supply_fetch.py`
- Modify: `pipeline/db.py` (`_BASE_SCHEMA`에 `register_fetch`, `register_types` 표)
- Test: `tests/test_supply_fetch.py`

**Interfaces:**
- Consumes: `register_keys` (Task 1), `UnitAccumulator`, `types_from_units` (Task 2)
- Produces:
  - 표 `register_fetch(apt_id INTEGER PRIMARY KEY, status TEXT NOT NULL, pages INT, fetched_at TEXT)` — status ∈ `done | no_key | empty | partial | error`
  - 표 `register_types(apt_id INT, excl_area REAL, supply_area REAL, sample_n INT, agreement REAL, PRIMARY KEY(apt_id, excl_area))`
  - `wanted_areas(conn, apt_id) -> set[float]` — 그 단지 매매·전월세 전용면적(소수 둘째 자리) 집합
  - `fetch_apartment(conn, apt_id, session, *, max_pages: int = 30) -> int` — 쓴 호출 수를 돌려준다. 원하는 면적이 모두 ±0.05로 잡히거나 마지막 페이지면 멈춘다. 30페이지에서 덜 잡히면 `partial`.
  - `fetch_queue(conn) -> list[int]` — `register_fetch`에 없는(또는 `error`인) 단지, 최근 3년 매매 수 내림차순, 같으면 id 오름차순
  - CLI: `python -m pipeline.supply_fetch --db real_estate.db --budget 9500 --changed-out changed_apts.json`

- [ ] **Step 1: 실패하는 테스트 작성** (가짜 session: 페이지 번호 → 응답 JSON을 돌려주는 객체)
  - `test_response_shapes`: item이 dict 하나 / `items: ""` / `totalCount: "250"` 문자열 → 각각 행 1개 / 0개 / 정수 250으로 처리.
  - `test_stops_when_all_wanted_found`: 원하는 면적 {84.8, 59.96}이 1페이지에서 다 나오면 호출 1회, status `done`.
  - `test_partial_after_max_pages`: 원하는 면적 하나가 끝까지 안 나오고 `max_pages=3`이면 호출 3회, status `partial`, 찾은 주택형은 저장됨.
  - `test_no_key_skips_call`: `register_keys`가 None이면 호출 0회, status `no_key`.
  - `test_budget_respected`: 예산 5, 단지 3곳(각 2페이지) → 총 호출 ≤ 5, 마지막 단지는 처리되지 않음(다음 실행 때 다시 큐에).
  - `test_queue_order`: 최근 3년 매매 수가 많은 단지가 먼저.
  - `test_error_is_retried`: HTTP 오류 단지는 `error`로 남고 다음 `fetch_queue`에 다시 나온다.
- [ ] **Step 2: 실패 확인** — `.venv/bin/python -m pytest tests/test_supply_fetch.py -q` FAIL.
- [ ] **Step 3: 구현** — 요청 파라미터 `sigunguCd, bjdongCd, platGbCd=0, bun, ji, numOfRows=100, pageNo, _type=json`. 호출 사이 0.1초. 재시도는 `molit_client._backoff` 재사용. CLI는 처리한 단지 id를 `--changed-out`에 기존 `collect`와 같은 형식으로 쓴다(내보내기 단계가 읽는다).
- [ ] **Step 4: 통과 확인** — PASS, 전체 테스트 PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(pipeline): 건축물대장 수집기(호출 예산·거래 많은 단지 우선·표본 다 잡히면 멈춤)"`

---

### Task 4: 청약홈 연결 (`pipeline/cheongyak.py`)

**Files:**
- Create: `pipeline/cheongyak.py`
- Create: `tests/fixtures/cheongyak/notices.csv`, `tests/fixtures/cheongyak/types.csv` (실제 파일에서 포레온·잠실르엘·메이플자이 3건과 엉뚱한 1건만 cp949로 잘라 둔다)
- Test: `tests/test_cheongyak.py`

**Interfaces:**
- Consumes: 원본 `pipeline/data/cheongyak/apt_notices_20251128.csv`, `apt_house_types_20251128.csv` (cp949)
- Produces:
  - `load_notices(data_dir: str) -> list[Notice]` — `Notice = NamedTuple(house_no: str, name: str, address: str, notice_date: str, types: list[tuple[float, float]])` (전용, 공급). 주택형 `"084.9500D"` → 84.95. 같은 디렉터리에 날짜가 다른 판이 여럿이면 최신 판만.
  - `match_notices(conn, notices) -> dict[int, list[tuple[float, float]]]` — apt_id → 주택형 목록

- [ ] **Step 1: 실패하는 테스트 작성**
  - `test_parse_house_type`: `"084.9500D"` → 84.95, `"059.1662A"` → 59.17(둘째 자리 반올림), `"055.0000O"` → 55.0.
  - `test_match_by_area_overlap`: 강동구(11710이 아닌 `11740`) 단지 "올림픽파크포레온"의 거래 전용면적에 59.99, 84.98, 39.95가 있으면 포레온 공고와 연결된다.
  - `test_no_match_when_ambiguous`: 같은 시군구에 전용면적 집합이 똑같이 겹치는 단지가 둘이면 어느 쪽도 연결하지 않는다.
  - `test_no_match_other_district`: 주소의 시군구가 다르면 연결하지 않는다.
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현** — 주소 앞 두 토큰(시도·시군구, 예 "서울특별시 강동구", "경기도 성남시 분당구"는 세 토큰)으로 `pipeline.regions.REGIONS`의 이름과 맞춰 lawd_cd 후보를 얻는다. 후보 단지 중 `|공고 전용 ∩ 단지 전용(±0.05)| ≥ min(2, 공고 주택형 수)`이고 겹친 수가 단독 최대인 단지 하나에만 연결한다. 이름 유사도는 동점 깨기에만 쓴다.
- [ ] **Step 4: 통과 확인** — PASS. 추가로 실제 파일·실제 DB 복사본으로 `python -m pipeline.cheongyak --db <복사본> --report`를 돌려 연결 건수와 표본 10건을 출력하고, 포레온·잠실르엘·메이플자이가 맞게 붙었는지 눈으로 확인해 커밋 메시지에 건수를 적는다.
- [ ] **Step 5: 커밋** — `git commit -m "feat(pipeline): 청약홈 주택형 분양정보를 단지에 연결"`

---

### Task 5: 세 겹 합치기 (`apartment_area_types`)

**Files:**
- Modify: `pipeline/supply.py` (resolve 함수들)
- Modify: `pipeline/db.py` (`apartment_area_types` 표)
- Test: `tests/test_supply_resolve.py`

**Interfaces:**
- Consumes: `register_types` 표(Task 3), `match_notices`(Task 4), `apartments.build_year`
- Produces:
  - 표 `apartment_area_types(apt_id INT, excl_area REAL, supply_area REAL, source TEXT, approx INT, sample_n INT, updated_at TEXT, PRIMARY KEY(apt_id, excl_area))` — source ∈ `cheongyak | register | estimate`
  - `resolve_all(conn, cheongyak: dict[int, list[tuple[float,float]]]) -> list[int]` — 값이 바뀐 apt_id 목록(내보내기 대상), 그 단지들에 `mark_changed`
  - `estimate_ratio(conn, apt_id, excl) -> float`
  - `lookup(types: list[dict], area: float) -> dict | None` — 내보내기와 프런트가 같은 규칙을 쓴다: ±0.05 안 최근접, 없으면 None
  - CLI: `python -m pipeline.supply resolve --db real_estate.db --cheongyak-dir pipeline/data/cheongyak --changed-out changed_apts.json` — `load_notices`→`match_notices`→`resolve_all`, 바뀐 단지 id를 `collect`와 같은 형식으로 쓴다

- [ ] **Step 1: 실패하는 테스트 작성**
  - `test_cheongyak_wins`: 같은 전용에 청약홈 111.79·대장 111.52 → 111.79, source `cheongyak`, approx 0.
  - `test_register_old_build_is_approx`: build_year 1979 → source `register`, approx 1.
  - `test_register_low_agreement_is_approx`: agreement 0.5 → approx 1.
  - `test_register_out_of_range_falls_to_estimate`: 84.43 → 161.0(비율 1.91) → source `estimate`, approx 1.
  - `test_estimate_prefers_same_apartment`: 같은 단지 다른 주택형이 확실한 값(비율 1.32)을 가지면 빠진 주택형은 그 비율로.
  - `test_estimate_falls_back_to_peers`: 같은 단지에 없으면 같은 lawd_cd·준공 ±5년·같은 면적대(60 미만 / 60~85 / 85 초과) 확실한 값들의 비율 중앙값; 그것도 없으면 같은 시도, 그것도 없으면 전체 면적대 중앙값.
  - `test_every_traded_area_gets_a_type`: 매매·전월세에 나온 모든 전용면적(소수 둘째 자리)이 표에 있다.
  - `test_lookup_tolerance`: 표에 84.8이 있으면 `lookup(types, 84.84)`는 그 행, `lookup(types, 84.9)`는 None.
  - `test_aliases_follow_canonical`: `apartment_aliases`로 합쳐진 옛 단지 id는 표에 없다(남은 단지에만).
  - `test_changed_only_when_value_changes`: 같은 입력으로 두 번 돌리면 두 번째 반환은 빈 목록.
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현** — 상수는 Task 2의 것을 쓴다. 비교는 공급(소수 둘째 자리)·source·approx 셋이 같으면 "안 바뀜".
- [ ] **Step 4: 통과 확인** — PASS, 전체 PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(pipeline): 청약홈→건축물대장→추정 세 겹으로 단지 주택형 공급면적 확정"`

---

### Task 6: 내보내기·Supabase에 공급 정보 싣기

**Files:**
- Modify: `pipeline/export_json.py` (`_apartment_block`, `_slim_all`)
- Modify: `pipeline/highs.py`, `pipeline/canceled.py` (항목에 `supply`)
- Modify: `pipeline/summary.py` / `pipeline/supabase_sync.py` (Supabase 행에 최신 거래 공급평)
- Create: `supabase/migrations/0002_supply_pyeong.sql`
- Test: `tests/test_export_json.py`, `tests/test_highs.py`, `tests/test_canceled.py`, `tests/test_supabase_sync.py`

**Interfaces:**
- Consumes: `apartment_area_types`, `lookup`, `supply_pyeong`
- Produces (JSON 키 — 프런트 Task 7~9가 쓴다):
  - 단지 블록 `apartment.area_types: [{"excl": 84.8, "supply": 111.52, "approx": false}]` (excl 오름차순, 없으면 `[]`)
  - 신고가·취소 항목 `supply: {"min": 33, "max": 33, "approx": false} | null` — 그 거래 전용면적에 `lookup`이 맞으면 min=max, 아니면 같은 정수 묶음의 주택형 범위, 그것도 없으면 null
  - 지역 목록 항목·Supabase `apartments` 행: `latest_supply_min int`, `latest_supply_max int`, `latest_supply_approx boolean` (최신 거래 기준, 같은 규칙)
  - `0002_supply_pyeong.sql`: 위 세 열 `add column if not exists`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `test_apartment_block_has_area_types`: 표에 두 행 → 블록에 excl 오름차순 두 항목, approx는 bool.
  - `test_apartment_block_empty_area_types`: 표에 없으면 `[]`(키는 항상 있음).
  - `test_highs_entry_supply_range`: 거래 84.5, 표에 84.8(111.52)·84.88(112.9) → lookup 실패 → 묶음 84 범위 `{"min":33,"max":34,"approx":false}`; 하나라도 approx면 approx true.
  - `test_canceled_entry_supply_null_when_unknown`: 표가 비면 `supply: null`.
  - `test_supabase_row_has_latest_supply`: 환경변수 `SUPABASE_SUPPLY_COLUMNS=1`이고 최신 거래 59.96, 표 84.75 → `latest_supply_min == latest_supply_max == 25`.
  - `test_supabase_row_omits_supply_without_flag`: 환경변수가 없으면 행에 `latest_supply_*` 키가 아예 없다(운영 Supabase에 열이 생기기 전 sync가 깨지지 않게).
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현** — 범위 계산은 `pipeline/supply.py`에 `supply_label(types, area) -> dict | None` 하나로 두고 세 곳이 함께 쓴다. 마이그레이션 SQL은 파일만 만들고 **운영에 적용하지 않는다**(Task 10).
- [ ] **Step 4: 통과 확인** — PASS, 전체 PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(pipeline): 단지·신고가·취소·지역·Supabase 내보내기에 공급평 정보"`

---

### Task 7: 프런트 공급평 표기 함수와 플래그

**Files:**
- Create: `frontend/src/lib/supply.ts`
- Modify: `frontend/src/lib/format.ts` (`formatArea`, `formatExactArea`)
- Modify: `frontend/src/lib/types.ts` (`Apartment.area_types?`, `SupplyLabel`)
- Test: `frontend/src/lib/__tests__/supply.test.ts`, `frontend/src/lib/__tests__/format.test.ts`

**Interfaces:**
- Consumes: JSON 키(Task 6)
- Produces:
  - `type AreaType = { excl: number; supply: number; approx: boolean }`, `type SupplyLabel = { min: number; max: number; approx: boolean }`
  - `SUPPLY_ENABLED: boolean` (= `process.env.NEXT_PUBLIC_SUPPLY_PYEONG === "1"`), 테스트용 `setSupplyEnabledForTest(v: boolean)`
  - `supplyPyeong(m2: number): number` (버림)
  - `findType(types: AreaType[], m2: number): AreaType | null` (±0.05)
  - `exactLabel(types: AreaType[] | undefined, m2: number): SupplyLabel | null` — findType 실패 시 groupLabel로
  - `groupLabel(types: AreaType[] | undefined, group: number): SupplyLabel | null` — 그 정수 묶음 주택형들의 min·max·approx(하나라도 approx면 true)
  - `formatArea(m2, unit, sp?: SupplyLabel | null)`, `formatExactArea(m2, unit, sp?: SupplyLabel | null)` — 시그니처는 뒤에 선택 인자만 추가

- [ ] **Step 1: 실패하는 테스트 작성**
  - `flag off keeps legacy labels`: 플래그 off면 `formatArea(84.88,"pyeong",{min:33,max:33,approx:false}) === "전용 25평 (84㎡)"`, `formatArea(84.88,"m2",…) === "84㎡ (전용 25평)"`, `formatExactArea(80.87,"pyeong",…) === "전용 24.5평"` (지금 값 그대로).
  - `flag on exact`: `formatArea(84.88,"pyeong",{min:33,max:33,approx:false}) === "33평 · 전용 84㎡"`; ㎡ 모드 `"84㎡ (33평)"`.
  - `flag on approx`: `{min:34,max:34,approx:true}` → `"약 34평 · 전용 84㎡"`, ㎡ `"84㎡ (약 34평)"`.
  - `flag on range`: `{min:33,max:34,approx:false}` → `"33~34평 · 전용 84㎡"`.
  - `flag on missing never shows 전용평`: `formatArea(84.88,"pyeong",null) === "84㎡"`, `formatExactArea(80.87,"pyeong",null) === "80.87㎡"`.
  - `supplyPyeong floors`: 111.52→33, 84.75→25.
  - `findType tolerance`: [{excl:84.8,…}]에서 84.84 → 찾음, 84.9 → null.
  - `groupLabel range`: 84.8(111.52)·84.88(112.9, approx) → `{min:33,max:34,approx:true}`.
- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/lib/__tests__/supply.test.ts src/lib/__tests__/format.test.ts` FAIL.
- [ ] **Step 3: 구현** — `formatExactArea`의 플래그 on 표기는 단일 평(`sp.min===sp.max`)이면 `33평 · 전용 80.87㎡`, 범위면 groupLabel과 같은 범위 표기.
- [ ] **Step 4: 통과 확인** — PASS, `npx vitest run` 전체 PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(web): 공급평 표기 함수와 NEXT_PUBLIC_SUPPLY_PYEONG 플래그"`

---

### Task 8: 단지 화면·공유 카드에 연결

**Files:**
- Modify: `frontend/src/components/AreaLabel.tsx` (prop `sp?: SupplyLabel | null`)
- Modify: `frontend/src/app/apartment/[id]/page.tsx`, `frontend/src/components/ApartmentTrades.tsx`, `DealList.tsx`, `AreaStatsTable.tsx`, `RentSection.tsx`, `CanceledDeals.tsx`, `CompareTable.tsx`
- Modify: `frontend/src/lib/canceledShare.ts`, `frontend/src/app/api/og/canceled/[aptId]/[txId]/route.tsx`, `frontend/src/app/canceled/[aptId]/[txId]/page.tsx`
- Test: 해당 컴포넌트의 기존 `__tests__` 파일에 케이스 추가

**Interfaces:**
- Consumes: `exactLabel`, `groupLabel`, `formatArea`, `formatExactArea`, `Apartment.area_types` (Task 7)
- Produces: `ShareTx.supply: SupplyLabel | null` (기존 `pyeong` 필드는 플래그 off일 때만 쓰인다)

- [ ] **Step 1: 실패하는 테스트 작성** (플래그 on으로 렌더)
  - 단지 페이지 평형 표: area_types 있는 단지 → "33평 · 전용 84㎡"가 보이고 "전용 25평"은 없다.
  - 거래 목록 한 줄: 거래 59.96 → "25평 · 전용 59.96㎡".
  - 전월세 표: 같은 규칙.
  - 비교 표: 두 단지 각각 자기 area_types로.
  - 취소 공유 OG 제목: `잠실엘스 33평 31억 3,000만원 신고 후 취소` 꼴(플래그 off면 지금 문자열 그대로).
  - 플래그 off 스냅숏: 기존 테스트가 하나도 깨지지 않는다.
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현** — 각 컴포넌트는 이미 받는 `AptTrade`/`AptRent`의 `apartment.area_types`를 내려 준다. 새 데이터 요청을 늘리지 않는다.
- [ ] **Step 4: 통과 확인** — `npx vitest run` 전체 PASS, `npm run build` 성공.
- [ ] **Step 5: 커밋** — `git commit -m "feat(web): 단지 페이지·비교·취소 공유에 공급평"`

---

### Task 9: 목록·지도에 연결 (신고가·취소 모음, 지도 필터)

**Files:**
- Modify: `frontend/src/components/HighsBoard.tsx`, `HighArea.tsx`, `CanceledBoard.tsx`, `MapMarkers.tsx`, `MapPreviewCard.tsx`
- Modify: `frontend/src/lib/highs.ts`, `frontend/src/lib/canceled.ts`, `frontend/src/lib/types.ts` (항목·지역 항목에 `supply`, `latest_supply_*`)
- Modify: `frontend/src/lib/mapFilters.ts`, `frontend/src/app/api/v1/map/route.ts`
- Test: 해당 `__tests__`, `frontend/src/lib/__tests__/mapFilters.test.ts`

**Interfaces:**
- Consumes: JSON `supply`, Supabase `latest_supply_min/max/approx` (Task 6), `formatArea` (Task 7)
- Produces: 플래그 on일 때의 지도 필터 쿼리 키 `minPy`, `maxPy`(공급평 정수) — API는 `latest_supply_min`에 gte/lte

- [ ] **Step 1: 실패하는 테스트 작성**
  - 신고가 모음 한 줄: `supply {min:33,max:33}` → "33평 · 전용 84㎡"; `supply: null` → "84㎡".
  - 지도 미리보기 카드: `latest_supply_min=25,max=25` → "25평".
  - `SUPPLY_AREA_PRESETS` 라벨(플래그 on): `["~19평","20평대","30평대","40평+"]`, 구간 `{maxPy:19}`, `{minPy:20,maxPy:29}`, `{minPy:30,maxPy:39}`, `{minPy:40}`. 플래그 off면 기존 `AREA_PRESETS`와 `minArea/maxArea` 그대로.
  - `readMapFilters`/`toApiQuery`가 `minPy/maxPy`를 읽고 보낸다.
  - API 라우트: `minPy=30&maxPy=39` → Supabase 쿼리에 `latest_supply_min gte 30, lte 39`; select 목록에 세 열 추가.
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현** — 라우트는 플래그 off에서도 새 열을 select에 넣지 않는다(운영 Supabase에 열이 아직 없으므로). 플래그 on에서만 넣는다.
- [ ] **Step 4: 통과 확인** — `npx vitest run` PASS, `npm run build` 성공.
- [ ] **Step 5: 커밋** — `git commit -m "feat(web): 신고가·취소 모음과 지도(필터 포함)에 공급평"`

---

### Task 10: 수집 워크플로와 전환 기준 확인 도구

**Files:**
- Create: `.github/workflows/supply-fetch.yml`
- Modify: `pipeline/supply_fetch.py` (하위 명령 `coverage`)
- Test: `tests/test_supply_fetch.py` (`coverage` 계산)

**Interfaces:**
- Consumes: Task 3·4·5·6 CLI
- Produces: `python -m pipeline.supply_fetch coverage --db real_estate.db` → JSON `{"top_n": int, "done": int, "ratio": float, "ready": bool}` — 최근 3년 매매 누적 80%를 덮는 상위 단지 수(top_n)와 그중 `register_fetch.status in (done, partial, no_key, empty)`이거나 청약홈으로 채워진 단지 수. `ready = done >= top_n`.

- [ ] **Step 1: 실패하는 테스트 작성** — `test_coverage_top80`: 매매 수 [50,30,10,5,5] 단지 → top_n 3(누적 90%≥80%가 처음 넘는 지점), 그중 2곳 done → ratio 0.667, ready false.
- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인** — `.venv/bin/python -m pytest tests/test_supply_fetch.py -q` PASS.
- [ ] **Step 3: 워크플로 작성** — `collect-daily.yml`를 본떠 `concurrency: group: collect`(같은 DB를 다루므로 겹치지 않게), cron `0 16 * * *`(KST 01:00, 다른 수집과 안 겹침), `timeout-minutes: 60`. 단계: R2에서 DB 받기 → `python -m pipeline.supply_fetch --db real_estate.db --budget 9500 --changed-out fetched.json` → `python -m pipeline.supply resolve --db real_estate.db --cheongyak-dir pipeline/data/cheongyak --changed-out changed_apts.json` → export → R2 publish → Supabase sync → DB 업로드 → `coverage` 결과를 로그에 출력. 워크플로에는 `SUPABASE_SUPPLY_COLUMNS`를 넣지 않는다(Task 12에서 사용자 승인 후 켠다).
- [ ] **Step 4: 로컬 리허설** — 실제 DB 복사본으로 `--budget 50` 실행 → 호출 ≤ 50, 상위 단지 몇 곳 `done`, `apartment_area_types`에 행이 생김. 출력 일부를 커밋 메시지에 남긴다.
- [ ] **Step 5: 커밋** — `git commit -m "feat(ci): 건축물대장 공급면적 수집 워크플로와 전환 기준(coverage)"`. **워크플로를 main에 올리기 전 사용자에게 묻는다**(매일 수집 켜고 끄기 규칙).

---

### Task 11: 30곳 대조 검증과 규칙 조정

**Files:**
- Modify: `docs/superpowers/specs/2026-11-05-supply-area-design.md` (6장 표에 결과 추가)
- Modify: `pipeline/supply.py` 상수(필요할 때만) + 해당 테스트

- [ ] **Step 1: 표본 고르기** — 수집이 어느 정도 진행된 DB 복사본에서 준공 1980·1990·2000·2010·2020년대별로 거래 많은 단지 6곳씩(총 30), 각 단지의 대표 주택형 1~2개.
- [ ] **Step 2: 대조** — 로그인된 브라우저로 호갱노노 단지 페이지를 한 곳씩 열어 "타입/동 정보"와 매물의 `공급 / 전용m²` 표기를 읽는다. 자동 대량 수집·API 호출 금지. 결과를 표(단지·준공·전용·우리 값·source·approx·호갱노노·일치)로 기록.
- [ ] **Step 3: 판정** — "약" 없는 값 평 단위 일치율 ≥ 95%, "약" 값 대부분 ±1평. 미달이면 단어 목록·`OLD_BUILD_YEAR`·`RATIO_RANGE`를 고치고(테스트 갱신) resolve를 다시 돌려 재대조. 그래도 미달인 연대는 그 연대 전체를 approx로 내리는 규칙을 `supply.py`에 넣는다(테스트 추가). 배포를 미루지 않는다.
- [ ] **Step 4: 커밋** — `git commit -m "docs: 공급평 30곳 대조 결과와 규칙 조정"`

---

### Task 12: 전환 (사용자 승인 필요)

- [ ] **Step 1: 기준 확인** — `coverage`의 `ready: true` 확인. 아니면 기다린다.
- [ ] **Step 2: 사용자에게 묻기** — 아래 셋을 한 번에 묻고 승인받는다: (a) 운영 Supabase에 `0002_supply_pyeong.sql` 적용, (b) 워크플로에 `SUPABASE_SUPPLY_COLUMNS=1` 설정 후 전체 sync 1회, (c) Vercel Production에 `NEXT_PUBLIC_SUPPLY_PYEONG=1` 설정·재배포.
- [ ] **Step 3: 화면 확인** — 배포 후 모바일 375px 포함: 단지 페이지(신축·구축·"약" 단지 각 1곳), 지도(필터 4구간), `/highs`, `/canceled`, 취소 공유 OG 이미지. 어디에도 "전용 ○평"이 남지 않았는지 확인.
- [ ] **Step 4: 기록** — `docs/handoff/`에 전환 일시·coverage 수치·확인 결과를 남긴다.
