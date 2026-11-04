# 이름이 바뀌어 쪼개진 단지 합치기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 국토부 단지명 변경(주로 2026-02~)으로 둘로 쪼개진 단지를 1:1로 확실한 쌍만 합치고, 앞으로 같은 일이 안 생기게 하며, 합쳐져 사라진 단지 주소는 남은 단지로 영구 이동시킨다.

**Architecture:** 쌍 찾기·합치기는 `pipeline/merge_apartments.py`. `db.migrate` 끝에서 자동 실행(매일 수집이 R2 원본 DB를 받아 적용 → 사람이 시점을 맞출 필요 없음, 쌍이 없으면 아무것도 안 함). 사라진 단지 id는 `apartment_aliases`에 기록하고, 내보내기가 그 id의 `trade.json`/`rent.json`을 `{"moved_to": 남은id}`로 덮어쓰며, Supabase에서는 그 행을 지운다. 프론트는 `moved_to`를 보면 영구 이동.

**Background (실제 DB에서 확인, 2026-11-04):**
- 예: `기흥역지웰푸르지오`(id 43641, apt_seq 없음, 매매 179건, 마지막 2026-03-28, 전월세 0) ↔ `기흥역더퍼스트푸르지오`(id 11128154, apt_seq `41463-892`, 매매 21건 2026-02~, 전월세 478건). 지번 658·준공 2017 동일. 2~3월 3건은 양쪽에 중복.
- 원인: `db.upsert_apartment`는 apt_seq 또는 (동·지번·이름 정확히 같음)으로만 찾는다. 예전 데이터 단지는 apt_seq가 없고 이름이 달라 새 단지가 생겼다.
- 같은 (lawd_cd, dong, jibun, build_year)에 apt_seq 없는 단지 L과 apt_seq 있는 단지 N이 함께 있는 경우 54쌍. 일부는 1:n(재건축 `주공1`→`휘경리오포레 1·2단지`), 일부는 같은 지번의 다른 단지일 수 있다(`한양3`/`한양2`).
- `insert_trade`의 중복 판정 해시는 단지명을 포함해, 이름이 바뀐 뒤 같은 거래를 다시 받으면 새 행이 생긴다.

## Global Constraints
- 1:1 규칙(그대로): L은 apt_seq IS NULL, N은 apt_seq IS NOT NULL, `lawd_cd`·`dong`·`jibun`(빈 값 제외)·`build_year`(NULL 제외)가 모두 같고, **L의 후보 N이 정확히 1개이고 그 N의 후보 L도 정확히 1개**일 때만 합친다. 나머지는 모두 "애매"로 남기고 절대 자동으로 합치지 않는다.
- 남는 쪽은 **L의 id**(오래된 주소·검색 노출 유지). 이름은 N의 이름(국토부 현재 이름), apt_seq는 N의 것(유니크 인덱스 때문에 N에서 먼저 지운다). 좌표·세대수는 L 값이 있으면 L, 없으면 N.
- 거래 중복 키(그대로): 매매 `(deal_date, floor, round(area,2), amount)`, 전월세 `(deal_date, floor, round(area,2), deposit, monthly_rent)`. 중복이면 **N의 행을 남기고 L의 행을 지운다**(N의 해시가 현재 이름 기준이라 이후 재수집과 맞물림). L 행에만 해제일이 있으면 N 행에 옮긴다.
- 합친 뒤 N 행은 apartments에서 지우고 `apartment_aliases(old_id=N, canonical_id=L)` 기록. 이미 별칭을 가리키던 행이 N을 canonical로 가리키면 L로 고친다.
- 운영비 0원 유지, 새 서비스 없음.
- 테스트: Python `.venv/bin/python -m pytest -q`, 프론트 `cd frontend && npx vitest run && npx tsc --noEmit && npx eslint src`.

## Review Focus
1. 1:n·n:1 후보(재건축 등)가 하나라도 자동으로 합쳐지면 안 된다 (Task 1 테스트).
2. 두 번째 migrate는 아무것도 바꾸지 않는다(멱등) (Task 1 테스트).
3. 합친 뒤 같은 달을 새 이름으로 다시 수집해도 거래가 늘지 않는다 (Task 1 테스트: 합친 다음 insert_trade로 같은 거래 재삽입 → False).
4. 사라진 id로 들어온 공유 링크·단지 주소는 404가 아니라 남은 단지로 간다 (Task 2 테스트).
5. Supabase에 사라진 단지 행이 남지 않는다 (Task 1 테스트: 삭제 호출).

---

### Task 1: 파이프라인 — 쌍 찾기·합치기·재발 방지·내보내기·Supabase

**Files:**
- Create: `pipeline/merge_apartments.py`, `tests/test_merge_apartments.py`
- Modify: `pipeline/db.py` (`migrate` 끝에서 `merge_renamed(conn)` 호출; `insert_trade` 자연키 중복 판정; `upsert_apartment` 대체 매칭), `pipeline/export_json.py` (별칭 stub), `pipeline/supabase_sync.py` (삭제), 관련 테스트 파일

**Interfaces (Produces):**
- `find_rename_pairs(conn) -> tuple[list[tuple[int, int]], list[dict]]` — `(keep_id L, drop_id N)` 목록과 애매 목록. 애매 항목 키: `lawd_cd, dong, jibun, build_year, legacy: [{id, name, trades}], new: [{id, name, apt_seq, trades}]`.
- `merge_pair(conn, keep_id: int, drop_id: int) -> dict` — `{"moved_trades", "dropped_dup_trades", "moved_rents", "dropped_dup_rents"}`. `mark_changed(conn, [keep_id, drop_id])`.
- `merge_renamed(conn) -> int` — 찾은 1:1 쌍을 모두 합치고 쌍 개수 반환.
- CLI `python -m pipeline.merge_apartments --db PATH --report FILE [--dry-run]`: 쌍과 애매 목록(JSON)을 FILE에 쓰고, `--dry-run`이면 DB를 바꾸지 않는다.
- `insert_trade`: 해시가 없어도 같은 단지에 같은 `(deal_date, floor, area, amount)` 행이 있으면 새로 넣지 않는다(해제일만 비어 있으면 채움, 기존 규칙 그대로).
- `upsert_apartment`: apt_seq로도, 이름으로도 못 찾았을 때, 같은 lawd 후보 코드·dong·jibun·build_year에 **apt_seq 없는 단지가 정확히 1개**면 그 단지에 붙인다(apt_seq·이름 갱신, `mark_changed`).
- 내보내기: `export(..., apt_ids=...)`가 받은 id 중 apartments에 없고 `apartment_aliases`에 있는 id는 `v1/apt/{id}/trade.json`·`rent.json`을 `{"moved_to": canonical_id}`로 쓴다(`--all`이면 별칭 전부).
- Supabase: `delete_apartments(ids, *, url, key, session)` — `DELETE /rest/v1/apartments?id=in.(...)`. `sync()`가 받은 id 중 apartments에 없는 것은 지운다.

- [ ] Step 1: 실패하는 테스트 — 한 DB에 (a) 확실한 1:1 쌍(L 매매 3건 중 1건이 N과 중복, N 매매 2건+전월세 2건, L에만 해제일 있는 중복 1건), (b) 1:n(L 하나에 같은 지번 N 둘), (c) n:1(L 둘에 N 하나), (d) build_year 다른 쌍, (e) jibun 빈 값 쌍을 넣는다. 기대: `find_rename_pairs` 쌍은 (a)만, 애매는 (b)(c); (d)(e)는 둘 다 아님. `merge_renamed` 후 L 매매 4건(중복 1건 제거, 해제일 옮겨짐)·전월세 2건, L 이름=N 이름, L apt_seq=N 것, N 행 없음, 별칭 1행, 두 번째 호출 0. 합친 뒤 같은 거래를 N 이름으로 `insert_trade` → False. `upsert_apartment`가 이름이 다른 새 항목을 apt_seq 없는 유일 후보에 붙임. 내보내기 stub `{"moved_to": L}`. `sync`가 사라진 id에 대해 삭제 호출(가짜 세션으로 확인).
- [ ] Step 2: FAIL 확인
- [ ] Step 3: 구현
- [ ] Step 4: 전체 pytest PASS
- [ ] Step 5: commit `feat(pipeline): 이름이 바뀌어 쪼개진 단지를 1:1로 합치고 재발 방지`

### Task 2: 프론트 — 사라진 단지 주소 영구 이동

**Files:**
- Modify: `frontend/src/lib/types.ts`, `frontend/src/lib/data.ts`, `frontend/src/app/apartment/[id]/page.tsx`, `frontend/src/app/apartment/[id]/layout.tsx`, `frontend/src/app/canceled/[aptId]/[txId]/page.tsx`, `frontend/src/app/api/og/[id]/route.tsx`, `frontend/src/app/api/og/canceled/[aptId]/[txId]/route.tsx`
- Test: 기존 테스트 파일들에 케이스 추가

**Interfaces:**
- `type Moved = { moved_to: number }`; `isMoved(x: unknown): x is Moved`.
- 단지 페이지: trade.json이 `moved_to`면 `permanentRedirect(`/apartment/${moved_to}`)` (탭 쿼리 유지). 메타데이터는 같은 경우 `robots.index=false`.
- 공유 페이지: 단지가 `moved_to`면 `permanentRedirect(`/canceled/${moved_to}/${txId}`)`.
- OG 라우트: `moved_to`면 남은 단지 데이터로 그린다.
- 그 밖에 `fetchAptTrade`/`fetchAptRent` 결과를 쓰는 곳(비교 등)은 `moved_to`를 "없음"으로 다룬다(크래시 금지).

- [ ] Step 1: 실패하는 테스트 — 단지 페이지·공유 페이지 redirect 호출 인자, OG가 남은 단지로 그림, 비교 화면이 moved 응답에 안 깨짐.
- [ ] Step 2: FAIL
- [ ] Step 3: 구현
- [ ] Step 4: 전체 vitest·tsc·eslint PASS
- [ ] Step 5: commit `feat(web): 합쳐진 단지 주소를 남은 단지로 영구 이동`
