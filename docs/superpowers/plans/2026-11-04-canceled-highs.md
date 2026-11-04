# 취소된 신고가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신고가로 신고됐다가 취소된 매매를 단지 페이지(A·B·D)·모음 페이지(`/canceled`)·공유 카드로 보여 준다.

**Architecture:** 파이프라인이 해제일을 ISO로 정리하고(멱등 마이그레이션), 매일 `v1/canceled/recent.json`(최근 30일 취소된 신고가)을 R2에 내보낸다. 주 1회 3~6개월 전 매매를 다시 받아 늦은 취소를 잡는다. 단지 페이지는 기존 `trade.json`의 `cancel_date`로 브라우저/서버에서 같은 정의를 계산한다. 모음·공유 페이지는 단지 페이지와 같은 ISR(재검증 1시간) 서버 렌더.

**Tech Stack:** Python 3.11 + SQLite(pipeline), pytest / Next 16 App Router + React + Tailwind, vitest + Testing Library, `@vercel/og`

**Spec:** `docs/superpowers/specs/2026-11-04-canceled-highs-design.md`

## Global Constraints

- 운영비 0원: 새 서버·DB 없음. R2 정적 JSON + Vercel 페이지만.
- "취소된 신고가" 정의(스펙 4.1, 4.9): 같은 단지, 같은 평형 묶음(전용면적 정수부 버림 = Python `CAST(area AS INTEGER)`, TS `areaGroup`)에서, 계약일이 **엄격히 이전**(`deal_date <`)이고 **지금 시점에 취소되지 않은**(`cancel_date IS NULL`) 거래들의 최고가보다 금액이 **엄격히 큰** 취소 거래. 이전 거래가 없으면 신고가 아님. 같은 금액은 신고가 아님.
- 취소 여부의 기준은 `cancel_date`다. `is_canceled`는 믿지 않는다.
- 해제일 기준 기간: 모음 페이지 7일/30일, 단지 페이지 A "최근 1년" 모두 **해제일** 기준. 기준일은 KST 오늘(`kstToday()` / Python `kst_today()`).
- 문구에 "조작", "작전", "가짜", "자전거래"를 쓰지 않는다. 안내 문구(그대로): `거래 해제는 대출 불발·계약 합의 해지 등 여러 이유로 생깁니다. 국토교통부 실거래가 공개 자료 기준.`
- 금액 단위는 기존과 같다(만원). 표시는 기존 `formatPrice`/`formatManwon`을 쓴다.
- Python 테스트: `.venv/bin/python -m pytest -q`. 프론트: `cd frontend && npx vitest run`, `npx tsc --noEmit`, `npx eslint src`.

## Review Focus

1. 예전 형식 해제일(`25.07.28`)이 아직 R2 JSON에 남아 있는 단지 → 프론트가 날짜를 ISO로 읽어 기간 계산이 맞아야 한다 (Task 4 테스트).
2. 취소 거래가 하나도 없는 단지 → 경고 줄·섹션·시세표 표시가 아무것도 안 나와야 한다 (Task 5 테스트).
3. `recent.json`이 아직 없음(404) → `/canceled`는 500이 아니라 "없습니다" 한 줄 (Task 6 테스트).
4. 공유 링크의 거래 id가 단지 JSON에 없음 → 단지 페이지로 이동, 단지도 없으면 `/canceled`로 이동 (Task 7 테스트).
5. 7일 건수 1~2건 → 헤드라인·큰 카드 3장이 30일 기준으로 바뀜 (Task 6 테스트).

---

### Task 1: 해제일 정리 마이그레이션

**Files:**
- Create: `pipeline/canceled.py`
- Modify: `pipeline/db.py` (`migrate` 끝에 호출 추가)
- Test: `tests/test_canceled.py`

**Interfaces:**
- Produces: `normalize_cancel_date(v: str | None) -> str | None` (`"25.07.28"`→`"2025-07-28"`, ISO는 그대로, `None`/빈 문자열→`None`); `normalize_cancel_dates(conn) -> int` (바꾼 행 수, 바뀐 행의 `apt_id`는 `mark_changed`로 올림)

- [ ] **Step 1: 실패하는 테스트**

```python
def test_normalize_cancel_date():
    assert normalize_cancel_date("25.07.28") == "2025-07-28"
    assert normalize_cancel_date("2025-07-28") == "2025-07-28"
    assert normalize_cancel_date(None) is None
    assert normalize_cancel_date("") is None

def test_migrate_normalizes_and_is_idempotent(tmp_path):
    conn = connect(str(tmp_path / "t.db")); migrate(conn)
    # 단지 1개, 거래 3건: 예전 형식 취소 1, ISO 취소 1, 정상 1 (is_canceled 는 전부 0 으로 넣는다)
    ...
    pop_changed(conn)
    assert normalize_cancel_dates(conn) == 1
    rows = conn.execute("SELECT cancel_date, is_canceled FROM transactions ORDER BY id").fetchall()
    assert [tuple(r) for r in rows] == [("2025-07-28", 1), ("2026-09-02", 1), (None, 0)]
    assert pop_changed(conn) == [apt_id]
    assert normalize_cancel_dates(conn) == 0   # 두 번째는 할 일 없음
    assert pop_changed(conn) == []
```

- [ ] **Step 2:** `.venv/bin/python -m pytest -q tests/test_canceled.py` → FAIL (모듈 없음)
- [ ] **Step 3: 구현.** `normalize_cancel_dates`는 `cancel_date GLOB '[0-9][0-9].[0-9][0-9].[0-9][0-9]'`인 행만 ISO로 바꾸고, `is_canceled`를 `cancel_date IS NOT NULL`에 맞춘다(어긋난 행만 UPDATE). 바뀐 행의 단지만 `mark_changed`. `db.migrate` 마지막에 `normalize_cancel_dates(conn)` 호출(순환 import 피하려면 함수 안 import).
- [ ] **Step 4:** 테스트 PASS, 전체 `pytest -q` PASS
- [ ] **Step 5:** commit `feat(pipeline): 해제일 형식을 ISO로 정리하는 멱등 마이그레이션`

### Task 2: 취소된 신고가 계산 + `v1/canceled/recent.json`

**Files:**
- Modify: `pipeline/canceled.py`, `pipeline/export_json.py` (`export`가 항상 `put`)
- Test: `tests/test_canceled.py`, `tests/test_export_json.py`

**Interfaces:**
- Consumes: Task 1의 ISO 해제일
- Produces: `canceled_highs(conn, since: str, until: str | None = None) -> list[dict]` — 해제일 `since <= cancel_date (<= until)`인 취소된 신고가, 해제일 내림차순(동률은 `jump` 큰 순). 각 항목 키(그대로): `tx_id, apt_id, apt_name, region_name, city, area, area_group, floor, amount, prev_max, jump, deal_date, cancel_date, days_to_cancel`. `build_canceled_recent(conn, today: date) -> {"generated_at": ISO시각, "since": today-30일 ISO, "items": [...]}`. R2 키 `v1/canceled/recent.json`.

- [ ] **Step 1: 실패하는 테스트** (한 단지·평형 84.9㎡, 계약일 순)

```python
# 정상 10억(2026-01-05) / 취소 12억(2026-02-01, 해제 2026-02-20) / 정상 11억(2026-03-01)
# / 취소 11억(2026-04-01, 해제 2026-04-10)  ← 직전 정상 최고 11억과 같음 → 신고가 아님
# / 취소 9억 59.9㎡(2026-04-02, 해제 2026-04-11) ← 그 평형 이전 거래 없음 → 아님
# / 이전 최고가가 취소 거래여도 제외: 위 12억은 이후 거래 비교에서 빠진다
def test_canceled_highs_definition(conn_with_fixture):
    items = canceled_highs(conn, since="2026-01-01")
    assert [(i["amount"], i["prev_max"], i["jump"]) for i in items] == [(120000, 100000, 20000)]
    assert items[0]["days_to_cancel"] == 19
    assert items[0]["area_group"] == 84 and items[0]["city"] == "서울"

def test_same_day_earlier_deal_not_compared(...):  # 같은 날 정상 13억 + 취소 12억 → 12억은 신고가(같은 날은 비교 안 함)
def test_since_filters_by_cancel_date(...):        # since="2026-03-01" 이면 위 12억(해제 2/20)은 빠짐
def test_export_writes_canceled_recent(tmp_path):  # export(..., apt_ids=[...]) 결과 keys 에 "v1/canceled/recent.json" 포함, gz 안 JSON 의 since == today-30
```

- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현.** 해제일 범위의 취소 거래를 먼저 고르고(전체 스캔 1회), 각 거래마다 `SELECT MAX(amount) FROM transactions WHERE apt_id=? AND CAST(area AS INTEGER)=? AND deal_date < ? AND cancel_date IS NULL`(기존 `idx_transactions_apt_date` 사용). `region_name`은 `export_json._region_name`, `city`는 `regions.city_of`. `export()`에서 `stats/summary.json` 옆에 매번 `put`.
- [ ] **Step 4:** PASS, 전체 pytest PASS
- [ ] **Step 5:** commit `feat(pipeline): 최근 30일 취소된 신고가 JSON 내보내기`

### Task 3: 주 1회 늦은 취소 재수집

**Files:**
- Modify: `pipeline/collect.py`, `.github/workflows/collect-daily.yml`, `CLAUDE.md`(수집 설명 한 줄)
- Test: `tests/test_collect.py`

**Interfaces:**
- Produces: `late_months(today: date) -> list[str]` — 2~5개월 전 4개 달 `YYYYMM`, 오래된 순. 예: `date(2026,11,4)` → `["202606","202607","202608","202609"]`; `date(2026,2,10)` → `["202509","202510","202511","202512"]`. CLI `--with-late`(`--daily`와만 함께): daily 수집 뒤 같은 연결로 `collect(kinds={"trade"}, months=late_months(kst_today()))`를 한 번 더 하고, `pop_changed`는 마지막에 한 번. 요약 JSON의 `saved`/`failed`는 두 번 합친 값.

- [ ] **Step 1: 실패하는 테스트:** `late_months` 두 예시; `main(["--daily","--with-late",...])`에 가짜 fetch를 주입해 trade 호출 달 목록이 `current_and_previous_month + late_months`이고 rent는 daily 달만 호출됨; `--with-late` 단독(daily 없이)은 종료 코드 2.
- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3: 구현.** 워크플로 Collect 단계에서 KST 월요일 오전 실행일 때만 `--with-late`를 붙인다:
  ```bash
  LATE=""; if [ "$(TZ=Asia/Seoul date +%u)" = 1 ] && [ "$(TZ=Asia/Seoul date +%H)" -lt 10 ]; then LATE="--with-late"; fi
  python -m pipeline.collect --kind both --daily $LATE --changed-out changed_apts.json --summary-out summary.json
  ```
- [ ] **Step 4:** PASS, 전체 pytest PASS
- [ ] **Step 5:** commit `feat(pipeline): 월요일 아침 3~6개월 전 매매 재수집(늦은 취소)`

### Task 4: 프론트 계산 모듈

**Files:**
- Create: `frontend/src/lib/canceled.ts`
- Modify: `frontend/src/lib/types.ts` (`CanceledHigh`, `CanceledRecentFile`), `frontend/src/lib/data.ts` (`fetchCanceledRecent`)
- Test: `frontend/src/lib/__tests__/canceled.test.ts`

**Interfaces:**
- Produces:
  - `toIsoDate(d: string): string` — `"25.07.28"`→`"2025-07-28"`, ISO 그대로.
  - `type CanceledTx = Transaction & { cancel_iso: string; prev_max: number | null; is_high: boolean }`
  - `analyzeCanceled(txs: Transaction[]): { canceled: CanceledTx[]; aboveMaxByArea: Map<number, number> }` — `canceled`는 해제일 최신순, `aboveMaxByArea`는 평형 묶음별 "취소 안 된 최고가보다 높은 취소 금액 중 최대값"(없으면 키 없음). 정의는 Global Constraints와 같음.
  - `countSince(c: CanceledTx[], sinceIso: string): { total: number; highs: number }`
  - `interface CanceledHigh` = Task 2 항목 키와 같은 필드. `interface CanceledRecentFile { generated_at: string; since: string; items: CanceledHigh[] }`
  - `fetchCanceledRecent(init?: RequestInit) => Promise<CanceledRecentFile | null>` (`/v1/canceled/recent.json`)
  - `pickHeadline(items: CanceledHigh[], todayIso: string): { days: 7 | 30; items: CanceledHigh[] }` — 7일 건수 ≥3이면 7일, 아니면 30일.
  - `topJumps(items: CanceledHigh[], n = 3): CanceledHigh[]` — `jump` 내림차순.

- [ ] **Step 1: 실패하는 테스트** — Task 2와 같은 시나리오(10억/취소12억/11억/취소11억/다른 평형 취소9억)로 `analyzeCanceled` 결과: `is_high`가 12억만 true, `prev_max` 100000, `aboveMaxByArea.get(84) === 120000`(정상 최고 11억보다 높으므로); 예전 형식 해제일 거래도 같은 결과; `countSince(..., "2026-04-01")` → `{ total: 2, highs: 0 }`; `pickHeadline` 7일 2건+30일 5건 → `days: 30`, 7일 3건 → `days: 7`; `topJumps` 순서.
- [ ] **Step 2:** `npx vitest run src/lib/__tests__/canceled.test.ts` FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** PASS, tsc 통과
- [ ] **Step 5:** commit `feat(web): 취소된 신고가 계산 모듈`

### Task 5: 단지 페이지 A·B·D

**Files:**
- Create: `frontend/src/components/CanceledAlert.tsx`(A), `frontend/src/components/CanceledDeals.tsx`(D)
- Modify: `frontend/src/components/AreaStatsTable.tsx`(B: `canceledAbove?: Map<number, number>` prop), `frontend/src/components/ApartmentTrades.tsx`(`beforeList?: React.ReactNode` prop을 차트와 "실거래 내역" 사이에 다시 추가, `canceledAbove` 전달), `frontend/src/app/apartment/[id]/page.tsx`
- Test: `frontend/src/components/__tests__/Canceled.test.tsx`, `AreaStatsTable.test.tsx`

**Interfaces:**
- Consumes: Task 4 `analyzeCanceled`, `countSince`, `toIsoDate`
- Produces: `<CanceledAlert total highs />` — `total === 0`이면 `null`. 문구(그대로): `최근 1년 취소된 거래 {total}건` + highs>0이면 ` · 그중 신고가였던 거래 {highs}건`. `href="#canceled"` 링크. `<CanceledDeals items: CanceledTx[] />` — 0건이면 `null`, 루트 `<section id="canceled">`, 제목 `취소된 거래 {n}건`, 각 줄: 계약일 · 평형(기존 `formatArea`+단위 토글) · 층 · 가격 · `{해제일} 취소`, `is_high`면 배지 `당시 신고가`. 아래 안내 문구(Global Constraints). B: 해당 평형 행의 최고가 셀 아래에 작게 `취소된 더 높은 가격 {formatManwon(v)}`.
- 페이지: 서버에서 `analyzeCanceled(data.transactions)` 계산, A는 요약 섹션의 `InsightBadges` 아래, `countSince(canceled, kstToday()−365일)` 사용. D는 매매 탭 `ApartmentTrades beforeList`로.

- [ ] **Step 1: 실패하는 테스트** — 취소 0건 단지: 세 컴포넌트 모두 아무것도 안 그림(`container` 비어 있음 / B 문구 없음); 취소 있는 단지: A 문구 정확히, D에 `당시 신고가` 배지 1개·`id="canceled"`, 안내 문구 포함; B에 `취소된 더 높은 가격 12억` 표시.
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 구현 (기존 카드 톤: `rounded-2xl border border-gray-100 bg-white p-5`, 경고 줄은 `bg-red-50 text-red-700`)
- [ ] **Step 4:** PASS, 기존 `apartmentPage.test.tsx` 포함 전체 vitest·tsc·eslint PASS
- [ ] **Step 5:** commit `feat(web): 단지 페이지에 취소된 거래 경고·섹션·시세표 표시`

### Task 6: 모음 페이지 `/canceled` + 진입점

**Files:**
- Create: `frontend/src/app/canceled/page.tsx`(서버, `revalidate = 3600`, `generateMetadata`), `frontend/src/components/CanceledBoard.tsx`(클라이언트: 기간 탭·지역 필터·헤드라인·큰 카드·목록)
- Modify: `frontend/src/components/SiteHeader.tsx`(메뉴 `{ href: "/canceled", label: "취소된 신고가" }`를 "통계" 앞에), `frontend/src/app/page.tsx`(통계 카드 줄에 카드 하나, `/canceled` 링크), `frontend/src/app/sitemap.ts`(`/canceled`, daily, 0.7)
- Test: `frontend/src/components/__tests__/CanceledBoard.test.tsx`, `frontend/src/app/__tests__/seoRoutes.test.ts`(사이트맵에 `/canceled`), `SiteHeader.test.tsx`

**Interfaces:**
- Consumes: Task 4 `fetchCanceledRecent`, `pickHeadline`, `topJumps`, `CanceledHigh`
- Produces: `<CanceledBoard items={CanceledHigh[]} today={string} />`.
  - 헤드라인(그대로): `최근 {days}일, 신고가 {n}건이 신고 후 취소됐습니다`. 30일도 0건이면 `최근 30일 취소된 신고가가 없습니다`.
  - 기간 탭 `7일` / `30일`. 처음 선택은 `pickHeadline`의 `days`. 탭을 바꾸면 헤드라인도 그 기간.
  - 지역 필터 `전체 / 서울 / 경기 / 인천`(`city` 필드).
  - 큰 카드 3장: `topJumps`, 각 카드 `{단지명} {평형}` / `+{formatPrice(jump)}` / `{days_to_cancel}일 만에 취소`. 카드와 목록 줄은 `/canceled/{apt_id}/{tx_id}`로 링크.
  - 목록: `md` 미만 카드, `md` 이상 표(단지·지역 / 평형 / 취소된 가격 / 직전 최고가 / 해제일).
  - 맨 아래 안내 문구.
  - 홈 카드 문구: `최근 7일 취소된 신고가` / `{n}건`(7일 건수, 데이터 없으면 카드 숨김).

- [ ] **Step 1: 실패하는 테스트** — 7일 2건+30일 5건: 헤드라인 `최근 30일, 신고가 5건이…`, 탭 `30일` 선택됨; 탭 `7일` 클릭 → `최근 7일, 신고가 2건이…`; `경기` 필터 → 서울 항목 사라짐; 큰 카드 순서는 jump 내림차순, 링크 href 형식; 빈 배열 → `최근 30일 취소된 신고가가 없습니다`; 페이지에서 `fetchCanceledRecent`가 `null`이어도 렌더 성공(빈 상태).
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** 전체 vitest·tsc·eslint PASS
- [ ] **Step 5:** commit `feat(web): 취소된 신고가 모음 페이지와 진입점`

### Task 7: 공유 페이지 + 공유 카드 이미지

**Files:**
- Create: `frontend/src/app/canceled/[aptId]/[txId]/page.tsx`(서버, ISR 3600, `generateMetadata`, `robots: { index: false }`), `frontend/src/app/api/og/canceled/[aptId]/[txId]/route.tsx`
- Modify: `frontend/src/app/api/og/[id]/route.tsx`(폰트 로더·`options()`를 공유하도록 `frontend/src/lib/ogFont.ts`로 옮김), `next.config.ts`(`outputFileTracingIncludes`에 새 OG 경로 추가)
- Test: `frontend/src/app/__tests__/canceledShare.test.tsx`

**Interfaces:**
- Consumes: `fetchAptTrade`, Task 4 `analyzeCanceled`, 기존 `ShareButton`
- 동작:
  - 단지 JSON 없음 → `redirect("/canceled")`.
  - 거래 id 없음 → `redirect(`/apartment/${aptId}`)`.
  - 거래가 있으면 본문: `{단지명} 전용 {평형}` / `{formatPrice(amount)}` / `{계약일} 계약` / 취소면 `{해제일} 취소 ({n}일 만에)`, `is_high`면 `당시 직전 최고가 {formatPrice(prev_max)}보다 {formatPrice(jump)} 높았던 거래`. 취소가 아니면 `이 거래는 취소 내역이 없습니다`. 단지 페이지 링크, `/canceled` 링크, `ShareButton`, 안내 문구.
  - 메타: 제목 `{단지명} {평형}평 {formatPrice(amount)} 신고 후 취소`, OG 이미지 `/api/og/canceled/{aptId}/{txId}`.
  - OG 이미지(1200×630, 어두운 배경 `#111827`): 위 `zipsise.com · 취소된 신고가`, 단지명·평형, `신고된 가격` + 금액(취소선, `#FB7185`), `직전 최고가` + 금액, 아래 `{계약일} 계약 → {해제일} 취소 ({n}일)`. 거래를 못 찾으면 기존 `message()`처럼 회색 안내 이미지.

- [ ] **Step 1: 실패하는 테스트** — `fetchAptTrade` 목: null → `redirect("/canceled")` 호출; 거래 없음 → `/apartment/1554`로 redirect; 취소된 신고가 → 본문에 `신고 후 취소`·`만에`·`높았던 거래` 포함, 메타 `robots.index === false`; 취소 아닌 거래 → `이 거래는 취소 내역이 없습니다`.
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** 전체 vitest·tsc·eslint PASS, `npx next build` 성공
- [ ] **Step 5:** commit `feat(web): 취소된 신고가 공유 페이지와 카드 이미지`
