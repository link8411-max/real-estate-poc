# 해제 두 줄(쌍둥이) 처리 수정 계획 — 2026-11-07

배경: `docs/handoff/2026-11-07-canceled-verification.md`. 국토부 API는 해제된 거래를 흔히 두 줄(원래 줄 + `cdealType=O` 줄)로 내보내고, 그 뒤 거래가 그대로 진행돼 등기까지 끝나는 경우가 많다. 현재 `insert_trade`는 두 줄을 하나로 합치며 정상 줄에 해제를 덮어써, 살아 있는 거래가 취소로 바뀌고 이전 최고가 계산도 틀어진다.

## 바꿀 것

### 1. `pipeline/molit_client.py`
- `TradeItem`에 필드 추가(기본값 None, 기존 생성자 호출이 깨지지 않게 맨 뒤에):
  - `rgst_date: str | None` ← `rgstDate` ("26.10.30" → "2026-10-30", 빈 값 None). `_cancel_date`와 같은 규칙의 `_yy_date(item, tag)` 헬퍼로.
  - `dealing_gbn: str | None` ← `dealingGbn` ("중개거래"/"직거래"/빈 값 None)
  - `cancel_reported: str | None` — API 필드가 아니라 `_save`가 채우는 값(아래 3). 파서는 None.

### 2. `pipeline/db.py`
- `migrate`: `transactions`에 `rgst_date DATE`, `cancel_reported DATE`, `dealing_gbn TEXT` 멱등 추가. `_BASE_SCHEMA`에도 넣는다.
- `insert_trade(conn, apt_id, item)` 동작:
  - 행 없음 → INSERT (cancel_date, is_canceled, rgst_date, cancel_reported, dealing_gbn 포함).
  - 행 있음, `item.cancel_date` 있고 행은 취소 아님 → 지금처럼 취소 처리. (단건 O 줄 = 진짜 취소)
  - 행 있음, `item.cancel_date` 없음(정상 줄), 행이 취소 상태 → **취소 해제(복구)**: `cancel_date=NULL, is_canceled=0, cancel_reported=COALESCE(item.cancel_reported, 기존 cancel_date)`.
  - 그 외: `rgst_date`/`dealing_gbn`/`cancel_reported` 중 새 값이 있고 기존과 다르면 UPDATE.
  - 무엇이든 바뀌면 `mark_changed` 후 True, 아니면 False. 기존 테스트 `test_insert_trade_dedup_and_cancel_marks_changed`는 그대로 통과해야 한다.

### 3. `pipeline/collect.py` `_save`
- trade 배치를 자연키 `(apt_name, lawd_cd, dong, jibun, deal_date, floor, round(area,2), amount)`로 묶는다.
- 한 묶음에 정상 줄(cancel_date None)이 하나라도 있으면: 정상 줄 하나(rgst_date 있는 것 우선)를 대표로 쓰고 `cancel_reported = max(해제 줄들의 cancel_date)`를 넣어 `insert_trade` 한 번만 호출. 해제 줄은 저장하지 않는다.
- 묶음이 해제 줄뿐이면 지금처럼 그 줄로 `insert_trade`.
- rent는 변경 없음.

### 4. `pipeline/canceled.py` `canceled_highs`
- 결과에서 **재신고** 제외: 같은 단지·면적군·층·금액의 정상 거래(cancel_date NULL)가 `deal_date > r.deal_date` 이고 `deal_date <= r.cancel_date + 30일`이면 건너뛴다(역삼2차아이파크 36억: 해제일 11/3에 같은 금액 재등록).
- 항목에 `dealing_gbn`(없으면 None) 추가. JSON 모양은 그 외 동일.

### 5. 테스트 (pytest, 기존 스타일 따라)
- `tests/test_molit_client.py`: `trade_sample.xml`을 문자열 치환해 `rgstDate`/`dealingGbn` 파싱 확인.
- `tests/test_db.py`: (a) 취소된 행에 정상 줄이 오면 복구되고 `cancel_reported`에 해제일이 남는다, (b) rgst_date 갱신이 changed로 잡힌다, (c) 기존 취소 테스트 유지.
- `tests/test_collect.py`: 같은 거래의 정상 줄+해제 줄이 한 배치에 오면 행 1개, `cancel_date NULL`, `cancel_reported` 설정; 해제 줄만 오면 취소.
- `tests/test_canceled.py`: 해제일 +30일 안에 같은 금액 재신고가 있으면 목록에서 빠진다; 31일 뒤면 남는다.

## 하지 않을 것
- 프론트/JSON 스키마 변경(추가 필드만), 전월세, 커밋.

## 검증
`.venv/bin/pytest -q` 전부 통과.
