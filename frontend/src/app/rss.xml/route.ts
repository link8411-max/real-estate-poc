import { fetchCanceledRecent } from "@/lib/data";
import { fetchHighItems } from "@/lib/highs";
import { buildRss } from "@/lib/rss";
import { SITE_URL } from "@/lib/seo";
import type { CanceledHigh } from "@/lib/types";

export const revalidate = 3600;

async function fetchCanceledItems(init: RequestInit): Promise<CanceledHigh[]> {
  try {
    const file = await fetchCanceledRecent(init);
    return Array.isArray(file?.items) ? file.items : [];
  } catch {
    return [];
  }
}

export async function GET(): Promise<Response> {
  // fetch의 기본 revalidate(10분)가 라우트 설정보다 짧아 1시간으로 맞춘다(sitemap.ts 와 같은 방식).
  const init = { next: { revalidate } } as RequestInit;
  const [highs, canceled] = await Promise.all([fetchHighItems(init), fetchCanceledItems(init)]);
  return new Response(buildRss(highs, canceled, SITE_URL, new Date()), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
