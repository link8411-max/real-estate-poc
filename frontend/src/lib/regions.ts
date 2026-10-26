/** /browse 링크. 한글 도시명은 인코딩한다. */
export function browseHref(city: string, region?: string): string {
  const q = `city=${encodeURIComponent(city)}`;
  return `/browse?${region ? `${q}&region=${region}` : q}`;
}

export const CITIES = ["서울", "경기", "인천"] as const;
