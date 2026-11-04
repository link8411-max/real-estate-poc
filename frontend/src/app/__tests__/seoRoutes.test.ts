import { beforeEach, describe, expect, test, vi } from "vitest";
import { SITE_URL } from "@/lib/seo";
import type { SearchIndexRow } from "@/lib/types";

const fetchJson = vi.fn();
const fetchMeta = vi.fn();
vi.mock("@/lib/data", () => ({ fetchJson: (...a: unknown[]) => fetchJson(...a), fetchMeta: (...a: unknown[]) => fetchMeta(...a) }));

const { default: sitemap } = await import("../sitemap");
const { default: robots } = await import("../robots");

const rows = (n: number): SearchIndexRow[] => Array.from({ length: n }, (_, i) => [i + 1, `단지${i}`, "동", "11680", 2000]);

beforeEach(() => {
  fetchJson.mockReset();
  fetchMeta.mockReset();
  fetchMeta.mockResolvedValue({ data_updated_at: "2026-10-26T16:15:45+00:00" });
});

describe("sitemap", () => {
  test("정적 페이지 + 83개 지역 + 단지, 단지 lastModified는 데이터 기준일", async () => {
    fetchJson.mockResolvedValue(rows(3));
    const urls = await sitemap();
    const regions = urls.filter((u) => u.url.startsWith(`${SITE_URL}/region/`) && !/\/region\/\d+\/./.test(u.url));
    expect(regions).toHaveLength(83);
    expect(regions.map((u) => u.url)).toContain(`${SITE_URL}/region/11680`);
    expect(regions.map((u) => u.url)).not.toContain(`${SITE_URL}/region/28260`);
    const apts = urls.filter((u) => u.url.startsWith(`${SITE_URL}/apartment/`));
    expect(apts.map((u) => u.url)).toEqual([1, 2, 3].map((i) => `${SITE_URL}/apartment/${i}`));
    expect(apts[0].lastModified).toBe("2026-10-26T16:15:45+00:00");
    expect(urls.map((u) => u.url)).toEqual(expect.arrayContaining([`${SITE_URL}/`, `${SITE_URL}/browse`, `${SITE_URL}/map`, `${SITE_URL}/stats`, `${SITE_URL}/canceled`, `${SITE_URL}/highs`]));
    expect(urls.some((u) => u.url.includes("/search") || u.url.includes("/compare"))).toBe(false);
  });

  test("동 URL: 색인의 (현행 지역, 동) 쌍을 중복 없이, 인코딩해서", async () => {
    const idx: SearchIndexRow[] = [
      [1, "a", "역삼동", "11680", 2000],
      [2, "b", "역삼동", "11680", 2001],
      [3, "c", "중앙동(1)", "41463", 2002],
      [4, "d", "옛동", "28260", 2002], // 폐지 코드는 제외
      [5, "e", "", "11680", 2002], // 동 없음
    ];
    fetchJson.mockResolvedValue(idx);
    const urls = (await sitemap()).map((u) => u.url);
    const dongs = urls.filter((u) => /\/region\/\d+\/./.test(u));
    expect(dongs).toEqual([`${SITE_URL}/region/11680/${encodeURIComponent("역삼동")}`, `${SITE_URL}/region/41463/${encodeURIComponent("중앙동(1)")}`]);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  test("단지 URL은 45,000개까지", async () => {
    fetchJson.mockResolvedValue(rows(46_000));
    const urls = await sitemap();
    expect(urls.filter((u) => u.url.includes("/apartment/"))).toHaveLength(45_000);
  });

  test("색인·메타가 없어도 정적+지역은 나온다", async () => {
    fetchJson.mockResolvedValue(null);
    fetchMeta.mockResolvedValue(null);
    const urls = await sitemap();
    expect(urls.filter((u) => u.url.includes("/region/"))).toHaveLength(83);
    expect(urls.some((u) => u.url.includes("/apartment/"))).toBe(false);
  });
});

describe("robots", () => {
  test("API만 차단(검색·비교는 noindex 메타로), OG 이미지는 허용, 사이트맵은 SITE_URL 기준", () => {
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", allow: ["/", "/api/og/"], disallow: ["/api/"] });
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
