import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setSupplyEnabledForTest } from "@/lib/supply";
import type { AptRent, AptTrade, AreaStat, AreaType, Rent, Transaction } from "@/lib/types";
import AreaStatsTable from "../AreaStatsTable";
import CanceledDeals from "../CanceledDeals";
import CompareTable from "../CompareTable";
import DealList from "../DealList";
import RentSection from "../RentSection";

vi.mock("../PriceChart", () => ({ default: () => <div>chart</div> }));

// 플래그 on 에서 단지 화면이 area_types 로 공급평을 그리는지
beforeEach(() => {
  localStorage.clear();
  setSupplyEnabledForTest(true);
});
afterEach(() => setSupplyEnabledForTest(false));

const types: AreaType[] = [
  { excl: 84.8, supply: 111.52, approx: false }, // 33평
  { excl: 59.96, supply: 84.5, approx: false }, // 25평
];

const stat = (area: number): AreaStat => ({
  area, count: 3, max_amount: 50000, min_amount: 40000, avg_amount: 45000, latest_amount: 45000,
  latest_date: "2026-01-06", recent_avg: null, recent_count: 0, peak_date: "2021-09-25",
});

describe("공급평 표기(플래그 on)", () => {
  test("평형 표: 33평 · 전용 84㎡, 전용평은 없다", () => {
    render(<AreaStatsTable stats={[stat(84)]} selected={null} onSelect={() => {}} areaTypes={types} />);
    expect(screen.getByText("33평 · 전용 84㎡")).toBeInTheDocument();
    expect(screen.queryByText(/전용 25평/)).not.toBeInTheDocument();
  });

  test("area_types 없으면 ㎡만", () => {
    render(<AreaStatsTable stats={[stat(84)]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText("84㎡")).toBeInTheDocument();
  });

  test("거래 목록 한 줄: 25평 · 전용 59.96㎡", () => {
    const t: Transaction = { id: 1, amount: 50000, area: 59.96, floor: 3, deal_date: "2026-01-06", cancel_date: null };
    render(<DealList transactions={[t]} area={null} areaTypes={types} />);
    expect(screen.getByText("25평 · 전용 59.96㎡")).toBeInTheDocument();
  });

  test("전월세 표·목록: 같은 규칙", () => {
    const r: Rent = {
      id: 1, deposit: 50000, monthly_rent: 0, area: 84.8, floor: 3, deal_date: "2026-10-06",
      contract_type: "신규", use_rr_right: null, pre_deposit: null, pre_monthly_rent: null,
    };
    const rent: AptRent = {
      apartment: { id: 1, name: "t", area_types: types } as unknown as AptRent["apartment"],
      rent_area_stats: [],
      rents: [r],
    };
    render(<RentSection rent={rent} tab="jeonse" today="2026-10-27" />);
    expect(screen.getByRole("row", { name: /33평 · 전용 84㎡/ })).toBeInTheDocument();
    expect(screen.getByText("33평 · 전용 84.8㎡")).toBeInTheDocument();
  });

  test("취소 거래 목록", () => {
    const items = [
      { id: 1, amount: 50000, area: 84.8, floor: 3, deal_date: "2026-01-06", cancel_date: "2026-01-20", cancel_iso: "2026-01-20", prev_max: null, is_high: false },
    ];
    render(<CanceledDeals items={items as never} areaTypes={types} />);
    expect(screen.getByText("33평 · 전용 84㎡")).toBeInTheDocument();
  });

  test("비교 표: 두 단지 각자의 area_types", () => {
    const mk = (id: number, at: AreaType[]): AptTrade => ({
      apartment: {
        id, name: `단지${id}`, dong: "d", lawd_cd: "1", region_name: "r", city: "c", jibun: null,
        build_year: 2000, apt_seq: null, lat: null, lng: null, area_types: at,
      },
      area_stats: [stat(84)],
      metrics: {},
      transactions: [],
    });
    render(<CompareTable items={[mk(1, types), mk(2, [{ excl: 84.9, supply: 105, approx: true }])]} today="2026-10-27" />);
    const row = screen.getByRole("row", { name: /^대표 평형/ });
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["33평 · 전용 84㎡", "약 31평 · 전용 84㎡"]);
  });
});
