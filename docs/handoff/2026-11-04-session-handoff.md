# zipsise.com 세션 인수인계 (2026-11-04)

이전 세션이 길어져 새 세션으로 넘긴다. 이 문서 + `CLAUDE.md` + 메모리 `zipsise-real-estate-site`를 먼저 읽고 시작한다.

## 1. 지금 상태 한눈에
- **서비스**: https://zipsise.com (브랜드 "집시세", 수도권 아파트 실거래가). 2026-11-04 런칭.
- **레포**: `link8411-max/real-estate-poc`, 로컬 `~/.gemini/antigravity/scratch/real-estate-poc` (main 체크아웃). 작업용 워크트리 `.worktrees/phase1-rebuild`(현재 브랜치 `redevelopment` = main과 같은 커밋 884dcf5). 기능은 워크트리에서 브랜치 → 테스트 → `git push origin HEAD:main`(Vercel 자동 배포) 순서로 해 왔다.
- **구조**: GitHub Actions `Daily Collection`(KST 07/13/19시, 제한 60분) → R2 정본 DB 다운로드 → geocode → `collect --daily`(월요일 07시는 `--with-late`로 2~5개월 전 매매 재수집) → `export_json`(바뀐 단지 + 모음 JSON들) → `r2_publish`(동시 32) → `supabase_sync` → DB 업로드. 프론트 Next 16 on Vercel, ISR 1시간, 데이터는 R2 공개 버킷 `https://pub-d64c5ee85ced4675b2e8b07dc9185d74.r2.dev`.
- **테스트**: Python `.venv/bin/python -m pytest -q`(200), 프론트 `cd frontend && npx vitest run`(534) `npx tsc --noEmit` `npx eslint src` `npx next build`.

## 2. 이번 세션에 배포된 것 (모두 main)
| 기능 | 핵심 |
|---|---|
| 도메인·검색 | zipsise.com(Cloudflare 등록·DNS), vercel.app → 308, 구글 서치콘솔(URL 접두어)·네이버 사이트맵 제출, GA4 `G-DTQ3S086V7`, Vercel Web Analytics(스크립트 방식) |
| 취소된 신고가 | `/canceled`, 공유 `/canceled/{apt}/{tx}` + OG 카드, 단지 페이지 경고·섹션, `v1/canceled/recent.json` |
| 최근 신고가 | `/highs`, 지역·동 섹션, `v1/highs/recent.json` (`pipeline/highs.py`) |
| 동 페이지 | `/region/{code}/{dong}` 1,102개, 사이트맵 22,763 |
| 쪼개진 단지 합치기 | 이름 변경으로 둘로 나뉜 13쌍 합침(`pipeline/merge_apartments.py`, migrate에서 자동), 사라진 id는 `{"moved_to"}` stub → 308 |
| 지도 | 홈 미니 지도, 단지 위치 지도, 내 위치 버튼, 두 줄 마커(단지명·평형/가격), 미리보기 카드(PC 오른쪽 아래), 모바일 겹침 수정 |
| 정비사업 | 국토부 통합 데이터 952곳(2026-05 기준) → `v1/redevelopment/zones.json`, `/redevelopment`, 지도 `정비사업` 토글·색·필터·`아파트 시세 숨기기`, 단지 배지 |
| 브랜드 | 검색 제목 `… | 집시세`, 단지 제목 가격 우선, 로고 `집시세 수도권 실거래가` |

## 3. 할 일 (우선순위)
1. **[사용자] 스레드·인스타 "집시세" 계정 만들기** → 매주 월 "취소된 신고가·최근 신고가 TOP 3" 카드 자동 게시 세팅(운세 사이트 `unse-ai-daily-reels` 예약 작업과 같은 방식, 공식 API). 첫 몇 주는 게시 전 사용자 확인.
2. **[11/7경] 서치 콘솔 색인 현황 확인** (`site:zipsise.com`은 11/4 기준 0건). 색인 안 되는 사유가 나오면 고친다. 네이버는 1~2주 뒤.
3. **[11/9 월 07시 이후] 늦은 취소 재수집 첫 실행 확인** — Actions 로그에 2~5개월 전 달 trade 수집이 있는지.
4. **[사용자] 브이월드 인증키** 받으면 정비구역 경계(폴리곤) 레이어 확인 → 지도에 영역 색칠(2단계). 리모델링은 공개 데이터 없음(보류).
5. **애매한 쪼개진 단지 35쌍**: `docs/handoff/2026-11-04-split-apartments-ambiguous.txt`. 사용자 추천: ① 예전 시스템 1건짜리 중복(잠실 엘스·반포 래미안 퍼스티지 등)과 ② 같은 단지의 예전 표기(강선마을·문촌마을·홍문현대 등)는 **본 단지(N) 쪽으로** 합치기(이번과 반대 방향, 새 규칙 필요), ③ 다른 단지·재건축(한양3/한양2, 보람2단지, 휘경 주공→리오포레, 골든맨숀→월드메르디앙 등)은 그대로. 사용자 확인 후 진행.
6. **관심단지 알림**(로그인+웹푸시) — 방문자가 생긴 뒤.

## 4. 정리할 것
- Render 서버 삭제(사용자 확인 필요), Vercel 환경변수 `NEXT_PUBLIC_API_URL` 삭제.
- 운세 레포 `~/Documents/face-reading-crosslink` 브랜치 `crosslink-ci`(CI + robots만 남김, 미푸시) — 넣을지 사용자 결정.
- 워크트리 `.worktrees/phase1-rebuild`, `.claude/worktrees/busy-blackburn` 정리 여부.
- 로컬 미리보기 서버(`realestate-web` :3000, `realestate-data` :8787)와 브레인스토밍 서버(:63225) 정리.
- 미뤄 둔 작은 개선(검토에서 Minor로 남김): `apts=0`일 때 아파트 데이터도 안 받기, 정비구역 마름모 터치 영역 키우기, `insert_rent` 자연키 중복 판정, 홈이 highs 전체 JSON을 받아 개수만 쓰는 것(통계 파일에 개수 필드로), 정비구역 새 구역은 CLI `--geocode`로만 위치 채움.

## 5. 일하는 규칙 (사용자와 합의된 것)
- 사용자에게는 **한국어로만** 답한다.
- push·main 합치기·배포·삭제·매일 수집 끄고 켜기는 **먼저 물어본다**(사용자가 "배포해"라고 하면 진행).
- 로그인·비밀번호·결제·캡차는 사용자 몫. 로그인된 화면 조작은 **크롬(Claude in Chrome)**으로(aside는 DNS·Vercel API 변경이 자동 모드 분류기에 막혔다). 분류기가 막으면 우회하지 말고 사용자에게 화면과 입력값을 정확히 안내.
- 구현은 계획을 구체적으로 써서 **소넷 서브에이전트**에 맡기고, 검토 후 실제 화면(모바일 375px 포함)으로 확인한 다음 배포. 데이터를 지우거나 합치는 작업은 실제 DB 복사본으로 먼저 리허설.
- 사실만 쓰고 "조작·작전·가짜·호재·투자 추천" 같은 단정 표현은 쓰지 않는다.
- 비밀값은 출력·커밋하지 않는다(`.env`, `frontend/.env.local`).
