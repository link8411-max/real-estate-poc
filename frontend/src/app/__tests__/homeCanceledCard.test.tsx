import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { CanceledHigh } from "@/lib/types";

const fetchCanceledRecent = vi.fn();
const fetchStats = vi.fn();
vi.mock("@/lib/data", () => ({ fetchStats: () => fetchStats(), fetchCanceledRecent: (...a: unknown[]) => fetchCanceledRecent(...a), fetchHighsRecent: () => Promise.resolve(null) }));
vi.mock("@/components/SearchBox", () => ({ default: () => null }));
vi.mock("@/components/RecentDeals", () => ({ default: () => null }));
vi.mock("@/lib/metrics", () => ({ kstToday: () => "2026-11-04" }));
const { default: Home } = await import("../page");

const mk = (n: number, cancel_date: string): CanceledHigh => ({
  tx_id: n, apt_id: n, apt_name: "단지", region_name: "강남구", city: "서울", area: 84, area_group: 84, floor: 3,
  amount: 2, prev_max: 1, jump: 1, deal_date: "2026-10-01", cancel_date, days_to_cancel: 1,
});
const stats = { total_apartments: 1, recent_transactions_30d: 1, data_range: { max_date: "2026-11-01" }, regions: [], recent: [] };

beforeEach(() => {
  fetchCanceledRecent.mockReset();
  fetchStats.mockResolvedValue(stats);
});

test("카드 표시: 라벨과 건수, 3600 revalidate", async () => {
  fetchCanceledRecent.mockResolvedValue({ items: [1, 2, 3].map((n) => mk(n, "2026-11-03")) });
  render(await Home());
  expect(screen.getByText("최근 7일 취소된 신고가")).toBeInTheDocument();
  expect(screen.getByText("3건")).toBeInTheDocument();
  expect(fetchCanceledRecent).toHaveBeenCalledWith({ next: { revalidate: 3600 } });
});

test("7일 3건 미만이면 30일 창", async () => {
  fetchCanceledRecent.mockResolvedValue({ items: [mk(1, "2026-10-20")] });
  render(await Home());
  expect(screen.getByText("최근 30일 취소된 신고가")).toBeInTheDocument();
  expect(screen.getByText("1건")).toBeInTheDocument();
});

test("데이터 없음/throw/30일 0건이면 숨김", async () => {
  for (const setup of [
    () => fetchCanceledRecent.mockResolvedValue(null),
    () => fetchCanceledRecent.mockRejectedValue(new Error("x")),
    () => fetchCanceledRecent.mockResolvedValue({ items: [] }),
  ]) {
    setup();
    const { unmount } = render(await Home());
    expect(screen.queryByText(/취소된 신고가/)).toBeNull();
    unmount();
  }
});

test("items 없는 깨진 recent.json 이어도 던지지 않고 숨김", async () => {
  for (const v of [{}, { items: null }, { items: "x" }]) {
    fetchCanceledRecent.mockResolvedValue(v);
    const { unmount } = render(await Home());
    expect(screen.queryByText(/취소된 신고가/)).toBeNull();
    unmount();
  }
});

test("미니 지도 카드: /map 링크와 알약 문구, 히어로 버튼 유지", async () => {
  fetchCanceledRecent.mockResolvedValue(null);
  render(await Home());
  const pill = screen.getByRole("link", { name: "⤢ 지도 크게 보기" });
  expect(pill).toHaveAttribute("href", "/map");
  expect(screen.getByRole("link", { name: "지도에서 찾기" })).toHaveAttribute("href", "/map");
  expect(screen.getByTestId("mini-map-card").className).toContain("h-[180px]");
});
