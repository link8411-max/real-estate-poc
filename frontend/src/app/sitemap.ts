import type { MetadataRoute } from "next";
import { fetchJson } from "@/lib/data";
import type { SearchIndexRow } from "@/lib/types";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sudogwon.com";
/** 사이트맵 한 파일 한도(50,000) 안쪽 */
const MAX_APARTMENT_URLS = 45_000;

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/browse`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/stats`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/search`, changeFrequency: "weekly", priority: 0.5 },
  ];
  // fetchSearchIndex()와 같은 파일. fetch의 기본 revalidate(10분)가 페이지 설정보다 짧아 하루로 맞춘다.
  const rows = (await fetchJson<SearchIndexRow[]>("/v1/search/index.json", { next: { revalidate } } as RequestInit)) ?? [];
  for (const [id] of rows.slice(0, MAX_APARTMENT_URLS)) {
    pages.push({ url: `${SITE_URL}/apartment/${id}`, changeFrequency: "weekly", priority: 0.5 });
  }
  return pages;
}
