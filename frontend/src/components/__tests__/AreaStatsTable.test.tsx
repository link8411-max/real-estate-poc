import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { AreaStat } from "@/lib/types";
import AreaStatsTable from "../AreaStatsTable";

const stat = (area: number, latest: number, max: number, count: number): AreaStat => ({
  area,
  count,
  max_amount: max,
  min_amount: latest,
  avg_amount: latest,
  latest_amount: latest,
  latest_date: "2026-01-06",
  recent_avg: null,
  recent_count: 0,
  peak_date: "2021-09-25",
});

const stats = [stat(60, 30000, 45000, 603), stat(84, 38500, 58800, 1289), stat(122, 52000, 70000, 191)];

describe("AreaStatsTable", () => {
  test("면적·평·금액을 표시한다", () => {
    render(<AreaStatsTable stats={stats} selected={null} onSelect={() => {}} />);
    const row = screen.getByRole("row", { name: /84㎡ \(25평\)/ });
    expect(within(row).getByText("3억 8,500")).toBeInTheDocument();
    expect(within(row).getByText("5억 8,800")).toBeInTheDocument();
    expect(within(row).getByText("1,289건")).toBeInTheDocument();
  });

  test("행 클릭 시 평형 선택", async () => {
    const onSelect = vi.fn();
    render(<AreaStatsTable stats={stats} selected={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("row", { name: /84㎡/ }));
    expect(onSelect).toHaveBeenCalledWith(84);
  });

  test("선택된 행을 다시 클릭하면 선택 해제(null)", async () => {
    const onSelect = vi.fn();
    render(<AreaStatsTable stats={stats} selected={84} onSelect={onSelect} />);
    const row = screen.getByRole("row", { name: /84㎡/ });
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("row", { name: /60㎡/ })).toHaveAttribute("aria-selected", "false");
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  test("키보드 Enter로도 선택", async () => {
    const onSelect = vi.fn();
    render(<AreaStatsTable stats={stats} selected={null} onSelect={onSelect} />);
    screen.getByRole("row", { name: /122㎡/ }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(122);
  });
});
