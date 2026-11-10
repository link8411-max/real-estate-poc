import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setSupplyEnabledForTest } from "@/lib/supply";
import type { CanceledHigh, RecordHigh } from "@/lib/types";
import type { MapApartment } from "@/lib/useMapData";
import CanceledBoard from "../CanceledBoard";
import HighsBoard from "../HighsBoard";
import MapPreviewCard from "../MapPreviewCard";

vi.mock("@/lib/areaUnit", () => ({ useAreaUnit: () => ["pyeong", () => {}] }));

beforeEach(() => setSupplyEnabledForTest(true));
afterEach(() => setSupplyEnabledForTest(false));

const high = (o: Partial<RecordHigh>): RecordHigh => ({
  tx_id: 1, apt_id: 10, apt_name: "단지", region_name: "서울 강남구", city: "서울", lawd_cd: "11680", dong: "역삼동",
  area: 84.9, area_group: 84, floor: 5, amount: 300000, prev_max: 250000, jump: 50000, jump_pct: 20, deal_date: "2026-10-20", ...o,
});

describe("신고가 모음(플래그 on)", () => {
  test("supply 있으면 '33평 · 84㎡', null이면 '84㎡'", () => {
    render(
      <HighsBoard
        items={[
          high({ tx_id: 1, apt_name: "가단지", supply: { min: 33, max: 33, approx: false } }),
          high({ tx_id: 2, apt_name: "나단지", supply: null }),
        ]}
      />,
    );
    const rows = screen.getAllByTestId("high-row").map((r) => r.textContent ?? "");
    const a = rows.find((r) => r.includes("가단지"))!;
    const b = rows.find((r) => r.includes("나단지"))!;
    expect(a).toContain("33평 · 84㎡");
    expect(b).toContain("84㎡");
    expect(b).not.toContain("전용");
    expect(b).not.toContain("평");
  });
});

describe("취소 모음(플래그 on)", () => {
  test("supply 표기", () => {
    const c: CanceledHigh = {
      tx_id: 1, apt_id: 10, apt_name: "단지", region_name: "강남구", city: "서울", area: 84.9, area_group: 84,
      floor: 5, amount: 300000, prev_max: 250000, jump: 50000, deal_date: "2026-10-01", cancel_date: "2026-11-03",
      days_to_cancel: 33, supply: { min: 34, max: 34, approx: true },
    };
    render(<CanceledBoard items={[c]} today="2026-11-04" />);
    expect(screen.getAllByText(/약 34평 · 84㎡/).length).toBeGreaterThan(0);
  });
});

describe("지도 미리보기 카드(플래그 on)", () => {
  const apt: MapApartment = {
    id: 1, name: "단지", lat: 37, lng: 127, latest_trade_amount: 100000, latest_jeonse_deposit: 50000, trade_count: 3,
    build_year: 2000, latest_trade_area: 59.9, latest_trade_date: "2026-10-01",
    latest_supply_min: 25, latest_supply_max: 25, latest_supply_approx: false,
  };
  test("공급평 25평", () => {
    render(<MapPreviewCard apartment={apt} onClose={() => {}} />);
    expect(screen.getByText("최근 매매 (25평)")).toBeInTheDocument();
  });
  test("공급 정보 없으면 ㎡", () => {
    render(<MapPreviewCard apartment={{ ...apt, latest_supply_min: null, latest_supply_max: null }} onClose={() => {}} />);
    expect(screen.getByText("최근 매매 (59㎡)")).toBeInTheDocument();
  });
});
