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
  permanentRedirect: (to: string) => {
    throw new Error(`PERMANENT:${to}`);
  },
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

describe("합쳐져 사라진 단지", () => {
  test("trade.json 이 moved_to 면 남은 단지로 영구 이동", async () => {
    fetchAptTrade.mockResolvedValue({ moved_to: 3 });
    await expect(page.default({ params: Promise.resolve({ id: "7" }) })).rejects.toThrow("PERMANENT:/apartment/3");
  });
  test("메타데이터는 noindex", async () => {
    fetchAptTrade.mockResolvedValue({ moved_to: 3 });
    const layout = await import("../apartment/[id]/layout");
    const m = await layout.generateMetadata({ params: Promise.resolve({ id: "7" }) });
    expect(m.robots).toMatchObject({ index: false });
  });
});

describe("취소만 있는 단지", () => {
  test("정상 거래가 없어도 취소 목록(#canceled)이 렌더되고 알림이 같은 탭을 가리킨다", async () => {
    fetchAptTrade.mockResolvedValue({
      ...trade,
      transactions: [{ id: 9, amount: 100000, area: 84.9, floor: 3, deal_date: "2026-03-01", cancel_date: "2026-04-01" }],
    });
    const { container } = render(await page.default({ params: Promise.resolve({ id: "7" }) }));
    expect(screen.getByText("매매 거래가 없습니다")).toBeInTheDocument();
    expect(container.querySelector("section#canceled")).not.toBeNull();
    expect(container.querySelector('a[href="?tab=trade#canceled"]')).not.toBeNull();
  });
});

describe("위치 지도", () => {
  test("좌표가 있으면 위치 섹션과 /map?lat&lng&level=4 링크", async () => {
    const apt = { ...apartment, lat: 37.4979, lng: 127.0276 };
    fetchAptTrade.mockResolvedValue({ ...trade, apartment: apt });
    render(await page.default({ params: Promise.resolve({ id: "7" }) }));
    expect(screen.getByRole("heading", { name: "위치" })).toBeInTheDocument();
    const pill = screen.getByRole("link", { name: "주변 단지 지도로 ›" });
    expect(pill).toHaveAttribute("href", "/map?lat=37.4979&lng=127.0276&level=4");
  });

  test("좌표가 없으면 아무것도 그리지 않는다", async () => {
    render(await page.default({ params: Promise.resolve({ id: "7" }) }));
    expect(screen.queryByRole("heading", { name: "위치" })).toBeNull();
    expect(screen.queryByText("주변 단지 지도로 ›")).toBeNull();
  });
});
