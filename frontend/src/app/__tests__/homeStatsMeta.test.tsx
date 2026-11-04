import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/lib/data", () => ({
  fetchStats: async () => null,
  fetchCanceledRecent: async () => null,
  fetchHighsRecent: async () => null,
}));
vi.mock("@/components/MiniMap", () => ({ default: () => null }));
vi.mock("@/components/RecentDeals", () => ({ default: () => null }));
vi.mock("@/components/SearchBox", () => ({ default: () => null }));

test("홈: 제목(absolute)과 WebSite JSON-LD", async () => {
  const home = await import("../page");
  expect(home.metadata.title).toEqual({ absolute: "집시세 - 수도권 아파트 실거래가·신고가 조회" });
  const { container } = render(await home.default());
  const ld = [...container.querySelectorAll('script[type="application/ld+json"]')].map((n) => JSON.parse(n.textContent ?? ""));
  const site = ld.find((d) => d["@type"] === "WebSite");
  expect(site).toMatchObject({ name: "집시세", alternateName: "zipsise" });
  expect(site.potentialAction.target.urlTemplate).toMatch(/\/search\?q=\{search_term_string\}$/);
});

test("루트 레이아웃: 제목 템플릿·og:site_name", async () => {
  const { metadata } = await import("../layout");
  expect(metadata.title).toMatchObject({ template: "%s | 집시세" });
  expect(metadata.openGraph).toMatchObject({ siteName: "집시세" });
});

test("/stats 는 홈과 다른 자체 설명", async () => {
  const { metadata } = await import("../stats/page");
  expect(metadata.description).toBe("수도권 시군구별 아파트 실거래 평균가, 1년 거래량, 전년 대비 변동률 순위.");
});
