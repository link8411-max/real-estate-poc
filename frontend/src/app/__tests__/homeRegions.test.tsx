import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/lib/data", () => ({
  fetchStats: () => Promise.resolve(null),
  fetchCanceledRecent: () => Promise.resolve(null),
  fetchHighsRecent: () => Promise.resolve(null),
}));
vi.mock("@/components/SearchBox", () => ({ default: () => null }));
vi.mock("@/components/RecentDeals", () => ({ default: () => null }));
const { default: Home } = await import("../page");

test("통계가 없어도 시군구 링크 83개(서울·경기·인천 순, 도시 안은 코드순)", async () => {
  const { container } = render(await Home());
  const links = [...container.querySelectorAll('a[href^="/region/"]')];
  expect(links).toHaveLength(83);
  const hrefs = links.map((a) => a.getAttribute("href"));
  expect(hrefs[0]).toBe("/region/11110");
  expect(hrefs.indexOf("/region/41111")).toBeGreaterThan(hrefs.indexOf("/region/11740"));
  expect(hrefs.indexOf("/region/28125")).toBeGreaterThan(hrefs.indexOf("/region/41830"));
  expect(screen.getByRole("link", { name: "성남시 분당구" })).toHaveAttribute("href", "/region/41135");
  expect(screen.getByRole("link", { name: "강남구" })).toHaveAttribute("href", "/region/11680");
  expect(screen.getByRole("link", { name: "연천군" })).toHaveAttribute("href", "/region/41800");
});
