import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setSupplyEnabledForTest } from "@/lib/supply";
import type { RecentTrade } from "@/lib/types";
import RecentDeals from "../RecentDeals";

vi.mock("@/lib/areaUnit", () => ({ useAreaUnit: () => ["pyeong", () => {}] }));
afterEach(() => setSupplyEnabledForTest(false));

const deal = (o: Partial<RecentTrade>): RecentTrade => ({
  apt_id: 1, name: "가단지", region_name: "서울 강남구", amount: 300000, area: 84.9, deal_date: "2026-10-20", ...o,
});

describe("홈 최근 거래 공급평", () => {
  test("플래그 on: supply 있으면 '33평 · 전용 84㎡', null이면 '84㎡'", () => {
    setSupplyEnabledForTest(true);
    render(
      <RecentDeals
        deals={[deal({ supply: { min: 33, max: 33, approx: false } }), deal({ apt_id: 2, name: "나단지", supply: null })]}
      />,
    );
    const rows = screen.getAllByRole("listitem").map((r) => r.textContent ?? "");
    expect(rows[0]).toContain("33평 · 전용 84㎡");
    expect(rows[1]).toContain("84㎡");
    expect(rows[1]).not.toContain("평");
  });

  test("플래그 off: supply가 있어도 기존 표기", () => {
    render(<RecentDeals deals={[deal({ supply: { min: 33, max: 33, approx: false } })]} />);
    expect(screen.getByRole("listitem").textContent).toContain("전용 25평 (84㎡)");
    expect(screen.getByRole("listitem").textContent).not.toContain("33평");
  });
});
