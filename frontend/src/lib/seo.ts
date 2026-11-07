import { areaGroup, formatPrice } from "./format";
import { browseHref, districtFullName, regionHref, resolveRegionCode } from "./regions";
import type { Apartment, AreaStat, Metrics, RegionApartment, RegionStat, Rent, Transaction } from "./types";

/** 정식 주소(canonical·sitemap·JSON-LD) 기준. 도메인 연결 후 NEXT_PUBLIC_SITE_URL만 바꾼다. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://real-estate-poc-self.vercel.app").replace(/\/+$/, "");
export const SITE_NAME = "집시세";
export const SITE_ALT_NAME = "zipsise";
/** 홈 제목(absolute): 브랜드를 앞에 두고 무엇을 하는 사이트인지 한 줄로. */
export const HOME_TITLE = `${SITE_NAME} - 수도권 아파트 실거래가·신고가 조회`;

/** 검색 결과에서 잘리지 않는 제목·설명 길이(대략) */
export const MAX_TITLE = 60;
export const MAX_DESCRIPTION = 160;
/** 단지 제목은 모바일 검색 결과(약 580px)에서 가격까지 보이도록 더 짧게 자른다. */
export const MAX_APT_TITLE = 34;

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

/** 시군구 전체 이름 → 마지막 단어. "용인시 기흥구" → "기흥구", "광명시" → "광명시" */
export const shortDistrict = (fullName: string): string => fullName.split(/\s+/).filter(Boolean).pop() ?? "";

/** 단지의 정식 시군구 이름("용인시 기흥구"). 모르는 코드면 regions 표기에서 시도를 뺀 값. */
const aptDistrict = (apt: Apartment): string => districtFullName(apt.lawd_cd) || apt.region_name.replace(/^\S+\s/, "");

/**
 * "역삼래미안 실거래가 35억 · 강남구 역삼동". 가격을 앞에 두고 지역은 짧게(시군구 마지막 단어).
 * 길면 동 → 지역 → 가격 순으로 뺀다. 브랜드 접미사는 붙이지 않는다(absolute).
 */
export function aptTitle(apt: Apartment, latest?: Transaction): string {
  const head = `${apt.name} 실거래가${latest ? ` ${shortPrice(latest.amount)}` : ""}`;
  const gu = shortDistrict(aptDistrict(apt));
  const place = (withDong: boolean) => (gu ? ` · ${gu}${withDong && apt.dong ? ` ${apt.dong}` : ""}` : "");
  return firstFit([`${head}${place(true)}`, `${head}${place(false)}`, head, `${apt.name} 실거래가`], MAX_APT_TITLE);
}

/** 받침 있는 한글로 끝나면 "은", 그 밖(받침 없음·숫자·영문)은 "는" */
const eunNeun = (word: string): string => {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 !== 0 ? "은" : "는";
};

/**
 * 단지 페이지 첫 문단(본문 문장, 길이 제한 없음). 검색 미리보기에 번지·준공연도 대신 완결된 문장이 나오게 한다.
 * `areaLabel`은 최근 매매 평형 표기(예: "전용 59㎡·18평"), 없으면 생략.
 */
export function aptIntro(apt: Apartment, latest: Transaction | undefined, areaCount: number, areaLabel: string | null): string {
  const place = [apt.city, aptDistrict(apt), apt.dong].filter(Boolean).join(" ");
  const built = apt.build_year ? `${apt.build_year}년 준공 ` : "";
  const deal = latest
    ? `최근 매매는 ${areaLabel ? `${areaLabel} ` : ""}${formatPrice(latest.amount)}(${latest.deal_date})입니다.`
    : "최근 매매 거래는 아직 없습니다.";
  const areas = areaCount > 0 ? `${areaCount}개 평형의 ` : "";
  return `${place}에 있는 ${apt.name}${eunNeun(apt.name)} ${built}아파트로, ${deal} ${areas}실거래가와 전세·월세 내역을 볼 수 있습니다.`;
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

export interface JeonseInfo {
  deposit: number;
  ratio?: number;
}

/** 가장 최근 전세(월세 0) 거래의 보증금 + 매매 지표의 전세가율. 전세 거래가 없으면 null. */
export function latestJeonse(rents: Rent[], metrics: Metrics): JeonseInfo | null {
  const jeonse = rents.filter((r) => r.monthly_rent === 0).sort((a, b) => b.deal_date.localeCompare(a.deal_date))[0];
  if (!jeonse) return null;
  return { deposit: jeonse.deposit, ...(metrics.jeonse_ratio != null ? { ratio: metrics.jeonse_ratio } : {}) };
}

/** 단지 페이지 설명(160자 이내). 전세는 평형 요약보다 우선해서 남긴다: 평형 수 → 꼬리 문장 → 평형 요약 → 전세 순으로 줄이고, 그래도 길면 자른다. */
export function aptDescription(apt: Apartment, areaStats: AreaStat[], jeonse?: JeonseInfo | null): string {
  const head = `${apt.city} ${aptDistrict(apt)} ${apt.dong} ${apt.name} 아파트 매매 실거래가${apt.build_year ? `(${apt.build_year}년 준공)` : ""}.`;
  const tail = " 평형별 시세·전월세·거래 내역.";
  const jeonseText = jeonse
    ? ` 최근 전세 ${shortPrice(jeonse.deposit)}${jeonse.ratio != null ? `, 전세가율 ${Math.round(jeonse.ratio)}%` : ""}.`
    : "";
  const deals = (n: number) => (n > 0 && areaStats.length > 0 ? ` 최근 거래 ${areaSummary(areaStats, n)}.` : "");
  const candidates = [3, 2, 1].map((n) => head + jeonseText + deals(n) + tail);
  candidates.push(head + jeonseText + deals(1), head + jeonseText, head);
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

/** 동 페이지 첫 문단(본문 문장). 가장 최근 매매 단지는 최근 거래일 최신, 같으면 거래 많은 쪽. */
export function dongIntro(region: RegionLike, dong: string, apartments: RegionApartment[]): string {
  const head = `${region.city} ${regionDisplay(region)} ${dong}에는 아파트 ${apartments.length.toLocaleString("en-US")}개 단지가 있습니다.`;
  const latest = apartments
    .filter((a) => a.latest_trade_amount != null && a.latest_trade_date)
    .sort((a, b) => (b.latest_trade_date as string).localeCompare(a.latest_trade_date as string) || b.trade_count - a.trade_count)[0];
  const deal = latest ? ` 가장 최근 매매는 ${latest.name} ${formatPrice(latest.latest_trade_amount as number)}(${latest.latest_trade_date})입니다.` : "";
  return `${head}${deal} 단지별 실거래가·전세·최근 신고가를 최근 거래순으로 볼 수 있습니다.`;
}

/** 시군구 페이지 첫 문단(본문 문장). 통계는 있는 값만 쓴다. */
export function regionIntro(region: RegionLike, apartmentCount: number, stat?: RegionStat): string {
  const head = `${region.city} ${regionDisplay(region)} 아파트 ${apartmentCount.toLocaleString("en-US")}개 단지의 실거래가입니다.`;
  const parts = [
    stat?.avg_amount != null ? `최근 12개월 평균 매매가는 ${formatPrice(stat.avg_amount)}` : null,
    stat && stat.tx_count_12m > 0 ? `거래는 ${stat.tx_count_12m.toLocaleString("en-US")}건` : null,
  ].filter(Boolean);
  const yoy = parts.length > 0 && stat?.yoy_change != null ? `이며 전년 대비 ${stat.yoy_change > 0 ? "+" : ""}${stat.yoy_change}%` : "";
  const stats = parts.length > 0 ? ` ${parts.join(", ")}${yoy}입니다.` : "";
  return `${head}${stats} 동별·단지별 실거래가와 최근 신고가, 재건축·재개발 현황을 볼 수 있습니다.`;
}

/** 동 페이지 경로. 동 이름의 괄호·공백·한글은 인코딩한다. */
export const dongHref = (code: string, dong: string): string => `/region/${code}/${encodeURIComponent(dong)}`;

/** URL 파라미터 → 동 이름. 이미 디코딩돼 오든 인코딩돼 오든 같은 값을 주고, 깨진 인코딩은 그대로 둔다(500 방지). */
export function dongFromParam(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

/** "역삼동 아파트 실거래가 · 시세 | 강남구". 길면 · 시세 → 지역 순으로 뺀다. */
export function dongTitle(region: RegionLike, dong: string): string {
  const head = `${dong} 아파트 실거래가`;
  const name = regionDisplay(region);
  return firstFit([`${head} · 시세 | ${name}`, `${head} | ${name}`, head], MAX_TITLE);
}

/** 동 페이지 설명: 단지 수 + 최근 거래 단지 2~3개의 이름·가격. 길면 단지 수를 줄이고 마지막엔 자른다. */
export function dongDescription(region: RegionLike, dong: string, apartments: RegionApartment[]): string {
  const head = `${regionDisplay(region)} ${dong} 아파트 ${apartments.length.toLocaleString("en-US")}개 단지 실거래가.`;
  const recent = apartments
    .filter((a) => a.latest_trade_amount != null && a.latest_trade_date)
    .sort((a, b) => (b.latest_trade_date as string).localeCompare(a.latest_trade_date as string));
  const deals = (n: number) =>
    n > 0 && recent.length > 0
      ? ` 최근 매매 ${recent.slice(0, n).map((a) => `${a.name} ${shortPrice(a.latest_trade_amount as number)}`).join(", ")}.`
      : "";
  const candidates = [3, 2, 1, 0].map((n) => head + deals(n));
  return candidates.find((c) => c.length <= MAX_DESCRIPTION) ?? clip(head, MAX_DESCRIPTION);
}

/** 동 페이지 경로: 홈 › 시도 › 구 › 동 */
export function dongCrumbs(region: RegionLike, dong: string): Crumb[] {
  return [
    { name: "홈", url: "/" },
    { name: region.city, url: browseHref(region.city) },
    { name: regionDisplay(region), url: regionHref(region.code) },
    { name: dong, url: dongHref(region.code, dong) },
  ];
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

/** 단지 페이지 경로: 홈 › 시도 › 구(폐지 코드는 첫 후속 구) › 동(현행 코드만) › 단지 */
export function aptCrumbs(apt: Apartment): Crumb[] {
  const r = resolveRegionCode(apt.lawd_cd);
  return [
    { name: "홈", url: "/" },
    { name: apt.city, url: browseHref(apt.city) },
    ...(r.kind === "notFound" ? [] : [{ name: districtFullName(r.code), url: regionHref(r.code) }]),
    // 폐지 코드는 후속 구에 같은 동 페이지가 있다는 보장이 없어 동 단계를 뺀다
    ...(r.kind === "ok" && apt.dong ? [{ name: apt.dong, url: dongHref(r.code, apt.dong) }] : []),
    { name: apt.name, url: `/apartment/${apt.id}` },
  ];
}

/**
 * 단지 페이지 하단 링크용 이웃 단지 고르기. 같은 동(자기 제외)을 최근 거래일순으로 최대 `limit`개,
 * 같은 동이 `minSameDong`개 미만이면 같은 시군구 다른 단지(거래 많은 순)로 `limit`개까지 채운다.
 */
export function pickNearby(all: RegionApartment[], apt: Pick<Apartment, "id" | "dong">, limit = 12, minSameDong = 3): { apartments: RegionApartment[]; sameDong: boolean } {
  const others = all.filter((a) => a.id !== apt.id);
  const same = others
    .filter((a) => a.dong === apt.dong)
    .sort((a, b) => (b.latest_trade_date ?? "").localeCompare(a.latest_trade_date ?? "") || b.trade_count - a.trade_count)
    .slice(0, limit);
  if (same.length >= minSameDong) return { apartments: same, sameDong: true };
  const fill = others
    .filter((a) => a.dong !== apt.dong)
    .sort((a, b) => b.trade_count - a.trade_count)
    .slice(0, limit - same.length);
  return { apartments: [...same, ...fill], sameDong: false };
}

/** schema.org BreadcrumbList (홈 › 시도 › 구 › 단지) */
export function breadcrumbJsonLd(items: Crumb[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absUrl(c.url) })),
  };
}

/** schema.org WebSite: 검색 결과에 사이트 이름·대체 이름을 알리고 사이트 내 검색(/search?q=)을 연결한다. */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: SITE_ALT_NAME,
    url: absUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${absUrl("/search")}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** <script type="application/ld+json"> 본문. `<`를 이스케이프해 단지명 등으로 </script>를 탈출하지 못하게 한다. */
export const jsonLdHtml = (obj: unknown): string => JSON.stringify(obj).replace(/</g, "\\u003c");
