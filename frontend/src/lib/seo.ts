import { areaGroup } from "./format";
import { browseHref, districtFullName, regionHref, resolveRegionCode } from "./regions";
import type { Apartment, AreaStat, RegionStat, Transaction } from "./types";

/** 정식 주소(canonical·sitemap·JSON-LD) 기준. 도메인 연결 후 NEXT_PUBLIC_SITE_URL만 바꾼다. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://real-estate-poc-self.vercel.app").replace(/\/+$/, "");
export const SITE_NAME = "수도권 아파트 실거래가";

/** 검색 결과에서 잘리지 않는 제목·설명 길이(대략) */
export const MAX_TITLE = 60;
export const MAX_DESCRIPTION = 160;

export const absUrl = (path: string): string => (/^https?:\/\//.test(path) ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`);

const CITY_FULL: Record<string, string> = { 서울: "서울특별시", 경기: "경기도", 인천: "인천광역시" };

/** 제목용 짧은 가격(만원 단위 입력). 350000 → "35억", 285000 → "28.5억", 8500 → "8,500만" */
export function shortPrice(manwon: number): string {
  if (manwon < 10000) return `${manwon.toLocaleString("en-US")}만`;
  return `${Math.round(manwon / 1000) / 10}억`;
}

/** "2025-10-30" → "25.10" */
const yymm = (d: string): string => d.slice(2, 7).replace("-", ".");

const firstFit = (candidates: string[], max: number): string =>
  candidates.find((c) => c.length <= max) ?? candidates[candidates.length - 1];

/** "역삼래미안 실거래가 | 서울 강남구 역삼동 · 최근 35억(25.10)". 길면 동 → 가격 → 지역 순으로 뺀다. */
export function aptTitle(apt: Apartment, latest?: Transaction): string {
  const head = `${apt.name} 실거래가`;
  const price = latest ? ` · 최근 ${shortPrice(latest.amount)}(${yymm(latest.deal_date)})` : "";
  const withDong = `${apt.region_name} ${apt.dong}`;
  return firstFit(
    [`${head} | ${withDong}${price}`, `${head} | ${apt.region_name}${price}`, `${head} | ${apt.region_name}`, head],
    MAX_TITLE,
  );
}

/** 평형별 최근가 요약(거래 많은 평형 n개, 면적순). "59㎡ 28억(25.11), 80㎡ 35억(25.10)" */
function areaSummary(stats: AreaStat[], n: number): string {
  return [...stats]
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .sort((a, b) => a.area - b.area)
    .map((s) => `${areaGroup(s.area)}㎡ ${shortPrice(s.latest_amount)}(${yymm(s.latest_date)})`)
    .join(", ");
}

const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/** 단지 페이지 설명(160자 이내). 길면 평형 수 → 꼬리 문장 순으로 줄이고, 그래도 길면 자른다. */
export function aptDescription(apt: Apartment, areaStats: AreaStat[]): string {
  const head = `${apt.region_name} ${apt.dong} ${apt.name} 아파트 매매 실거래가${apt.build_year ? `(${apt.build_year}년 준공)` : ""}.`;
  const tail = " 평형별 시세·전월세·거래 내역.";
  const deals = (n: number) => (n > 0 && areaStats.length > 0 ? ` 최근 거래 ${areaSummary(areaStats, n)}.` : "");
  const candidates = [3, 2, 1].map((n) => head + deals(n) + tail);
  candidates.push(head + deals(1), head);
  const fit = candidates.find((c) => c.length <= MAX_DESCRIPTION);
  return fit ?? clip(head, MAX_DESCRIPTION);
}

type RegionLike = { code: string; name: string; city: string };

const regionDisplay = (r: RegionLike): string => districtFullName(r.code) || r.name;

/** "강남구 아파트 실거래가 | 서울" */
export function regionTitle(region: RegionLike): string {
  return `${regionDisplay(region)} 아파트 실거래가 | ${region.city}`;
}

/** 지역 페이지 설명: 단지 수 + (있으면) 최근 12개월 평균가·거래량 */
export function regionDescription(region: RegionLike, apartmentCount: number, stat?: RegionStat): string {
  const parts = [`${region.city} ${regionDisplay(region)} 아파트 ${apartmentCount.toLocaleString("en-US")}개 단지 실거래가.`];
  if (stat?.avg_amount != null) {
    parts.push(`최근 12개월 평균 ${shortPrice(stat.avg_amount)}, 거래 ${stat.tx_count_12m.toLocaleString("en-US")}건.`);
  }
  parts.push("단지별 최근 매매가와 거래량.");
  return clip(parts.join(" "), MAX_DESCRIPTION);
}

/** schema.org ApartmentComplex. 지난 거래가는 Offer가 아니므로 넣지 않는다. */
export function aptJsonLd(apt: Apartment): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ApartmentComplex",
    name: apt.name,
    url: absUrl(`/apartment/${apt.id}`),
    address: {
      "@type": "PostalAddress",
      addressCountry: "KR",
      addressRegion: CITY_FULL[apt.city] ?? apt.city,
      addressLocality: districtFullName(apt.lawd_cd) || apt.region_name.replace(/^\S+\s/, ""),
      streetAddress: apt.jibun ? `${apt.dong} ${apt.jibun}` : apt.dong,
    },
    ...(apt.lat != null && apt.lng != null
      ? { geo: { "@type": "GeoCoordinates", latitude: apt.lat, longitude: apt.lng } }
      : {}),
  };
}

export interface Crumb {
  name: string;
  url: string;
}

/** 단지 페이지 경로: 홈 › 시도 › 구(폐지 코드는 첫 후속 구) › 단지 */
export function aptCrumbs(apt: Apartment): Crumb[] {
  const r = resolveRegionCode(apt.lawd_cd);
  return [
    { name: "홈", url: "/" },
    { name: apt.city, url: browseHref(apt.city) },
    ...(r.kind === "notFound" ? [] : [{ name: districtFullName(r.code), url: regionHref(r.code) }]),
    { name: apt.name, url: `/apartment/${apt.id}` },
  ];
}

/** schema.org BreadcrumbList (홈 › 시도 › 구 › 단지) */
export function breadcrumbJsonLd(items: Crumb[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absUrl(c.url) })),
  };
}

/** <script type="application/ld+json"> 본문. `<`를 이스케이프해 단지명 등으로 </script>를 탈출하지 못하게 한다. */
export const jsonLdHtml = (obj: unknown): string => JSON.stringify(obj).replace(/</g, "\\u003c");
