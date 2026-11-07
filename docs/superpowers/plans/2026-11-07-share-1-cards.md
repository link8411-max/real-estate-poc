# 공유 ① 평형 구분 통일 · 공유 판정 · 신고가 공유 카드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 같은 평형대를 사이트 전체에서 한 묶음으로 보고, 파이프라인이 거래마다 공유 배지(신고가/상승)·공유 가능 여부를 계산해 내보내며, 단지 페이지와 `/highs` 에서 신고가·상승 거래를 카드 이미지와 공유 페이지로 공유할 수 있게 한다.

**Architecture:** 평형 묶음 함수 하나를 Python(`pipeline/area_class.py`)과 TS(`frontend/src/lib/areaClass.ts`)에 같은 규칙으로 두고 공용 픽스처로 맞춘다. 파이프라인이 단지 trade.json 의 거래마다 `grp`(평형 묶음)·`direct`(직거래)·`share`(배지·비교값·공유 가능)를 실어 보내고, 프런트는 이 값을 그대로 쓴다(다시 계산하지 않음). 공유 페이지·OG 카드는 기존 취소 공유(`/canceled/[aptId]/[txId]`)와 같은 구조다.

**Tech Stack:** Python 3.12 + sqlite3 + pytest, Next.js 16 App Router + `next/og` ImageResponse + vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-share-content-design.md` (4·5장, 8장 공개 게이트). 주간 리포트(6·8장)는 계획 ②, 세로 영상(7장)은 계획 ③.

## Global Constraints

- 평형 표기: 공급평 플래그 on 일 때 "33평 · 전용 84㎡", 공급 정보 없으면 "84㎡"만(전용평 금지) — 기존 `formatArea`·`shareArea` 규칙 유지.
- 배지 문구·색: 빨강 "신고가", 주황 "상승", 회색 "직거래". "축하" 단어 금지(코드·문구·메타 어디에도).
- 공유 카드 하단 띠 문구: `국토교통부 실거래가 · 계약 YYYY.MM.DD · 신고 기준 · zipsise.com`.
- 공유 대상 창: 계약일이 오늘(KST) 기준 최근 30일 안(`deal_date >= today - 30일`), 취소 아닌 매매.
- 공개 게이트: `NEXT_PUBLIC_SHARE_HIGHS === "1"` 일 때만 신고가 공유 버튼이 보인다. 공유 페이지는 플래그와 상관없이 열리되 `robots: { index: false }`.
- 전용면적 정수 버림(`CAST(area AS INTEGER)`, `Math.floor`)으로 평형을 묶는 곳은 모두 `area_class`/`areaClassMap` 으로 바꾼다. 화면 표시용 단건 면적(지도 마커·OG 단지 카드·seo 요약)은 버림 그대로 둔다.
- 테스트: `.venv/bin/pytest -q`, `cd frontend && npm test && npx tsc --noEmit && npm run lint`.

## Review Focus

1. 같은 계약일에 같은 평형 거래가 여러 건 → 서로 비교하지 않는다(현행 유지). 첫날 거래끼리 신고가가 되지 않아야 한다. → Task 3 `test_same_day_not_compared`.
2. 공유한 거래가 나중에 취소됨 → 공유 페이지·OG 카드가 "신고 후 취소"로 바뀌고 배지·상승액을 숨긴다. → Task 5 `canceled after share` 테스트.
3. 30일이 지난 거래의 옛 공유 링크 → 페이지는 열리고(거래 정보·단지 링크) 공유 버튼만 없다. → Task 5 `expired link` 테스트.
4. 합쳐진 단지의 공유 링크 → `/highs/<moved_to>/<txId>` 로 영구 이동. → Task 5 `moved apartment` 테스트.
5. 공급 정보 없는 단지·직거래 거래 → 카드에 "84㎡"만, 가격 옆 "직거래". → Task 5 OG 테스트.

---

### Task 1: 평형 묶음 함수 (Python + TS, 공용 픽스처)

**Files:**
- Create: `pipeline/area_class.py`, `frontend/src/lib/areaClass.ts`
- Create: `tests/fixtures/area_class_cases.json`
- Test: `tests/test_area_class.py`, `frontend/src/lib/__tests__/areaClass.test.ts`

**Interfaces:**
- Produces: `area_class_map(areas: Iterable[tuple[float, int]]) -> dict[float, int]` — 입력은 한 단지의 (전용면적, 거래 수) 목록, 출력은 면적 → 묶음 번호(정수 ㎡ 라벨).
- Produces: `areaClassMap(areas: Array<[number, number]>): Map<number, number>` — 같은 규칙.

규칙 (스펙 4장 "같은 평형대는 하나"):
1. 서로 다른 면적을 오름차순 정렬.
2. 앞 면적과의 차이 `< 1.0`㎡ 이고 묶음 첫 면적과의 차이 `< 2.0`㎡ 이면 같은 묶음, 아니면 새 묶음.
3. 묶음 라벨 = 묶음 안에서 거래 수가 가장 많은 면적의 버림 정수(동률이면 작은 면적).

- [ ] **Step 1: 픽스처 작성** — `tests/fixtures/area_class_cases.json` 에 `[{ "areas": [[면적, 건수], ...], "expect": {"면적": 라벨} }]` 형식으로 최소 아래 경우:
  - `[[84.97,10],[85.01,3]]` → 둘 다 84
  - `[[83.69,2],[84.06,9]]` → 둘 다 84
  - `[[59.88,5],[60.0,1]]` → 둘 다 59
  - `[[84.12,4],[84.97,4]]` → 둘 다 84 (동률 → 작은 면적)
  - `[[59.9,3],[84.9,3]]` → 59, 84 (떨어진 묶음)
  - `[[59.0,1],[59.9,1],[60.8,1],[61.7,1]]` → 59.0·59.9·60.8 은 59, 61.7 은 61 (첫 면적과 2.0 이상 차이에서 끊김)
  - `[]` → `{}`
- [ ] **Step 2: 실패하는 테스트** — pytest `test_cases_match_fixture` 와 vitest `matches shared fixture` 가 픽스처 전부를 돌며 결과를 비교(키는 면적 문자열 `str(float)` / `String(n)`).
- [ ] **Step 3: 실행해 실패 확인** — `.venv/bin/pytest tests/test_area_class.py -q` → ImportError; `cd frontend && npx vitest run src/lib/__tests__/areaClass.test.ts` → 모듈 없음.
- [ ] **Step 4: 두 함수 구현.**
- [ ] **Step 5: 두 테스트 통과 확인.**
- [ ] **Step 6: 커밋** — `feat(area): 같은 평형대를 한 묶음으로 보는 area_class (py·ts 공용 픽스처)`

### Task 2: 파이프라인 평형 묶음 교체 + trade.json 에 grp·direct

**Files:**
- Modify: `pipeline/summary.py` (`trade_area_stats`, `rent_area_stats`), `pipeline/highs.py`, `pipeline/canceled.py`, `pipeline/export_json.py` (`_slim_all`, `build_apt_trade`, rent 내보내기), `pipeline/supabase_sync.py:129` 근처
- Test: `tests/test_summary.py`, `tests/test_highs.py`, `tests/test_canceled.py`, `tests/test_export_json.py`, `tests/test_supabase_sync.py`

**Interfaces:**
- Consumes: `area_class_map` (Task 1).
- Produces: `apt_area_classes(conn, apt_id: int, table: Literal["transactions","rents"]) -> dict[float, int]` in `pipeline/area_class.py` — 그 단지 해당 표의 (area, COUNT(*)) 로 `area_class_map` 호출. 매매는 취소 포함 전체 거래 기준(묶음이 취소 여부로 흔들리지 않게).
- Produces: trade.json `transactions[]` 각 항목에 `grp: int`, `direct: bool`(`dealing_gbn == '직거래'`) 추가. rent.json `rents[]` 각 항목에 `grp: int` 추가. `area_stats[].area` 는 묶음 라벨.

- [ ] **Step 1: 실패하는 테스트** — 각 테스트 파일에 84.97㎡·85.01㎡ 거래를 가진 단지를 만들고:
  - `test_summary.py::test_area_stats_merge_boundary` — `trade_area_stats` 결과 묶음이 하나(`area == 84`), 건수 합산.
  - `test_highs.py::test_boundary_areas_same_group` — 85.01㎡ 이전 거래 9억, 84.97㎡ 새 거래 10억 → 신고가 1건, `area_group == 84`, `prev_max == 90000`.
  - `test_canceled.py::test_boundary_areas_same_group` — 같은 방식으로 취소 신고가의 비교 기준이 묶음 전체.
  - `test_export_json.py::test_trade_json_has_grp_and_direct` — 두 거래 모두 `grp == 84`, `dealing_gbn='직거래'` 인 거래는 `direct is True`, 나머지 `False`.
  - `test_supabase_sync.py` — 대표 평형 최신 거래 조회가 묶음 기준(기존 테스트를 묶음 경계 데이터로 하나 추가).
- [ ] **Step 2: 실행해 실패 확인** — `.venv/bin/pytest -q tests/test_summary.py tests/test_highs.py tests/test_canceled.py tests/test_export_json.py tests/test_supabase_sync.py`.
- [ ] **Step 3: 구현** — SQL 의 `CAST(area AS INTEGER)` 를 단지별 `apt_area_classes` 조회로 바꾼다. `_slim_all` 처럼 전 단지를 한 번에 훑는 곳은 먼저 `SELECT apt_id, area, COUNT(*) FROM transactions GROUP BY apt_id, area` 로 단지별 지도를 한 번에 만든다(행마다 조회 금지 — `record_highs` docstring 의 성능 주의 참고). `canceled.py:77,85` 의 하위 쿼리는 묶음에 속한 면적 목록 `area IN (...)` 으로 바꾼다.
- [ ] **Step 4: 전체 pytest 통과 확인** — `.venv/bin/pytest -q`.
- [ ] **Step 5: 커밋** — `feat(pipeline): 평형 묶음을 area_class 로 통일, trade.json 에 grp·direct`

### Task 3: 거래별 공유 판정 (`pipeline/share.py`)

**Files:**
- Create: `pipeline/share.py`
- Modify: `pipeline/export_json.py` (`build_apt_trade`), `pipeline/highs.py` (`record_highs` 항목에 공유 값 추가)
- Test: `tests/test_share.py`, `tests/test_highs.py`, `tests/test_export_json.py`

**Interfaces:**
- Consumes: `apt_area_classes` (Task 2).
- Produces: `share_info(rows: list[ShareRow], classes: dict[float, int], today: date) -> dict[int, ShareInfo]`
  - `ShareRow = TypedDict(id: int, area: float, floor: int | None, amount: int, deal_date: str, cancel_date: str | None, dealing_gbn: str | None)`
  - `ShareInfo = TypedDict(badge: Literal["high","up"], base: int, diff: int, pct: float, shareable: bool, held: bool)`
  - 반환에는 배지가 붙는 거래만 들어간다.
- Produces: `apt_share_info(conn, apt_id: int, today: date) -> dict[int, ShareInfo]` (조회 + `share_info`).
- Produces: trade.json `transactions[]` 항목에 `share?: ShareInfo`(배지 있을 때만). `highs/recent.json` 항목에 `direct: bool`, `shareable: bool`, `held: bool` 추가.

판정 (스펙 4장, 같은 묶음·취소 아닌 매매끼리):
- 대상: `deal_date >= today - 30일`, `cancel_date IS NULL`.
- `high`: 계약일이 엄격히 앞선 거래가 1건 이상이고 금액 > 그 최고가. `base` = 그 최고가.
- `up`: high 가 아니고, 계약일이 엄격히 앞선 거래 중 가장 최근 계약일의 거래(그날 여러 건이면 id 가 가장 큰 것)보다 금액이 큼. `base` = 그 거래 금액.
- `diff = amount - base`, `pct = round(diff / base * 100, 1)`.
- `held`: 같은 묶음·같은 층·같은 계약일에 금액이 다른 정상 거래가 있음(정정 의심).
- `shareable = not held and (badge == "up" or amount >= 묶음 전체 정상 거래 최고가)` — 신고가는 지금도 최고가일 때만.

- [ ] **Step 1: 실패하는 테스트** (`tests/test_share.py`, `today=date(2026,11,7)`):
  - `test_high_badge` — 이전 9억·8억, 새 10억(11-01) → `badge=="high"`, `base==90000`, `diff==10000`, `pct==11.1`, `shareable`.
  - `test_up_badge` — 이전 최고 12억(2026-03), 직전 9억(10-20), 새 9.5억(11-01) → `badge=="up"`, `base==90000`.
  - `test_high_and_up_is_high` — 신고가이면서 직전보다 비쌈 → `"high"` 하나만.
  - `test_same_day_not_compared` — 첫 계약일에 8억·9억 두 건만 있음 → 둘 다 배지 없음.
  - `test_outside_30_days` — 계약 2026-10-07 이전 → 결과에 없음.
  - `test_canceled_excluded` — 취소된 11억이 이전에 있어도 비교에서 빠짐, 취소 거래 자신은 결과에 없음.
  - `test_not_current_max_not_shareable` — 11-01 신고가 10억, 11-03 11억 → 10억은 `badge=="high"`, `shareable is False`.
  - `test_correction_held` — 같은 층·계약일 10억·10.5억 → 둘 다 `held is True`, `shareable is False`.
  - `test_direct_still_badged` — 직거래도 배지·shareable 동일(표시는 프런트).
  - `test_export_json.py::test_trade_json_share_field` — 배지 거래에만 `share` 키.
  - `test_highs.py::test_recent_items_have_share_flags` — `direct`, `shareable`, `held` 키 존재.
- [ ] **Step 2: 실행해 실패 확인** — `.venv/bin/pytest tests/test_share.py -q`.
- [ ] **Step 3: 구현** — 묶음별로 계약일 정렬 + 누적 최고가 + bisect(`record_highs` 와 같은 방식). `record_highs` 는 `share_info` 결과를 재사용해 공유 값을 붙인다(판정 로직 중복 금지).
- [ ] **Step 4: 전체 pytest 통과 확인.**
- [ ] **Step 5: 커밋** — `feat(share): 거래별 신고가·상승 배지와 공유 가능 판정`

### Task 4: 프런트 평형 묶음·타입 교체

**Files:**
- Modify: `frontend/src/lib/types.ts` (`Transaction`, `Rent`, `RecordHigh`), `frontend/src/components/DealList.tsx`, `frontend/src/components/RentSection.tsx`, `frontend/src/lib/canceled.ts`, `frontend/src/lib/metrics.ts`, `frontend/src/lib/history.ts`, `frontend/src/lib/canceledShare.ts`, `frontend/src/components/CanceledDeals.tsx`
- Test: 기존 `DealList.test.tsx`, `RentSection.test.tsx`, `lib/__tests__` 의 canceled·metrics·history 테스트

**Interfaces:**
- Consumes: trade.json `grp`·`direct`·`share` (Task 2·3), `areaClassMap` (Task 1).
- Produces: `Transaction` 에 `grp?: number; direct?: boolean; share?: ShareInfo`, `Rent` 에 `grp?: number`, `RecordHigh` 에 `direct?: boolean; shareable?: boolean; held?: boolean`, 타입 `ShareInfo { badge: "high" | "up"; base: number; diff: number; pct: number; shareable: boolean; held: boolean }`.
- Produces: `txGroup(t: { area: number; grp?: number }): number` in `frontend/src/lib/format.ts` — `t.grp ?? areaGroup(t.area)`(옛 JSON 호환).

- [ ] **Step 1: 실패하는 테스트** — `DealList.test.tsx::merges boundary areas` (84.97·85.01 거래, `grp: 84` 둘 다 → 84 필터에 2건), `RentSection.test.tsx` 같은 방식, `metrics`·`canceled` 테스트에 `grp` 로 묶이는 경우 1개씩. DealList 에서 `direct: true` 거래 행에 "직거래" 텍스트.
- [ ] **Step 2: 실행해 실패 확인** — `cd frontend && npm test`.
- [ ] **Step 3: 구현** — 위 파일의 `areaGroup(t.area)`/`areaGroup(r.area)` 묶음 비교를 `txGroup(...)` 로 교체. "직거래" 표시는 DealList·HighsBoard 행의 가격 옆 회색 작은 글씨(플래그와 무관하게 보임).
- [ ] **Step 4: `npm test && npx tsc --noEmit && npm run lint` 통과.**
- [ ] **Step 5: 커밋** — `feat(front): 평형 묶음을 파이프라인 grp 로, 직거래 표시`

### Task 5: 신고가 공유 페이지와 OG 카드

**Files:**
- Create: `frontend/src/lib/highShare.ts`, `frontend/src/app/highs/[aptId]/[txId]/page.tsx`, `frontend/src/app/api/og/highs/[aptId]/[txId]/route.tsx`
- Test: `frontend/src/lib/__tests__/highShare.test.ts`, `frontend/src/app/api/og/highs/[aptId]/[txId]/__tests__/route.test.tsx`, `frontend/src/app/highs/[aptId]/[txId]/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `Transaction.share/direct/grp` (Task 4), `fetchAptTrade`, `isMoved`, `parseId`(`canceledShare.ts`), `ogFont`.
- Produces: `SHARE_HIGHS_ENABLED: boolean`(`process.env.NEXT_PUBLIC_SHARE_HIGHS === "1"`) + `setShareHighsEnabledForTest(v: boolean)` in `highShare.ts` (`supply.ts` 패턴).
- Produces: `highShareTx(data: AptTrade, txId: number, today?: Date): HighShareTx | null`
  - `HighShareTx { amount; m2: number /* grp */; supply: SupplyLabel | null; floor: number | null; dealDate: string; direct: boolean; badge: "high" | "up" | null; base: number | null; diff: number | null; canceled: boolean; shareable: boolean; series: Array<{ date: string; amount: number }> /* 같은 grp·정상·계약 1년 */ }`
  - 거래가 없으면 null. 취소된 거래면 `canceled: true`, `badge/base/diff: null`, `shareable: false`. `share` 가 없으면 `badge: null`, `shareable: false`.
- Produces: `highShareTitle(name: string, tx: HighShareTx): string` — 예 `"OO아파트 33평 12억 5,000만 신고가"`, 취소면 `"… 신고 후 취소"`, 배지 없으면 접미사 없음.

- [ ] **Step 1: 실패하는 테스트**
  - `highShare.test.ts`: 신고가 거래 → `badge=="high"`, `base`, `diff`, `series` 가 같은 grp·정상·1년만; 취소 거래(**canceled after share**) → `canceled`, `badge===null`; 없는 id → null; `highShareTitle` 에 "축하" 미포함.
  - `route.test.tsx`(OG): 응답 200·`image/png`; 렌더 트리 텍스트에 `신고가`, `이전 최고보다 +1억`, `국토교통부 실거래가 · 계약 2026.11.01 · 신고 기준 · zipsise.com`; 공급 정보 없는 단지는 `84㎡` 만; 직거래면 `직거래`; 취소면 `신고 후 취소`. 기존 canceled OG 테스트의 렌더 검사 방식을 따른다.
  - `page.test.tsx`: **moved apartment** → `permanentRedirect('/highs/<moved_to>/<txId>')`; **expired link**(계약 40일 전) → 페이지 렌더, 공유 버튼 없음, "단지 전체 보기" 링크 있음; metadata `robots.index === false`, `openGraph.images[0].url === '/api/og/highs/<id>/<tx>'`.
- [ ] **Step 2: 실행해 실패 확인** — `cd frontend && npm test`.
- [ ] **Step 3: 구현** — `canceled/[aptId]/[txId]/page.tsx`·`api/og/canceled/...` 를 본떠 만든다. 카드 1200×630: 흰 바탕, 왼쪽 단지명·`formatArea(m2,"pyeong",supply)`·층·가격(+직거래)·"이전 최고보다 +X" 또는 "직전 거래보다 +X"·배지(빨강 `#DC2626` 신고가 / 주황 `#EA580C` 상승), 오른쪽 `series` 선(SVG polyline) 위 이번 거래 점, 하단 띠(Global Constraints 문구). 페이지: 카드 크게, 같은 단지 다른 평형 최근 거래 3건, "단지 전체 보기" 버튼, `SHARE_HIGHS_ENABLED && tx.shareable` 일 때만 `ShareButton`. `revalidate = 3600`.
- [ ] **Step 4: `npm test && npx tsc --noEmit` 통과.**
- [ ] **Step 5: 커밋** — `feat(share): 신고가 공유 페이지와 OG 카드`

### Task 6: 단지 페이지·/highs 공유 버튼, 이미지 저장

**Files:**
- Modify: `frontend/src/components/ShareButton.tsx`, `frontend/src/components/DealList.tsx`, `frontend/src/components/HighsBoard.tsx`, `frontend/.env.example`
- Test: `ShareButton` 테스트(신규 `frontend/src/components/__tests__/ShareButton.test.tsx`), `DealList.test.tsx`, `HighsBoard.test.tsx`

**Interfaces:**
- Consumes: `SHARE_HIGHS_ENABLED`, `highShareTitle` (Task 5), `Transaction.share`, `RecordHigh.shareable`.
- Produces: `ShareButton` 에 선택 props `compact?: boolean`(아이콘만, 행용), `imageUrl?: string`(있으면 공유 메뉴 끝에 "이미지 저장" — `<a href={imageUrl} download>`). 기존 호출부 동작은 그대로.

- [ ] **Step 1: 실패하는 테스트**
  - `DealList.test.tsx`: 플래그 on + `share.shareable` 거래 행에만 공유 버튼(`aria-label="이 거래 공유"`), 배지 텍스트 `신고가`/`상승`; 플래그 off 면 공유 버튼 0개(배지는 보임).
  - `HighsBoard.test.tsx`: 플래그 on + `shareable` 항목만 버튼, `held`·`shareable:false` 항목은 없음.
  - `ShareButton.test.tsx`: `imageUrl` 주면 "이미지 저장" 링크의 `href`·`download` 속성.
- [ ] **Step 2: 실행해 실패 확인.**
- [ ] **Step 3: 구현** — 공유 meta 의 url 은 `${SITE_URL}/highs/${aptId}/${txId}`, title 은 `highShareTitle`, imageUrl 은 `/api/og/highs/${aptId}/${txId}`. `.env.example` 에 `NEXT_PUBLIC_SHARE_HIGHS=` (기본 꺼짐, "Backfill 완료·판정 보강 확인 후 1" 주석).
- [ ] **Step 4: 전체 확인** — `cd frontend && npm test && npx tsc --noEmit && npm run lint && npm run build`; `.venv/bin/pytest -q`.
- [ ] **Step 5: 로컬 눈 확인** — CLAUDE.md "로컬 데이터로 프론트 확인" 절차로 `out/` 에 JSON 을 내보내고(`export_json --all`) `NEXT_PUBLIC_SHARE_HIGHS=1 npm run dev` 로 단지 페이지 공유 버튼 → 공유 페이지 → `/api/og/highs/...` 이미지를 확인, 스크린샷 첨부.
- [ ] **Step 6: 커밋** — `feat(share): 단지 페이지·/highs 신고가 공유 버튼과 이미지 저장`

### Task 7: 문서 갱신

**Files:**
- Modify: `CLAUDE.md` (프런트 페이지 목록에 `/highs/[aptId]/[txId]`, `/api/og/highs/...`; `frontend/.env.local` 키에 `NEXT_PUBLIC_SHARE_HIGHS`; 폴더 구조에 `pipeline/area_class.py`, `pipeline/share.py`)

- [ ] **Step 1: 위 항목 반영.**
- [ ] **Step 2: 커밋** — `docs: 공유 카드·평형 묶음 반영`

---

## 배포 메모 (구현 뒤, 사람)

- 평형 묶음 변경은 모든 단지 JSON 을 바꾸므로 첫 배포 때 `export_json --all` + `r2_publish` + `supabase_sync --all` 이 한 번 필요하다(하루 수집과 겹치지 않게 Daily Collection 을 잠시 끄고 수동 실행).
- `NEXT_PUBLIC_SHARE_HIGHS=1` 은 취소 Backfill 완료 뒤 Vercel 환경 변수로 켠다.
