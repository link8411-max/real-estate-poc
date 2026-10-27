import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { RegionStat } from "@/lib/types";
import RegionStatsTable, { type RegionSort } from "../RegionStatsTable";

const r = (code: string, name: string, avg: number | null, count: number, yoy: number | null): RegionStat => ({
  code,
  name,
  city: "서울",
  avg_amount: avg,
  tx_count_12m: count,
  yoy_change: yoy,
});

const regions = [
  r("11110", "종로구", 105429, 72, -12.4),
  r("11680", "강남구", 250000, 900, 3.1),
  r("11305", "강북구", 60000, 300, null),
  r("11740", "강동구", null, 0, 1.2),
];

const names = () => screen.getAllByRole("row").slice(1).map((row) => row.querySelector("th, td")!.textContent);

const cases: [RegionSort, string[]][] = [
  ["name", ["강남구", "강동구", "강북구", "종로구"]],
  ["avg_desc", ["강남구", "종로구", "강북구", "강동구"]],
  ["avg_asc", ["강북구", "종로구", "강남구", "강동구"]],
  ["count_desc", ["강남구", "강북구", "종로구", "강동구"]],
  ["count_asc", ["강동구", "종로구", "강북구", "강남구"]],
  ["yoy_desc", ["강남구", "강동구", "종로구", "강북구"]],
  ["yoy_asc", ["종로구", "강동구", "강남구", "강북구"]],
];

describe("RegionStatsTable", () => {
  test.each(cases)("정렬 %s (값 없음은 항상 뒤)", (sort, expected) => {
    render(<RegionStatsTable regions={regions} sort={sort} />);
    expect(names()).toEqual(expected);
  });

  test("값 표시: 금액, 건수, 등락률, 없음은 —", () => {
    render(<RegionStatsTable regions={regions} sort="avg_desc" />);
    expect(screen.getByText("25억")).toBeInTheDocument();
    expect(screen.getByText("900건")).toBeInTheDocument();
    expect(screen.getByText("+3.1%")).toBeInTheDocument();
    expect(screen.getByText("-12.4%")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  test("행은 tbody 안에 있다(하이드레이션 안전)", () => {
    const { container } = render(<RegionStatsTable regions={regions} sort="name" />);
    expect(container.querySelectorAll("table > tbody > tr")).toHaveLength(4);
    expect(container.querySelectorAll("table > tr")).toHaveLength(0);
  });

  test("지역 이름은 지역 페이지로 연결", () => {
    render(<RegionStatsTable regions={regions} sort="name" />);
    expect(screen.getByRole("link", { name: "강남구" })).toHaveAttribute("href", "/region/11680");
  });
});
