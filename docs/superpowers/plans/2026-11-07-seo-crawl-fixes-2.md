# 검색 크롤링 보강 2차 (2026-11-07, 브랜치 `seo-crawl-2`)

1차(`2026-11-07-seo-crawl-fixes.md`, main 603df85 배포)에 이어 SEO 점검에서 남은 항목. 원칙은 같다: 네이버 모바일은 메타 설명 대신 **본문 첫 제목+첫 문단**을 미리보기로 쓰므로 허브 페이지마다 완결된 문장을 서버 HTML에 넣고, 크롤러가 따라갈 `<a>`를 늘리고, 너무 무거운 페이지는 줄인다. main 머지·push는 사용자 승인 뒤.

## Task A. 동·시군구 페이지 첫 문단을 완결 문장으로

지금은 `<p>{city} {name} {dong} · 단지 110개 · 최근 거래 2026.11.05</p>`처럼 조각만 있다.

- `frontend/src/lib/seo.ts`
  - `dongIntro(region: RegionLike, dong: string, apartments: RegionApartment[]): string` — 예: "서울 강남구 삼성동에는 아파트 110개 단지가 있습니다. 가장 최근 매매는 삼성동롯데아파트 28억(2026-11-05)입니다. 단지별 실거래가·전세·최근 신고가를 최근 거래순으로 볼 수 있습니다." 최근 매매 단지는 `latest_trade_date` 최신(동률이면 `trade_count` 큰 쪽), 금액은 본문용 `formatPrice`. 거래 단지가 없으면 두 번째 문장 생략.
  - `regionIntro(region: RegionLike, apartmentCount: number, stat?: RegionStat): string` — 예: "서울 강남구 아파트 1,234개 단지의 실거래가입니다. 최근 12개월 평균 매매가는 28억, 거래는 3,456건이며 전년 대비 +5%입니다. 동별·단지별 실거래가와 최근 신고가, 재건축·재개발 현황을 볼 수 있습니다." stat이 없거나 avg_amount가 null이면 두 번째 문장은 있는 값만으로(둘 다 없으면 생략). 숫자는 `toLocaleString("en-US")`, 평균가는 `formatPrice`.
  - 지역 표기는 기존 `regionDisplay`(districtFullName 우선)와 `region.city`를 쓴다.
- `app/region/[code]/[dong]/page.tsx`, `app/region/[code]/page.tsx`: header의 `<p>`를 각각 `dongIntro`/`regionIntro` 문장으로 바꾼다(기존 facts 조각은 제거). 시각 스타일은 그대로(`text-sm text-gray-600`).
- 테스트: `lib/__tests__/seo.test.ts`에 두 함수 케이스(값 있음/없음), 해당 페이지 테스트가 있으면 첫 문단 문자열 갱신.

## Task B. /highs·/canceled 소개 문단 + /highs 목록 100건씩 더 보기

- `frontend/src/lib/highs.ts`: `highsIntro(items: RecordHigh[]): string` — "최근 30일 수도권 아파트 신고가는 1,593건으로 서울 612건, 경기 801건, 인천 180건입니다. 신고가는 같은 단지·같은 평형의 이전 최고가를 넘은 계약이며, 가장 큰 상승은 ○○아파트 +23%입니다." 0건이면 "최근 30일 수도권 아파트 신고가가 없습니다." 가장 큰 상승은 `topByPct(items,1)`. 건수 0인 도시는 나열에서 뺀다.
- `frontend/src/lib/canceled.ts`: `canceledIntro(items: CanceledHigh[], today: string): string` — `pickHeadline`이 고른 기간을 기준으로 "최근 7일 동안 수도권 아파트 신고가 12건이 신고 후 취소됐습니다(최근 30일 48건). 서울 5건, 경기 6건, 인천 1건이며, 거래 해제는 대출 불발·계약 합의 해지 등 여러 이유로 생깁니다." 0건이면 "최근 30일 수도권 아파트 신고가 중 취소된 거래가 없습니다." 30일 건수는 `toIsoDate(cancel_date) >= today-30일` 기준(보드와 같은 계산).
- `components/HighsBoard.tsx`, `components/CanceledBoard.tsx`: `intro: string` prop을 받아 `<h1>` 바로 아래 같은 박스 안에 `<p className="mt-2 text-sm text-gray-700">{intro}</p>`로 렌더(클라이언트 컴포넌트지만 SSR HTML에 들어간다). `app/highs/page.tsx`, `app/canceled/page.tsx`에서 서버에서 계산해 넘긴다.
- `HighsBoard` 목록 100건씩: `const PAGE = 100; const [limit, setLimit] = useState(PAGE)`; 모바일 `<ul>`과 데스크톱 표 모두 `shown.slice(0, limit)`; 아래에 `shown.length > limit`일 때 버튼 "더 보기 (남은 {shown.length-limit}건)" → `setLimit(l => l + PAGE)`. 도시 필터를 바꾸면 limit을 PAGE로 되돌린다. `CanceledBoard`는 건수가 적으니 그대로.
- 테스트: `lib/__tests__/highs.test.ts`·`canceled.test.ts`에 intro 케이스. `components/__tests__/HighsBoard.test.tsx`(있으면 거기, 없으면 새로): 250건 넣으면 `high-row`가 100개, 더 보기 클릭 후 200개, 도시 바꾸면 다시 100개 이하. 기존 테스트가 "전체 N건 렌더"를 단정하면 100건 기준으로 고치고 보고에 적는다.

## Task C. 홈에 시군구 83곳 링크

- `app/page.tsx` "지역별 탐색" 섹션의 도시 카드 3개 아래에 시군구 링크를 넣는다: 도시별로 `<p class="text-xs font-semibold text-gray-500">{city}</p>` + `<ul class="flex flex-wrap gap-1.5">`의 `<Link href={regionHref(code)}>`(rounded-full border px-2.5 py-1 text-xs). 소스는 `REGION_NAMES`(`@/lib/regionNames`, 현행 83개)와 `districtFullName`/`districtLabel`(짧은 이름, `@/lib/regions`)로 만들고 `CITIES` 순서(서울·경기·인천), 같은 도시 안은 코드순. `stats`에 의존하지 않는다(정적). 도시 판별은 `REGION_NAMES`나 regions 모듈에 있는 기존 함수를 쓴다(없으면 코드 앞 두 자리 11=서울, 28=인천, 41=경기).
- 서버 컴포넌트 그대로(홈은 이미 서버). 모바일(375px)에서 칩이 줄바꿈되며 가로 스크롤이 생기지 않아야 한다.
- 테스트: 홈 페이지 테스트가 있으면 `a[href^="/region/"]`가 83개인지 추가. 없으면 `app/__tests__/homeRegions.test.tsx` 새로(기존 홈 테스트의 mock 방식을 따라).

## 검증
저장소 루트: `.venv/bin/python -m pytest -q`(파이썬은 안 바뀌므로 생략 가능) / `cd frontend && npx vitest run && npx tsc --noEmit && npx eslint src && npx next build`.
