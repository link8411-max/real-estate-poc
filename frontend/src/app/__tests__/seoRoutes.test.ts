import { beforeEach, describe, expect, test, vi } from "vitest";
import { SITE_URL } from "@/lib/seo";
import type { SearchIndexRow, SitemapIndexRow } from "@/lib/types";

const fetchJson = vi.fn();
const fetchMeta = vi.fn();
vi.mock("@/lib/data", () => ({
  fetchJson: (...a: unknown[]) => fetchJson(...a),
  fetchMeta: (...a: unknown[]) => fetchMeta(...a),
  fetchSitemapIndex: (...a: unknown[]) => fetchJson("/v1/sitemap/apartments.json", ...a),
}));

const { default: sitemap } = await import("../sitemap");
const { default: robots } = await import("../robots");

const rows = (n: number): SearchIndexRow[] => Array.from({ length: n }, (_, i) => [i + 1, `단지${i}`, "동", "11680", 2000]);

/** 경로별 응답: 검색 색인·사이트맵 색인 */
const serve = (idx: SearchIndexRow[] | null, sm: SitemapIndexRow[] | null) =>
  fetchJson.mockImplementation(async (path: string) => (path.includes("/sitemap/") ? sm : idx));

beforeEach(() => {
  fetchJson.mockReset();
  fetchMeta.mockReset();
  fetchMeta.mockResolvedValue({ data_updated_at: "2026-10-26T16:15:45+00:00" });
});

describe("sitemap", () => {
  test("정적 페이지 + 83개 지역 + 단지, 단지 lastModified는 데이터 기준일", async () => {
    serve(rows(3), null);
    const urls = await sitemap();
    const regions = urls.filter((u) => u.url.startsWith(`${SITE_URL}/region/`) && !/\/region\/\d+\/./.test(u.url));
    expect(regions).toHaveLength(83);
    expect(regions.map((u) => u.url)).toContain(`${SITE_URL}/region/11680`);
    expect(regions.map((u) => u.url)).not.toContain(`${SITE_URL}/region/28260`);
    const apts = urls.filter((u) => u.url.startsWith(`${SITE_URL}/apartment/`));
    expect(apts.map((u) => u.url)).toEqual([1, 2, 3].map((i) => `${SITE_URL}/apartment/${i}`));
    expect(apts[0].lastModified).toBe("2026-10-26T16:15:45+00:00");
    expect(urls.map((u) => u.url)).toEqual(expect.arrayContaining([`${SITE_URL}/`, `${SITE_URL}/browse`, `${SITE_URL}/map`, `${SITE_URL}/stats`, `${SITE_URL}/canceled`, `${SITE_URL}/highs`, `${SITE_URL}/redevelopment`]));
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
    serve(idx, null);
    const urls = (await sitemap()).map((u) => u.url);
    const dongs = urls.filter((u) => /\/region\/\d+\/./.test(u));
    expect(dongs).toEqual([`${SITE_URL}/region/11680/${encodeURIComponent("역삼동")}`, `${SITE_URL}/region/41463/${encodeURIComponent("중앙동(1)")}`]);
    expect(fetchJson).toHaveBeenCalledTimes(2); // 검색 색인 + 사이트맵 색인
  });

  test("단지 URL은 45,000개까지", async () => {
    serve(rows(46_000), null);
    const urls = await sitemap();
    expect(urls.filter((u) => u.url.includes("/apartment/"))).toHaveLength(45_000);
  });

  test("색인·메타가 없어도 정적+지역은 나온다", async () => {
    serve(null, null);
    fetchMeta.mockResolvedValue(null);
    const urls = await sitemap();
    expect(urls.filter((u) => u.url.includes("/region/"))).toHaveLength(83);
    expect(urls.some((u) => u.url.includes("/apartment/"))).toBe(false);
  });
});

describe("sitemap lastmod", () => {
  const idx: SearchIndexRow[] = [
    [1, "a", "역삼동", "11680", 2000],
    [2, "b", "역삼동", "11680", 2001],
    [3, "c", "개포동", "11680", 2002],
    [4, "d", "아현동", "11440", 2002],
    [5, "e", "아현동", "11440", 2002], // 사이트맵 색인에 없음
  ];
  const sm: SitemapIndexRow[] = [[1, "2026-10-01"], [2, "2026-10-20"], [3, "2026-09-01"], [4, null]];
  const find = (urls: { url: string; lastModified?: unknown }[], path: string) => urls.find((u) => u.url === `${SITE_URL}${path}`);

  test("단지 lastModified는 단지별 날짜, 없으면 데이터 기준일", async () => {
    serve(idx, sm);
    const urls = await sitemap();
    expect(find(urls, "/apartment/1")?.lastModified).toBe("2026-10-01");
    expect(find(urls, "/apartment/2")?.lastModified).toBe("2026-10-20");
    expect(find(urls, "/apartment/4")?.lastModified).toBe("2026-10-26T16:15:45+00:00");
    expect(find(urls, "/apartment/5")?.lastModified).toBe("2026-10-26T16:15:45+00:00");
  });

  test("동·시군구 lastModified는 소속 단지 날짜의 최댓값", async () => {
    serve(idx, sm);
    const urls = await sitemap();
    expect(find(urls, `/region/11680/${encodeURIComponent("역삼동")}`)?.lastModified).toBe("2026-10-20");
    expect(find(urls, `/region/11680/${encodeURIComponent("개포동")}`)?.lastModified).toBe("2026-09-01");
    expect(find(urls, "/region/11680")?.lastModified).toBe("2026-10-20");
    // 소속 단지 날짜가 전부 없으면 데이터 기준일
    expect(find(urls, `/region/11440/${encodeURIComponent("아현동")}`)?.lastModified).toBe("2026-10-26T16:15:45+00:00");
    expect(find(urls, "/region/11440")?.lastModified).toBe("2026-10-26T16:15:45+00:00");
  });

  test("사이트맵 색인 파일이 없으면 전부 데이터 기준일", async () => {
    serve(idx, null);
    const urls = await sitemap();
    for (const p of ["/apartment/1", "/region/11680", `/region/11680/${encodeURIComponent("역삼동")}`, "/", "/highs", "/canceled", "/stats"]) {
      expect(find(urls, p)?.lastModified).toBe("2026-10-26T16:15:45+00:00");
    }
  });

  test("/browse·/map·/redevelopment는 lastModified 생략", async () => {
    serve(idx, sm);
    const urls = await sitemap();
    for (const p of ["/browse", "/map", "/redevelopment"]) expect(find(urls, p)?.lastModified).toBeUndefined();
  });
});

describe("robots", () => {
  test("API만 차단(검색·비교는 noindex 메타로), OG 이미지는 허용, 사이트맵은 SITE_URL 기준", () => {
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", allow: ["/", "/api/og/"], disallow: ["/api/"] });
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe("manifest", () => {
  test("집시세 이름과 192·512 아이콘", async () => {
    const { default: manifest } = await import("../manifest");
    const m = manifest();
    expect(m.short_name).toBe("집시세");
    expect(m.icons?.map((i) => i.sizes)).toEqual(["192x192", "512x512"]);
  });
});
