import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SAMPLE_FILE, SAMPLE_ZONES } from "@/test/zones.fixture";
import type { AptRent, AptTrade, RegionFile } from "@/lib/types";

const fetchZones = vi.fn();
const fetchAptTrade = vi.fn();
const fetchAptRent = vi.fn();
const fetchRegion = vi.fn();
const fetchStats = vi.fn();
vi.mock("@/lib/data", () => ({
  fetchZones: (...a: unknown[]) => fetchZones(...a),
  fetchAptTrade: (...a: unknown[]) => fetchAptTrade(...a),
  fetchAptRent: (...a: unknown[]) => fetchAptRent(...a),
  fetchRegion: (...a: unknown[]) => fetchRegion(...a),
  fetchStats: (...a: unknown[]) => fetchStats(...a),
  fetchHighsRecent: () => Promise.resolve(null),
  fetchCanceledRecent: () => Promise.resolve(null),
}));
vi.mock("@/components/PriceChart", () => ({ default: () => <div>chart</div> }));
vi.mock("@/components/SearchBox", () => ({ default: () => null }));
vi.mock("@/components/RecentDeals", () => ({ default: () => null }));
vi.mock("@/components/MiniMap", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  permanentRedirect: (to: string) => {
    throw new Error(`PERMANENT:${to}`);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const aptPage = await import("../apartment/[id]/page");
const regionPage = await import("../region/[code]/page");
const { default: Home } = await import("../page");

const apartment = {
  id: 101, name: "은마", dong: "대치동", lawd_cd: "11680", region_name: "서울 강남구", city: "서울",
  jibun: "1", build_year: 1979, apt_seq: null, lat: null, lng: null,
};
const trade: AptTrade = { apartment, area_stats: [], metrics: {}, transactions: [] };
const rent: AptRent = { apartment, rent_area_stats: [], rents: [] };
const region: RegionFile = { code: "11680", name: "강남", city: "서울", succeeded_by: null, apartments: [] };

beforeEach(() => {
  for (const f of [fetchZones, fetchAptTrade, fetchAptRent, fetchRegion, fetchStats]) f.mockReset();
  fetchAptTrade.mockResolvedValue(trade);
  fetchAptRent.mockResolvedValue(rent);
  fetchRegion.mockResolvedValue(region);
  fetchStats.mockResolvedValue({ total_apartments: 1, recent_transactions_30d: 1, data_range: { max_date: "2026-11-01" }, regions: [], recent: [] });
});
afterEach(cleanup);

describe("단지 페이지 배지", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  test("매칭된 구역이 있으면 '재건축 · 단계' 배지, 구역 앵커로 링크", async () => {
    fetchZones.mockResolvedValue(SAMPLE_FILE);
    render(await aptPage.default(params("101")));
    const a = screen.getByRole("link", { name: "재건축 · 조합설립인가" });
    expect(a.getAttribute("href")).toBe("/redevelopment#zone-z001");
  });
  test("매칭 없음·파일 없음·throw 면 배지 없이 정상 렌더", async () => {
    for (const setup of [() => fetchZones.mockResolvedValue(SAMPLE_FILE), () => fetchZones.mockResolvedValue(null), () => fetchZones.mockRejectedValue(new Error("x"))]) {
      setup();
      fetchAptTrade.mockResolvedValue({ ...trade, apartment: { ...apartment, id: 999 } });
      const { unmount } = render(await aptPage.default(params("999")));
      expect(screen.queryByText(/재건축 ·/)).toBeNull();
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
      unmount();
    }
  });
});

describe("지역 페이지 정비사업 섹션", () => {
  const params = { params: Promise.resolve({ code: "11680" }) };
  test("해당 지역(lawd_cd) 구역만", async () => {
    fetchZones.mockResolvedValue(SAMPLE_FILE);
    render(await regionPage.default(params));
    const sec = screen.getByLabelText("정비사업");
    expect(sec.textContent).toContain("은마구역");
    expect(sec.textContent).not.toContain("한남3구역");
  });
  test("파일이 없으면 섹션 없이 정상 렌더", async () => {
    fetchZones.mockResolvedValue(null);
    render(await regionPage.default(params));
    expect(screen.queryByLabelText("정비사업")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });
});

describe("홈 카드", () => {
  test("재건축·재개발 N곳 → /redevelopment", async () => {
    fetchZones.mockResolvedValue(SAMPLE_FILE);
    render(await Home());
    const a = screen.getByRole("link", { name: new RegExp(`재건축·재개발 ${SAMPLE_ZONES.length}곳`) });
    expect(a.getAttribute("href")).toBe("/redevelopment");
  });
  test("데이터 없음·throw·0곳이면 숨김", async () => {
    for (const setup of [() => fetchZones.mockResolvedValue(null), () => fetchZones.mockRejectedValue(new Error("x")), () => fetchZones.mockResolvedValue({ zones: [] })]) {
      setup();
      const { unmount } = render(await Home());
      expect(screen.queryByText(/재건축·재개발/)).toBeNull();
      unmount();
    }
  });
});
