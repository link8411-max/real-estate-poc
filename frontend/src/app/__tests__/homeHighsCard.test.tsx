import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const fetchHighsRecent = vi.fn();
const fetchStats = vi.fn();
vi.mock("@/lib/data", () => ({
  fetchStats: () => fetchStats(),
  fetchCanceledRecent: () => Promise.resolve(null),
  fetchHighsRecent: (...a: unknown[]) => fetchHighsRecent(...a),
}));
vi.mock("@/components/SearchBox", () => ({ default: () => null }));
vi.mock("@/components/RecentDeals", () => ({ default: () => null }));
const { default: Home } = await import("../page");

const stats = { total_apartments: 1, recent_transactions_30d: 1, data_range: { max_date: "2026-11-01" }, regions: [], recent: [] };
beforeEach(() => {
  fetchHighsRecent.mockReset();
  fetchStats.mockResolvedValue(stats);
});

test("카드: 건수와 /highs 링크, 3600 revalidate", async () => {
  fetchHighsRecent.mockResolvedValue({ items: [{}, {}, {}] });
  render(await Home());
  const link = screen.getByRole("link", { name: /3건.*최근 30일 신고가/ });
  expect(link).toHaveAttribute("href", "/highs");
  expect(fetchHighsRecent).toHaveBeenCalledWith({ next: { revalidate: 3600 } });
});

test("데이터 없음/throw/0건/깨진 JSON 이면 숨김", async () => {
  for (const setup of [
    () => fetchHighsRecent.mockResolvedValue(null),
    () => fetchHighsRecent.mockRejectedValue(new Error("x")),
    () => fetchHighsRecent.mockResolvedValue({ items: [] }),
    () => fetchHighsRecent.mockResolvedValue({ items: "x" }),
  ]) {
    setup();
    const { unmount } = render(await Home());
    expect(screen.queryByText(/최근 30일 신고가/)).toBeNull();
    unmount();
  }
});
