import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setShareHighsEnabledForTest } from "@/lib/highShare";
import type { AptTrade } from "@/lib/types";

const fetchAptTrade = vi.fn();
vi.mock("@/lib/data", () => ({ fetchAptTrade: (...a: unknown[]) => fetchAptTrade(...a) }));
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
const permanentRedirect = vi.fn((to: string) => {
  throw new Error(`PERMANENT:${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to), permanentRedirect: (to: string) => permanentRedirect(to) }));
vi.mock("@/components/ShareButton", () => ({ default: () => <button>공유</button> }));

const page = await import("../page");

const apartment = {
  id: 1554, name: "래미안", dong: "개포동", lawd_cd: "11680", region_name: "서울 강남구", city: "서울",
  jibun: "1", build_year: 2000, apt_seq: null, lat: null, lng: null, area_types: [],
};
const share = { badge: "high" as const, base: 90000, diff: 10000, pct: 11.1, shareable: true, held: false };
const trade = (deal: string): AptTrade => ({
  apartment,
  area_stats: [],
  metrics: {},
  transactions: [
    { id: 9, amount: 100000, area: 84.97, floor: 7, deal_date: deal, cancel_date: null, grp: 84, share },
    { id: 8, amount: 60000, area: 59.9, floor: 3, deal_date: "2026-09-01", cancel_date: null, grp: 59 },
    { id: 1, amount: 90000, area: 85.01, floor: 5, deal_date: "2026-03-01", cancel_date: null, grp: 84 },
  ],
});
const props = (aptId: string, txId: string) => ({ params: Promise.resolve({ aptId, txId }) });

beforeEach(() => {
  fetchAptTrade.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T03:00:00Z"));
  setShareHighsEnabledForTest(true);
});
afterEach(() => {
  vi.useRealTimers();
  setShareHighsEnabledForTest(false);
});

describe("신고가 공유 페이지", () => {
  test("moved apartment → 남은 단지 주소로 영구 이동", async () => {
    fetchAptTrade.mockResolvedValue({ moved_to: 42 });
    await expect(page.default(props("1554", "9"))).rejects.toThrow("PERMANENT:/highs/42/9");
  });

  test("최근 신고가: 카드·공유 버튼·다른 평형 최근 거래·단지 전체 보기", async () => {
    fetchAptTrade.mockResolvedValue(trade("2026-11-01"));
    render(await page.default(props("1554", "9")));
    expect(screen.getByText("신고가")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공유" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "단지 전체 보기" })).toHaveAttribute("href", "/apartment/1554");
    expect(screen.getByRole("img", { name: /래미안/ })).toHaveAttribute("src", "/api/og/highs/1554/9");
    expect(screen.getByText(/59㎡/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("축하");
  });

  test("플래그 꺼짐: 페이지는 열리되 공유 버튼 없음", async () => {
    setShareHighsEnabledForTest(false);
    fetchAptTrade.mockResolvedValue(trade("2026-11-01"));
    render(await page.default(props("1554", "9")));
    expect(screen.queryByRole("button", { name: "공유" })).toBeNull();
  });

  test("expired link: 계약 40일 전이면 공유 버튼 없음, 단지 링크 있음", async () => {
    fetchAptTrade.mockResolvedValue(trade("2026-09-28"));
    render(await page.default(props("1554", "9")));
    expect(screen.queryByRole("button", { name: "공유" })).toBeNull();
    expect(screen.getByRole("link", { name: "단지 전체 보기" })).toHaveAttribute("href", "/apartment/1554");
  });

  test("metadata: noindex, OG 이미지 주소", async () => {
    fetchAptTrade.mockResolvedValue(trade("2026-11-01"));
    const m = await page.generateMetadata(props("1554", "9"));
    expect((m.robots as { index: boolean }).index).toBe(false);
    const images = m.openGraph!.images as { url: string }[];
    expect(images[0].url).toBe("/api/og/highs/1554/9");
  });

  test("거래가 없으면 단지 페이지로", async () => {
    fetchAptTrade.mockResolvedValue(trade("2026-11-01"));
    await expect(page.default(props("1554", "777"))).rejects.toThrow("REDIRECT:/apartment/1554");
  });
});
