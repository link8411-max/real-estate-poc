import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { AptRent, Rent } from "@/lib/types";
import RentSection from "../RentSection";

vi.mock("../PriceChart", () => ({ default: ({ valueLabel }: { valueLabel?: string }) => <div>chart:{valueLabel}</div> }));

const apartment = { id: 1, name: "테스트", dong: "역삼동", jibun: "1", build_year: 2000, lat: null, lng: null } as unknown as AptRent["apartment"];

const rent = (id: number, o: Partial<Rent> = {}): Rent => ({
  id,
  deposit: 50000,
  monthly_rent: 0,
  area: 84.2,
  floor: 10,
  deal_date: "2026-10-06",
  contract_type: "신규",
  use_rr_right: null,
  pre_deposit: null,
  pre_monthly_rent: null,
  ...o,
});

const data = (rents: Rent[]): AptRent => ({
  apartment,
  rent_area_stats: [
    { area: 84, jeonse_count: 2, wolse_count: 1, latest_deposit: 50000, latest_monthly_rent: 0, latest_date: "2026-10-06", recent_jeonse_avg: 52000 },
    { area: 59, jeonse_count: 0, wolse_count: 1, latest_deposit: 10000, latest_monthly_rent: 150, latest_date: "2026-10-03", recent_jeonse_avg: null },
  ],
  rents,
});

const mixed = data([
  rent(1, { deposit: 54000 }),
  rent(2, { deposit: 50000, deal_date: "2026-09-01" }),
  rent(3, { deposit: 20000, monthly_rent: 100, area: 84.9 }),
  rent(4, { deposit: 10000, monthly_rent: 150, area: 59.5, deal_date: "2026-10-03" }),
]);

const items = () => screen.getAllByRole("listitem");

describe("RentSection", () => {
  test("전세 탭은 월세 거래를 빼고 전세만 보여준다", () => {
    render(<RentSection rent={mixed} tab="jeonse" />);
    expect(items()).toHaveLength(2);
    expect(within(items()[0]).getByText("5억 4,000")).toBeInTheDocument();
    expect(screen.queryByText(/100$/)).not.toBeInTheDocument();
    expect(screen.getByText("chart:평균 보증금")).toBeInTheDocument();
  });

  test("전세 평형표: 전세 거래가 있는 평형만, 3개월 평균 포함", () => {
    render(<RentSection rent={mixed} tab="jeonse" />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("84㎡ (전용 25평)")).toBeInTheDocument();
    expect(within(table).queryByText(/^59㎡/)).not.toBeInTheDocument();
    expect(within(table).getByText("5억 2,000")).toBeInTheDocument();
    expect(within(table).getByText("2건")).toBeInTheDocument();
  });

  test("월세 탭은 보증금 / 월세 형식", () => {
    render(<RentSection rent={mixed} tab="wolse" />);
    expect(items()).toHaveLength(2);
    expect(within(items()[0]).getByText("2억 / 100")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("1억 / 150")).toBeInTheDocument();
    expect(within(table).getByText("59㎡ (전용 18평)")).toBeInTheDocument();
  });

  test("갱신·갱신요구권·이전 보증금 표시", () => {
    const d = data([
      rent(1, { contract_type: "갱신", use_rr_right: true, pre_deposit: 42000 }),
      rent(2, { contract_type: "신규", use_rr_right: false }),
    ]);
    render(<RentSection rent={d} tab="jeonse" />);
    const [first, second] = items();
    expect(within(first).getByText("갱신")).toBeInTheDocument();
    expect(within(first).getByText("갱신요구권")).toBeInTheDocument();
    expect(within(first).getByText("이전 4억 2,000")).toBeInTheDocument();
    expect(within(second).queryByText("갱신")).not.toBeInTheDocument();
    expect(within(second).queryByText("갱신요구권")).not.toBeInTheDocument();
    expect(within(second).queryByText(/이전/)).not.toBeInTheDocument();
  });

  test("월세 이전 보증금은 '이전 1억 / 90'", () => {
    const d = data([rent(1, { monthly_rent: 100, pre_deposit: 10000, pre_monthly_rent: 90 })]);
    render(<RentSection rent={d} tab="wolse" />);
    expect(screen.getByText("이전 1억 / 90")).toBeInTheDocument();
  });

  test("평형 행을 누르면 그 평형 목록만, 다시 누르면 해제", async () => {
    const d = data([rent(1, { area: 84.2 }), rent(2, { area: 84.9 }), rent(3, { area: 59.5 })]);
    d.rent_area_stats[1] = { ...d.rent_area_stats[1], jeonse_count: 1 };
    render(<RentSection rent={d} tab="jeonse" />);
    expect(items()).toHaveLength(3);
    await userEvent.click(screen.getByRole("row", { name: /59㎡/ }));
    expect(items()).toHaveLength(1);
    await userEvent.click(screen.getByRole("row", { name: /59㎡/ }));
    expect(items()).toHaveLength(3);
  });

  test("탭이 바뀌면 선택 평형이 초기화되어도 목록이 맞다(전세→월세)", () => {
    const { rerender } = render(<RentSection rent={mixed} tab="jeonse" />);
    rerender(<RentSection rent={mixed} tab="wolse" />);
    expect(items()).toHaveLength(2);
  });

  test("50건씩 더 보기", async () => {
    const d = data(Array.from({ length: 120 }, (_, i) => rent(i + 1)));
    render(<RentSection rent={d} tab="jeonse" />);
    expect(items()).toHaveLength(50);
    await userEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    expect(items()).toHaveLength(100);
    await userEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    expect(items()).toHaveLength(120);
    expect(screen.queryByRole("button", { name: /더 보기/ })).not.toBeInTheDocument();
  });
});
