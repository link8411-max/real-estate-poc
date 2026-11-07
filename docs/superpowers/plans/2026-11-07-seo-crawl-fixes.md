# 검색 크롤링 보강 3건 (2026-11-07)

배경: 2026-11-07 외부 점검에서 확인한 결함. (1) 단지 페이지 서버 HTML에 다른 단지로 가는 `<a href="/apartment/...">`가 0개라 2만 페이지가 서로 연결되지 않음(막다른 길). (2) `sitemap.xml` 22,735개 URL의 lastmod가 전부 발행 시각(`meta.data_updated_at`)으로 같아 검색엔진이 바뀐 페이지를 구분 못 함. (3) 네이버 모바일이 미리보기로 쓰는 첫 문단이 "갑곳리 349 1990년 준공"처럼 번지와 준공연도가 붙어 나오고, 완결된 문장이 없음.

브랜치 `seo-crawl` (워크트리 `.worktrees/seo-crawl`). main 머지·push는 사용자 승인 뒤.

## Task 1. 단지 페이지 "같은 동 다른 단지" 링크

- `frontend/src/app/apartment/[id]/page.tsx`: `fetchRegion(code, init)`를 기존 `Promise.all`에 추가. code는 `resolveRegionCode(apt.lawd_cd)`가 `ok`일 때만(그 외엔 섹션 생략). 지역 JSON의 `apartments`에서 `dong === apt.dong`이고 `id !== apt.id`인 단지를 최근 거래일순(`latest_trade_date` desc, 없으면 뒤) 최대 12개. 같은 동이 3개 미만이면 같은 시군구 단지(거래 많은 순)로 12개까지 채운다.
- 새 서버 컴포넌트 `frontend/src/components/NearbyApartments.tsx`: props `{ apartments: RegionApartment[]; dong: string; dongHref: string | null; regionName: string; regionHref: string; sameDong: boolean }`. 제목 `<h2>` "같은 동 다른 단지"(sameDong) 또는 "{regionName} 다른 단지". 목록은 기존 `RegionApartmentList`(sort="recent") 재사용. 아래에 `<Link>` "{dong} 단지 전체 보기 ›"(dongHref 있을 때)와 "{regionName} 전체 보기 ›". 단지가 0개면 null 반환.
- 위치: `DealTabs` 아래(페이지 맨 끝). 서버 컴포넌트여야 함(SSR HTML에 `<a>`가 들어가야 함). `next/link`의 `Link`는 SSR에서 `<a href>`를 낸다.
- 테스트 `frontend/src/app/__tests__/apartmentPage.test.tsx`: `@/lib/data` mock에 `fetchRegion` 추가(기본 `mockResolvedValue({ code:"11680", name:"강남구", city:"서울", succeeded_by:null, apartments:[...] })`). 케이스: ① 같은 동 단지 링크가 `href="/apartment/<id>"`로 렌더되고 자기 자신(id 7)은 없음 ② 같은 동 2개뿐이면 시군구 단지로 채움 ③ fetchRegion이 null이면 섹션 없음(페이지는 정상).

## Task 2. 사이트맵 lastmod를 단지별 실제 변경일로

### 2a. 파이프라인
- `pipeline/export_json.py`에 `build_sitemap_index(conn) -> list[list]`: `[[apt_id, "YYYY-MM-DD"], ...]` id 오름차순. 날짜 = 그 단지의 마지막 데이터 변경일: `transactions`와 `rents`에서 `COALESCE(substr(created_at,1,10), deal_date)`의 MAX (해제 반영도 포함되게 `transactions.updated_at`류 컬럼이 있으면 같이 MAX에 넣기 — `pipeline/db.py` 스키마에서 컬럼명 확인 후 결정, 없는 컬럼은 쓰지 않음). 거래·전월세가 하나도 없는 단지는 빼지 말고 날짜 null.
- `export()`에서 `search/index.json` 옆에 `put(f"{PREFIX}/sitemap/apartments.json", build_sitemap_index(conn))` (changed·all 모두).
- `tests/test_export_json.py`에 케이스 추가: fixture DB에 거래 2건(created_at 다르게)·전월세 1건 넣고 MAX가 나오는지, 거래 없는 단지는 null인지, `export()` 결과 keys에 `v1/sitemap/apartments.json`이 있는지.

### 2b. 프론트
- `frontend/src/lib/types.ts`: `export type SitemapIndexRow = [number, string | null];`
- `frontend/src/lib/data.ts`: `export const fetchSitemapIndex = (init?) => fetchJson<SitemapIndexRow[]>("/v1/sitemap/apartments.json", init);`
- `frontend/src/app/sitemap.ts`: 색인·메타와 함께 `fetchSitemapIndex(init)`도 받는다(없으면 null → 기존처럼 `data_updated_at` 사용). 단지 lastModified = 그 단지 날짜(없으면 `data_updated_at`). 동 lastModified = 그 동 단지 날짜의 MAX, 시군구 lastModified = 그 시군구 단지 날짜의 MAX(둘 다 없으면 `data_updated_at`). 홈·/highs·/canceled·/stats는 `data_updated_at`, /browse·/map·/redevelopment는 lastModified 생략. 파일은 하나로 둔다(22.7k URL·3.9MB는 한도 50,000·50MB 안쪽).
- `frontend/src/app/__tests__/seoRoutes.test.ts`: `fetchJson` mock을 경로별 `mockImplementation`으로 바꾸고 케이스 추가: ① 단지별 날짜가 그대로 들어감 ② 동·시군구는 MAX ③ sitemap 파일이 없으면(null) 전부 `data_updated_at`. 기존 테스트는 유지(호출 횟수 단정 `toHaveBeenCalledTimes(1)`은 2로 바꾸거나 경로 기준으로 고침).

## Task 3. 단지 페이지 첫 문단

- `frontend/src/lib/seo.ts`에 `aptIntro(apt: Apartment, latest: Transaction | undefined, areaCount: number, areaLabel: string | null): string`. 예: "인천 강화군 강화읍 갑곳리에 있는 용진2는 1990년 준공 아파트로, 최근 매매는 약 20평(전용 59㎡) 5,100만원(2026-11-05)입니다. 3개 평형의 실거래가와 전세·월세 내역을 볼 수 있습니다." build_year 없으면 "준공" 구절 생략, latest 없으면 "최근 매매 거래는 아직 없습니다." 지역명은 `apt.city` + `districtFullName(apt.lawd_cd)`(없으면 region_name에서 시도 뺀 값) + `apt.dong`. 조사는 "은(는)" 대신 "는"으로 고정하지 말고 받침 유무로 고름(간단한 한글 받침 판정 함수, 숫자·영문으로 끝나면 "은(는)"는 피하고 "는" 사용).
- `page.tsx`: 기존 `<p>최근 매매 …</p>`를 `aptIntro` 문장으로 바꾼다. 가격은 `<strong>`로 유지해도 되지만 문장은 하나의 `<p>` 안에 있어야 함. areaLabel은 기존 코드의 `SUPPLY_ENABLED ? formatArea(...) : "전용 N㎡·N평"` 결과를 넘긴다.
- `frontend/src/components/ApartmentHeader.tsx`: 주소 span과 준공 span 사이에 텍스트 구분자 `<span className="text-gray-300" aria-hidden>·</span>`를 넣어 텍스트 추출 시 "갑곳리 349 · 1990년 준공"으로 읽히게 한다(모바일 줄바꿈 시 구분자가 줄 앞에 오지 않게 `gap` 대신 각 항목 뒤에 붙이거나 `flex-wrap` 유지하되 구분자를 준공 span 안의 앞에 둔다).
- 테스트: `frontend/src/lib/__tests__/seo.test.ts`에 `aptIntro` 케이스(준공 있음/없음, 거래 없음, 받침 조사), `apartmentPage.test.tsx`에 첫 문단 문장이 렌더되는지.

## 검증
저장소 루트: `.venv/bin/python -m pytest -q` / `cd frontend && npx vitest run && npx tsc --noEmit && npx eslint src && npx next build`.
