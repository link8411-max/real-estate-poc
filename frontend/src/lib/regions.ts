import { REGION_NAMES } from "./regionNames";

/** 폐지 코드(아직 색인에 남은 단지용) → 옛 이름 */
const RETIRED_NAMES: Record<string, string> = {
  "28110": "중구",
  "28140": "동구",
  "28260": "서구",
  "41190": "부천",
  "41590": "화성",
};

const CITY_BY_PREFIX: Record<string, string> = { "11": "서울", "41": "경기", "28": "인천" };

/** "11680" → "서울 강남구". 모르는 코드는 "" */
export function districtLabel(lawdCd: string): string {
  const name = REGION_NAMES[lawdCd] ?? RETIRED_NAMES[lawdCd];
  const city = CITY_BY_PREFIX[lawdCd.slice(0, 2)];
  return name && city ? `${city} ${name}` : "";
}

/** /browse 링크. 한글 도시명은 인코딩한다. */
export function browseHref(city: string, region?: string): string {
  const q = `city=${encodeURIComponent(city)}`;
  return `/browse?${region ? `${q}&region=${region}` : q}`;
}

export const CITIES = ["서울", "경기", "인천"] as const;
