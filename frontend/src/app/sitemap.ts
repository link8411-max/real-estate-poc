import type { MetadataRoute } from "next";
import { fetchJson, fetchMeta } from "@/lib/data";
import { REGION_NAMES } from "@/lib/regionNames";
import { regionHref } from "@/lib/regions";
import { SITE_URL } from "@/lib/seo";
import type { SearchIndexRow } from "@/lib/types";

/** 사이트맵 한 파일 한도(50,000) 안쪽 */
const MAX_APARTMENT_URLS = 45_000;

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // fetch의 기본 revalidate(10분)가 페이지 설정보다 짧아 하루로 맞춘다.
  const init = { next: { revalidate } } as RequestInit;
  const [rows, meta] = await Promise.all([
    // fetchSearchIndex()와 같은 파일
    fetchJson<SearchIndexRow[]>("/v1/search/index.json", init),
    fetchMeta(init),
  ]);
  const lastModified = meta?.data_updated_at;

  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/browse`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/map`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/stats`, changeFrequency: "daily", priority: 0.6 },
  ];
  // 현행 83개 시군구 (폐지 코드는 후속 지역으로 리다이렉트되므로 넣지 않는다)
  for (const code of Object.keys(REGION_NAMES)) {
    pages.push({ url: `${SITE_URL}${regionHref(code)}`, lastModified, changeFrequency: "daily", priority: 0.7 });
  }
  for (const [id] of (rows ?? []).slice(0, MAX_APARTMENT_URLS)) {
    pages.push({ url: `${SITE_URL}/apartment/${id}`, lastModified, changeFrequency: "weekly", priority: 0.5 });
  }
  return pages;
}
