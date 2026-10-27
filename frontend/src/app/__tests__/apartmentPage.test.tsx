import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AptRent, AptTrade } from "@/lib/types";

const fetchAptTrade = vi.fn();
const fetchAptRent = vi.fn();
vi.mock("@/lib/data", () => ({
  fetchAptTrade: (...a: unknown[]) => fetchAptTrade(...a),
  fetchAptRent: (...a: unknown[]) => fetchAptRent(...a),
}));
vi.mock("@/components/PriceChart", () => ({ default: () => <div>chart</div> }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  permanentRedirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/apartment/7",
  useSearchParams: () => new URLSearchParams(),
}));

const page = await import("../apartment/[id]/page");
const regionPage = await import("../region/[code]/page");

const apartment = {
  id: 7, name: "조용한 단지", dong: "개포동", lawd_cd: "11680", region_name: "서울 강남구", city: "서울",
  jibun: "1", build_year: 2000, apt_seq: null, lat: null, lng: null,
};

const trade: AptTrade = {
  apartment,
  area_stats: [{ area: 84, count: 1, max_amount: 100000, min_amount: 100000, avg_amount: 100000, latest_amount: 100000,
    latest_date: "2026-03-01", recent_avg: 100000, recent_count: 1, peak_date: "2026-03-01" }],
  // 내보낸 날(2026-03-02) 기준 값: 1일 전 거래 → 배지 없음. 오늘 기준이면 거래 없음 배지가 떠야 한다.
  metrics: { recovery_rate: 100, peak_date: "2026-03-01", days_since_last_tx: 1 },
  transactions: [{ id: 1, amount: 100000, area: 84.9, floor: 3, deal_date: "2026-03-01", cancel_date: null }],
};
const rent: AptRent = { apartment, rent_area_stats: [], rents: [] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T16:00:00Z")); // KST 2026-10-27 01:00
  fetchAptTrade.mockResolvedValue(trade);
  fetchAptRent.mockResolvedValue(rent);
});
afterEach(() => vi.useRealTimers());

describe("apartment 페이지", () => {
  test("배지는 내보낸 날이 아니라 오늘(KST) 기준으로 계산된다", async () => {
    render(await page.default({ params: Promise.resolve({ id: "7" }) }));
    expect(screen.getByText("거래 없음 240일")).toBeInTheDocument(); // 03-01 → 10-27 (KST)
  });

  test("ISR: revalidate 3600 + 빈 generateStaticParams", () => {
    expect(page.revalidate).toBe(3600);
    expect(page.generateStaticParams()).toEqual([]);
    expect(regionPage.revalidate).toBe(3600);
    expect(regionPage.generateStaticParams()).toEqual([]);
  });
});
