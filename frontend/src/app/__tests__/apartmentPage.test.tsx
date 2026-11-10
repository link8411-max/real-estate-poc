import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AptRent, AptTrade, RegionApartment } from "@/lib/types";

const fetchAptTrade = vi.fn();
const fetchAptRent = vi.fn();
const fetchRegion = vi.fn();
vi.mock("@/lib/data", () => ({
  fetchAptTrade: (...a: unknown[]) => fetchAptTrade(...a),
  fetchAptRent: (...a: unknown[]) => fetchAptRent(...a),
  fetchRegion: (...a: unknown[]) => fetchRegion(...a),
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

const ra = (id: number, dong: string, over: Partial<RegionApartment> = {}): RegionApartment => ({
  id, name: `단지${id}`, dong, build_year: 2000, trade_count: 10, latest_trade_amount: 100000,
  latest_trade_date: "2026-03-01", latest_jeonse_deposit: null, lat: null, lng: null, ...over,
});
const regionFile = (apartments: RegionApartment[]) => ({ code: "11680", name: "강남구", city: "서울", succeeded_by: null, apartments });
const nearbyHrefs = (c: HTMLElement) => [...c.querySelectorAll('a[href^="/apartment/"]')].map((a) => a.getAttribute("href"));

beforeEach(() => {
  fetchRegion.mockReset();
  fetchRegion.mockResolvedValue(regionFile([]));
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

  test("첫 문단은 하나의 <p> 안에 완결된 소개 문장", async () => {
    render(await page.default({ params: Promise.resolve({ id: "7" }) }));
    const p = screen.getByText(/에 있는 조용한 단지는 2000년 준공 아파트로/);
    expect(p.tagName).toBe("P");
    expect(p.textContent).toBe(
      "서울 강남구 개포동에 있는 조용한 단지는 2000년 준공 아파트로, 최근 매매는 전용 84㎡·25평 10억원(2026-03-01)입니다. 1개 평형의 실거래가와 전세·월세 내역을 볼 수 있습니다.",
    );
  });

  test("같은 동 다른 단지: 서버 HTML 에 /apartment/N 링크가 있고 자기 자신은 없다", async () => {
    fetchRegion.mockResolvedValue(regionFile([
      ra(7, "개포동"), ra(8, "개포동", { latest_trade_date: "2026-02-01" }), ra(9, "개포동", { latest_trade_date: "2026-03-05" }),
      ra(10, "개포동"), ra(11, "대치동", { trade_count: 99 }),
    ]));
    const { container } = render(await page.default({ params: Promise.resolve({ id: "7" }) }));
    expect(screen.getByRole("heading", { name: "같은 동 다른 단지" })).toBeInTheDocument();
    const hrefs = nearbyHrefs(container);
    expect(hrefs).toEqual(expect.arrayContaining(["/apartment/8", "/apartment/9", "/apartment/10"]));
    expect(hrefs).not.toContain("/apartment/7");
    expect(hrefs).not.toContain("/apartment/11"); // 같은 동이 3개 이상이면 다른 동으로 채우지 않는다
    expect(container.querySelector(`a[href="/region/11680/${encodeURIComponent("개포동")}"]`)).not.toBeNull();
    expect(container.querySelector('a[href="/region/11680"]')).not.toBeNull();
  });

  test("같은 동이 3개 미만이면 시군구 단지(거래 많은 순)로 12개까지 채운다", async () => {
    fetchRegion.mockResolvedValue(regionFile([
      ra(7, "개포동"), ra(8, "개포동"),
      ...Array.from({ length: 20 }, (_, i) => ra(100 + i, "대치동", { trade_count: i })),
    ]));
    const { container } = render(await page.default({ params: Promise.resolve({ id: "7" }) }));
    const hrefs = nearbyHrefs(container);
    expect(hrefs).toHaveLength(12);
    expect(hrefs).toContain("/apartment/8");
    expect(hrefs).toContain("/apartment/119"); // 거래 가장 많은 단지
    expect(hrefs).not.toContain("/apartment/100");
    expect(screen.getByRole("heading", { name: "강남구 다른 단지" })).toBeInTheDocument();
  });

  test("지역 JSON 이 없으면 섹션만 빠지고 페이지는 정상", async () => {
    fetchRegion.mockResolvedValue(null);
    const { container } = render(await page.default({ params: Promise.resolve({ id: "7" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "조용한 단지" })).toBeInTheDocument();
    expect(nearbyHrefs(container)).toEqual([]);
    expect(screen.queryByRole("heading", { name: /다른 단지/ })).toBeNull();
  });

  test("ISR: 단지 revalidate 86400(지역은 3600) + 빈 generateStaticParams", () => {
    expect(page.revalidate).toBe(86400);
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
