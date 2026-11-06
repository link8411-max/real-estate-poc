import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setSupplyEnabledForTest } from "@/lib/supply";
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
const shareProps: { meta?: { description: string } }[] = [];
vi.mock("@/components/ShareButton", () => ({
  default: (p: { meta: { description: string } }) => {
    shareProps.push(p);
    return <button>공유</button>;
  },
}));

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
  shareProps.length = 0;
  redirect.mockClear();
  fetchAptTrade.mockReset().mockResolvedValue(trade);
});

describe("취소된 신고가 공유 페이지", () => {
  test("단지 JSON 없음 → /canceled", async () => {
    fetchAptTrade.mockResolvedValue(null);
    await expect(page.default(props("1554", "2"))).rejects.toThrow("REDIRECT:/canceled");
  });
  test("합쳐진 단지 → 남은 단지의 같은 거래 주소로 영구 이동", async () => {
    fetchAptTrade.mockResolvedValue({ moved_to: 7 });
    await expect(page.default(props("1554", "2"))).rejects.toThrow("PERMANENT:/canceled/7/2");
    await expect(page.generateMetadata(props("1554", "2"))).rejects.toThrow("PERMANENT:/canceled/7/2");
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
    expect(t).toBe("래미안 84㎡ 20억원");
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

describe("공유 설명·OG 메타", () => {
  test("취소 아닌 거래: ShareButton 설명에 신고가 주장 없음", async () => {
    render(await page.default(props("1554", "1")));
    const d = shareProps[0].meta!.description;
    expect(d).not.toContain("신고가");
    expect(d).not.toContain("취소");
    const m = await page.generateMetadata(props("1554", "1"));
    expect(d).toBe(m.description);
  });
  test("취소 거래: ShareButton 설명 = 메타 설명(계약일·취소일)", async () => {
    render(await page.default(props("1554", "2")));
    const d = shareProps[0].meta!.description;
    const m = await page.generateMetadata(props("1554", "2"));
    expect(d).toBe(m.description);
    expect(d).toContain("26.02.21 취소");
  });
  test("취소됐지만 신고가 아닌 거래도 신고가라 하지 않는다", async () => {
    fetchAptTrade.mockResolvedValue({
      ...trade,
      transactions: [
        { id: 1, amount: 300000, area: 84.9, floor: 3, deal_date: "2026-01-10", cancel_date: null },
        { id: 2, amount: 250000, area: 84.9, floor: 5, deal_date: "2026-02-01", cancel_date: "2026-02-21" },
      ],
    });
    render(await page.default(props("1554", "2")));
    expect(shareProps[0].meta!.description).not.toContain("신고가");
  });
  test("openGraph: url·siteName·locale", async () => {
    const m = await page.generateMetadata(props("1554", "2"));
    expect(m.openGraph).toMatchObject({ url: "/canceled/1554/2", siteName: "집시세", locale: "ko_KR" });
  });
});

describe("공급평 플래그 on", () => {
  afterEach(() => setSupplyEnabledForTest(false));
  const withTypes = { ...trade, apartment: { ...apartment, area_types: [{ excl: 84.9, supply: 112.9, approx: false }] } };

  test("제목: 단지명 34평 금액 (플래그 off면 84㎡)", async () => {
    fetchAptTrade.mockResolvedValue(withTypes);
    const off = await page.generateMetadata(props("1554", "1"));
    expect((off.title as { absolute: string }).absolute).toBe("래미안 84㎡ 20억원");
    setSupplyEnabledForTest(true);
    const on = await page.generateMetadata(props("1554", "1"));
    expect((on.title as { absolute: string }).absolute).toBe("래미안 34평 20억원");
  });
  test("공급 정보 없으면 ㎡만", async () => {
    setSupplyEnabledForTest(true);
    const m = await page.generateMetadata(props("1554", "1"));
    expect((m.title as { absolute: string }).absolute).toBe("래미안 84㎡ 20억원");
  });
  test("본문 첫 줄", async () => {
    fetchAptTrade.mockResolvedValue(withTypes);
    setSupplyEnabledForTest(true);
    render(await page.default(props("1554", "1")));
    expect(screen.getByText("래미안 34평 · 전용 84㎡")).toBeTruthy();
  });
});
