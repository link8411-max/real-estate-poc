import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AptTrade } from "@/lib/types";

const fetchAptTrade = vi.fn();
vi.mock("@/lib/data", () => ({ fetchAptTrade: (...a: unknown[]) => fetchAptTrade(...a) }));
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("@/components/ShareButton", () => ({ default: () => <button>공유</button> }));

const page = await import("../canceled/[aptId]/[txId]/page");

const apartment = {
  id: 1554, name: "래미안", dong: "개포동", lawd_cd: "11680", region_name: "서울 강남구", city: "서울",
  jibun: "1", build_year: 2000, apt_seq: null, lat: null, lng: null,
};
const trade: AptTrade = {
  apartment,
  area_stats: [],
  metrics: { recovery_rate: 100, peak_date: "2026-03-01", days_since_last_tx: 1 },
  transactions: [
    { id: 1, amount: 200000, area: 84.9, floor: 3, deal_date: "2026-01-10", cancel_date: null },
    { id: 2, amount: 250000, area: 84.9, floor: 5, deal_date: "2026-02-01", cancel_date: "2026-02-21" },
    { id: 3, amount: 210000, area: 84.9, floor: 7, deal_date: "2026-03-01", cancel_date: null },
  ],
};
const props = (aptId: string, txId: string) => ({ params: Promise.resolve({ aptId, txId }) });

beforeEach(() => {
  redirect.mockClear();
  fetchAptTrade.mockReset().mockResolvedValue(trade);
});

describe("취소된 신고가 공유 페이지", () => {
  test("단지 JSON 없음 → /canceled", async () => {
    fetchAptTrade.mockResolvedValue(null);
    await expect(page.default(props("1554", "2"))).rejects.toThrow("REDIRECT:/canceled");
  });
  test("잘못된 id → /canceled", async () => {
    await expect(page.default(props("abc", "2"))).rejects.toThrow("REDIRECT:/canceled");
  });
  test("거래 없음 → 단지 페이지", async () => {
    await expect(page.default(props("1554", "999"))).rejects.toThrow("REDIRECT:/apartment/1554");
  });
  test("취소된 신고가 본문", async () => {
    render(await page.default(props("1554", "2")));
    expect(screen.getByText(/만에/)).toBeTruthy();
    expect(screen.getByText(/높았던 거래/)).toBeTruthy();
    expect(screen.getByText(/26\.02\.21 취소/)).toBeTruthy();
    expect(screen.getByText(/거래 해제는 대출 불발/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "취소된 신고가 더 보기" }).getAttribute("href")).toBe("/canceled");
  });
  test("취소 아닌 거래", async () => {
    render(await page.default(props("1554", "1")));
    expect(screen.getByText("이 거래는 취소 내역이 없습니다")).toBeTruthy();
  });
  test("취소 아닌 거래 메타: '신고 후 취소' 없음", async () => {
    const m = await page.generateMetadata(props("1554", "1"));
    const t = (m.title as { absolute: string }).absolute;
    expect(t).toBe("래미안 25평 20억원");
    expect(t).not.toContain("신고 후 취소");
  });
  test("취소됐지만 신고가 아님: 제목에 신고 후 취소", async () => {
    fetchAptTrade.mockResolvedValue({
      ...trade,
      transactions: [
        { id: 1, amount: 300000, area: 84.9, floor: 3, deal_date: "2026-01-10", cancel_date: null },
        { id: 2, amount: 250000, area: 84.9, floor: 5, deal_date: "2026-02-01", cancel_date: "2026-02-21" },
      ],
    });
    const m = await page.generateMetadata(props("1554", "2"));
    expect((m.title as { absolute: string }).absolute).toContain("신고 후 취소");
  });
  test("canonical·이미지는 숫자 id 로 정규화", async () => {
    const m = await page.generateMetadata(props("1554", "02"));
    expect(m.alternates?.canonical).toBe("/canceled/1554/2");
    expect(JSON.stringify(m.openGraph?.images)).toContain("/api/og/canceled/1554/2\"");
  });
  test("메타: noindex, 제목, OG 이미지", async () => {
    const m = await page.generateMetadata(props("1554", "2"));
    expect(m.robots).toMatchObject({ index: false });
    expect(String(m.title && typeof m.title === "object" && "absolute" in m.title ? m.title.absolute : m.title)).toContain("신고 후 취소");
    expect(JSON.stringify(m.openGraph?.images)).toContain("/api/og/canceled/1554/2");
  });
});
