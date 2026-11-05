# IndexNow + RSS 계획 (2026-11-05)

목표: 네이버 수집 요청(하루 50건 한도) 대신 검색엔진에 바뀐 페이지를 대량으로 알린다.
1. **IndexNow**: 매일 수집 뒤 바뀐 단지 페이지 주소를 네이버(`https://searchadvisor.naver.com/indexnow`)와 공용 엔드포인트(`https://api.indexnow.org/indexnow`, 빙 등에 공유)에 보낸다. 처음 한 번은 사이트맵 전체를 보낸다.
2. **RSS**: `/rss.xml` 에 최근 신고가·취소된 신고가를 피드로 내보낸다(서치어드바이저 'RSS 제출'에 등록할 주소).

작업 위치: 워크트리 `~/.gemini/antigravity/scratch/real-estate-poc/.worktrees/indexnow` (브랜치 `indexnow`, origin/main 8748da1 기준). **push·main 합치기는 하지 않는다.** 커밋만.

준비: 워크트리에는 `.venv`·`frontend/node_modules`가 없다. 메인 체크아웃 것을 심볼릭 링크로 쓴다.
```bash
cd ~/.gemini/antigravity/scratch/real-estate-poc/.worktrees/indexnow
ln -s ../../.venv .venv
ln -s ../../../frontend/node_modules frontend/node_modules
```
(링크는 커밋하지 않는다. `.gitignore`에 이미 있으면 그대로, 없으면 `git status`에 안 올라오게 주의.)

## IndexNow 규격 (공식 indexnow.org)
- 키: `96af640fabc32046427f45ea7a8dbba5` (공개값. 비밀 아님. 사이트에 그대로 노출되는 게 규격이다)
- 키 파일: `https://zipsise.com/96af640fabc32046427f45ea7a8dbba5.txt`, 내용은 키 문자열 한 줄(끝 줄바꿈 없음 또는 하나).
- 요청: `POST <endpoint>`, 헤더 `Content-Type: application/json; charset=utf-8`, 본문
  `{"host":"zipsise.com","key":"<키>","keyLocation":"https://zipsise.com/<키>.txt","urlList":[...]}`
- 한 요청 최대 10,000개 URL. 모든 URL은 같은 host.
- 응답: 200·202 성공, 400 형식 오류, 403 키 확인 실패, 422 URL이 host와 안 맞음, 429 너무 잦음.

## 작업 1. 키 파일
- `frontend/public/96af640fabc32046427f45ea7a8dbba5.txt` 추가(내용 = 키).
- `frontend/src/app/robots.ts`·미들웨어 등이 `.txt` 정적 파일을 막지 않는지 확인. `next.config.ts`의 redirects가 이 경로를 바꾸지 않는지 확인.

## 작업 2. `pipeline/indexnow.py` (새 모듈)
CLI: `python -m pipeline.indexnow` 
- 택1: `--changed FILE` (changed_apts.json: 정수 apt_id 배열) / `--sitemap URL` (기본 없음; 주면 사이트맵 XML을 받아 `<loc>` 전부)
- `--site` 기본 `https://zipsise.com`
- `--key` 기본 환경변수 `INDEXNOW_KEY`, 없으면 위 상수 키
- `--endpoints` 기본 `https://searchadvisor.naver.com/indexnow,https://api.indexnow.org/indexnow`
- `--dry-run`: 보내지 않고 개수·첫 5개만 출력
- `--changed` 일 때 URL 목록: `/apartment/{id}` 각각 + 고정 허브 `/`, `/highs`, `/canceled`, `/stats` (바뀐 단지가 0개면 아무것도 안 보낸다).
- 중복 제거, 순서 유지, 10,000개씩 나눠 보낸다. 요청 사이 1초 쉰다.
- HTTP는 이미 쓰는 라이브러리(`requests`가 requirements에 있는지 확인, 없으면 `urllib.request`)로. timeout 30초.
- 결과를 엔드포인트별로 한 줄씩 출력: `indexnow naver: 200 (10000 urls)`. 
- **실패해도 종료 코드는 0** (수집 워크플로를 깨지 않는다). 단, 인자 오류는 argparse 기본대로.
- 순수 함수로 분리해 테스트: `build_urls(site, apt_ids)`, `parse_sitemap(xml_text)`, `chunks(urls, n)`, `payload(site, key, urls)`.

테스트 `tests/test_indexnow.py` (네트워크 없이):
- build_urls: 허브 4개 + 단지 URL, 중복 제거, 빈 입력이면 빈 목록
- parse_sitemap: 샘플 XML(네임스페이스 포함)에서 loc 추출
- chunks: 10,001개 → 10,000 + 1
- payload: host·key·keyLocation 형식
- 보내기 함수는 HTTP 호출부를 주입(또는 monkeypatch)해서 엔드포인트 2곳 × 청크 수만큼 호출되는지, 403이어도 예외 없이 끝나는지

## 작업 3. 워크플로
`.github/workflows/collect-daily.yml` 의 `Publish to R2` 다음에 단계 추가:
```yaml
      - name: Notify IndexNow
        continue-on-error: true
        run: python -m pipeline.indexnow --changed changed_apts.json
```
(페이지는 ISR 1시간이라 바로 최신이 아닐 수 있지만, 검색엔진은 알림을 받고 나중에 가져가므로 괜찮다.)

## 작업 4. RSS `/rss.xml`
- 파일: `frontend/src/app/rss.xml/route.ts` (Route Handler, `export const revalidate = 3600`).
- 데이터: `lib/data`의 `fetchJson`으로 `/v1/highs/recent.json`, `/v1/canceled/recent.json` (형태는 `lib/highs.ts`·`lib/canceled.ts`의 타입을 재사용). 
- 항목: 두 목록을 합쳐 날짜(신고가는 `deal_date`, 취소는 `cancel_date`) 내림차순, 최대 100개.
  - 신고가 title: `[신고가] {apt_name} {area_group}㎡ {가격}` , 가격은 기존 포맷 함수(예: `lib/format.ts`의 억/만원 표기, 없으면 seo.ts 방식)로 `8억 4,000만 원` 같은 형태. description: `{region_name} {dong} · {floor}층 · {deal_date} 거래 · 이전 최고 {prev_max 가격}` 
  - 취소 title: `[취소] {apt_name} {area_group}㎡ {가격} 신고가 거래 취소`, description: `{region_name} · {deal_date} 거래 → {cancel_date} 취소({days_to_cancel}일 뒤)`
  - link: 신고가 `{SITE_URL}/apartment/{apt_id}`, 취소는 기존 공유 경로 `/canceled/{apt_id}/{tx_id}` (lib/canceledShare.ts에 경로 함수가 있으면 그걸 쓴다)
  - guid: `zipsise-high-{tx_id}` / `zipsise-cancel-{tx_id}` (isPermaLink="false")
  - pubDate: 날짜를 KST 00:00으로 보고 RFC 822(`toUTCString`)
- 채널: title `집시세 - 수도권 아파트 신고가·취소 소식`, link `SITE_URL`, description `국토부 실거래가 기준 수도권 아파트 최근 신고가와 취소된 신고가`, language `ko`, lastBuildDate.
- XML 이스케이프(&, <, >, ", ') 필수. 응답 헤더 `Content-Type: application/rss+xml; charset=utf-8`.
- 표현 규칙: 사실만. "조작·작전·가짜·호재·투자 추천" 같은 단어 금지.
- 순수 함수 `buildRss(highs, canceled, siteUrl, now)`를 `frontend/src/lib/rss.ts`로 분리하고 `frontend/src/lib/__tests__/rss.test.ts`에서 테스트(정렬, 100개 제한, 이스케이프, 링크 형식, 빈 데이터면 항목 없는 정상 피드).
- 레이아웃 `<head>`에 `<link rel="alternate" type="application/rss+xml" title="집시세 신고가·취소 소식" href="/rss.xml">` 추가(Next metadata `alternates.types`로).

## 작업 5. 문서
- 레포 `CLAUDE.md` 파이프라인 CLI 표에 `indexnow` 행, 폴더 구조에 `indexnow.py`, 프론트에 `/rss.xml` 한 줄.

## 검증 (모두 통과해야 커밋)
```bash
.venv/bin/python -m pytest -q
cd frontend && npx vitest run && npx tsc --noEmit && npx eslint src && npx next build
```
- `next build` 후 `npx next start -p 3311` 로 띄워 `curl -s localhost:3311/rss.xml | head -40` 와 `curl -s localhost:3311/96af640fabc32046427f45ea7a8dbba5.txt` 확인(NEXT_PUBLIC_DATA_URL 등은 메인 체크아웃의 `frontend/.env.local`을 복사해 쓴다. 값은 출력하지 않는다). 확인 후 서버 종료.
- `.venv/bin/python -m pipeline.indexnow --sitemap https://zipsise.com/sitemap.xml --dry-run` 이 2만 개 넘는 URL과 청크 3개를 보고하는지.

## 커밋
기능별로 2~3개 커밋(예: `feat(pipeline): IndexNow 알림`, `feat(web): /rss.xml 신고가·취소 피드`, `docs`). 메시지 끝에
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
push 금지. 끝나면 바뀐 파일 목록, 테스트 결과 숫자, rss 샘플 앞부분, dry-run 출력을 보고한다.
