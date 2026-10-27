import { REGION_NAMES } from "./regionNames";

/** 폐지 코드(아직 색인에 남은 단지용) → 옛 이름 */
const RETIRED_NAMES: Record<string, string> = {
  "28110": "중구",
  "28140": "동구",
  "28260": "서구",
  "41190": "부천",
  "41590": "화성",
};

/** 폐지 코드 → 후속 코드 (pipeline/regions.py SUCCEEDED_BY와 동기화, regions.test.ts가 검사) */
export const RETIRED_SUCCESSORS: Record<string, string[]> = {
  "28110": ["28125", "28155"],
  "28140": ["28125"],
  "28260": ["28275", "28290"],
  "41190": ["41192", "41194", "41196"],
  "41590": ["41591", "41593", "41595", "41597"],
};

const CITY_BY_PREFIX: Record<string, string> = { "11": "서울", "41": "경기", "28": "인천" };

/** "11680" → "서울 강남구". 모르는 코드는 "" */
export function districtLabel(lawdCd: string): string {
  const name = REGION_NAMES[lawdCd] ?? RETIRED_NAMES[lawdCd];
  const city = CITY_BY_PREFIX[lawdCd.slice(0, 2)];
  return name && city ? `${city} ${name}` : "";
}

/** 구가 있는 경기 시 (짧은 이름 "성남분당" = 시 + 구) */
const GYEONGGI_CITIES_WITH_GU = ["수원", "성남", "안양", "부천", "안산", "고양", "용인", "화성"];
const GYEONGGI_GUN = new Set(["연천", "가평", "양평"]);

/** 정식 시군구 이름. "11680" → "강남구", "41135" → "성남시 분당구", "41800" → "연천군". 모르는 코드는 "" */
export function districtFullName(lawdCd: string): string {
  const name = REGION_NAMES[lawdCd] ?? RETIRED_NAMES[lawdCd];
  if (!name) return "";
  if (!lawdCd.startsWith("41")) return /[구군]$/.test(name) ? name : `${name}구`;
  if (GYEONGGI_GUN.has(name)) return `${name}군`;
  const city = GYEONGGI_CITIES_WITH_GU.find((c) => name.startsWith(c) && name.length > c.length);
  return city ? `${city}시 ${name.slice(city.length)}구` : `${name}시`;
}

export type RegionRoute = { kind: "ok"; code: string } | { kind: "redirect"; code: string } | { kind: "notFound" };

/** /region/[code] 처리: 현행 → ok, 폐지 → 첫 후속 코드로 리다이렉트, 그 외 → notFound */
export function resolveRegionCode(code: string): RegionRoute {
  if (REGION_NAMES[code]) return { kind: "ok", code };
  const next = RETIRED_SUCCESSORS[code]?.[0];
  return next ? { kind: "redirect", code: next } : { kind: "notFound" };
}

/** /browse 시도 탭 링크. 한글 도시명은 인코딩한다. */
export function browseHref(city: string): string {
  return `/browse?city=${encodeURIComponent(city)}`;
}

/** 시군구 페이지 링크 */
export const regionHref = (code: string): string => `/region/${code}`;

export const CITIES = ["서울", "경기", "인천"] as const;
