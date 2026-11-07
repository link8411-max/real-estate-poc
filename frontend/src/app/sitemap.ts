import type { MetadataRoute } from "next";
import { fetchJson, fetchMeta, fetchSitemapIndex } from "@/lib/data";
import { REGION_NAMES } from "@/lib/regionNames";
import { regionHref } from "@/lib/regions";
import { dongHref, SITE_URL } from "@/lib/seo";
import type { SearchIndexRow } from "@/lib/types";

/** 사이트맵 한 파일 한도(50,000) 안쪽 */
const MAX_APARTMENT_URLS = 45_000;

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // fetch의 기본 revalidate(10분)가 페이지 설정보다 짧아 하루로 맞춘다.
  const init = { next: { revalidate } } as RequestInit;
  const [rows, meta, smRows] = await Promise.all([
    // fetchSearchIndex()와 같은 파일
    fetchJson<SearchIndexRow[]>("/v1/search/index.json", init),
    fetchMeta(init),
    fetchSitemapIndex(init), // 단지별 마지막 데이터 변경일. 없으면(null) 전부 data_updated_at
  ]);
  const lastModified = meta?.data_updated_at;
  const aptDate = new Map<number, string>();
  for (const [id, d] of smRows ?? []) if (d) aptDate.set(id, d);
  // 날짜는 YYYY-MM-DD 라 문자열 비교가 곧 날짜 비교
  const maxDate = (a: string | undefined, b: string | undefined) => (a && b ? (a > b ? a : b) : (a ?? b));
  const regionDate = new Map<string, string>();
  const dongDate = new Map<string, string>();

  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/browse`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/map`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/stats`, lastModified, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/canceled`, lastModified, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/highs`, lastModified, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/redevelopment`, changeFrequency: "weekly", priority: 0.6 },
  ];
  // 현행 83개 시군구 (폐지 코드는 후속 지역으로 리다이렉트되므로 넣지 않는다)
  // 동·시군구 날짜 = 소속 단지 날짜의 최댓값 (단지 URL 한도와 무관하게 색인 전체로 계산)
  for (const [id, , dong, lawd] of rows ?? []) {
    const d = aptDate.get(id);
    if (!d || !REGION_NAMES[lawd]) continue;
    regionDate.set(lawd, maxDate(regionDate.get(lawd), d)!);
    if (dong) {
      const href = dongHref(lawd, dong);
      dongDate.set(href, maxDate(dongDate.get(href), d)!);
    }
  }
  for (const code of Object.keys(REGION_NAMES)) {
    pages.push({ url: `${SITE_URL}${regionHref(code)}`, lastModified: regionDate.get(code) ?? lastModified, changeFrequency: "daily", priority: 0.7 });
  }
  // 동 페이지: 검색 색인의 (현행 시군구, 동) 쌍. 폐지 코드·빈 동은 제외
  const dongs = new Set<string>();
  for (const [, , dong, lawd] of rows ?? []) {
    if (dong && REGION_NAMES[lawd]) dongs.add(dongHref(lawd, dong));
  }
  for (const href of dongs) {
    pages.push({ url: `${SITE_URL}${href}`, lastModified: dongDate.get(href) ?? lastModified, changeFrequency: "weekly", priority: 0.6 });
  }
  for (const [id] of (rows ?? []).slice(0, MAX_APARTMENT_URLS)) {
    pages.push({ url: `${SITE_URL}/apartment/${id}`, lastModified: aptDate.get(id) ?? lastModified, changeFrequency: "weekly", priority: 0.5 });
  }
  return pages;
}
