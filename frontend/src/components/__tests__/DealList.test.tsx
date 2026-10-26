import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test } from "vitest";
import type { AreaStat, Transaction } from "@/lib/types";
import AreaStatsTable from "../AreaStatsTable";
import DealList from "../DealList";

const tx = (id: number, area: number, amount = 50000, cancel_date: string | null = null): Transaction => ({
  id,
  amount,
  area,
  floor: 10,
  deal_date: "2026-01-06",
  cancel_date,
});

// 84.2㎡ 80건 + 59.9㎡ 70건 = 150건
const many = [
  ...Array.from({ length: 80 }, (_, i) => tx(i + 1, 84.2)),
  ...Array.from({ length: 70 }, (_, i) => tx(i + 101, 59.9)),
];

const rows = () => screen.getAllByRole("listitem");

describe("DealList", () => {
  test("처음 50건, 더 보기마다 50건씩", async () => {
    render(<DealList transactions={many} area={null} />);
    expect(rows()).toHaveLength(50);
    await userEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    expect(rows()).toHaveLength(100);
    await userEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    expect(rows()).toHaveLength(150);
    expect(screen.queryByRole("button", { name: /더 보기/ })).not.toBeInTheDocument();
  });

  test("선택 평형(반올림 면적)만 보여준다", () => {
    render(<DealList transactions={many} area={60} />);
    expect(screen.getByText("70건")).toBeInTheDocument();
    expect(rows()).toHaveLength(50);
    rows().forEach((r) => expect(r).toHaveTextContent("59.9㎡"));
  });

  test("취소 거래는 취소선과 취소 뱃지", () => {
    render(<DealList transactions={[tx(1, 84.2, 61000, "2026-02-01"), tx(2, 84.2, 60000)]} area={null} />);
    const [cancelled, normal] = rows();
    expect(within(cancelled).getByText("취소")).toBeInTheDocument();
    expect(within(cancelled).getByText("6억 1,000")).toHaveClass("line-through");
    expect(within(normal).queryByText("취소")).not.toBeInTheDocument();
    expect(within(normal).getByText("6억")).not.toHaveClass("line-through");
  });

  test("거래가 없으면 안내 문구", () => {
    render(<DealList transactions={[]} area={null} />);
    expect(screen.getByText("거래 내역이 없습니다")).toBeInTheDocument();
  });

  test("평형 표에서 84㎡를 누르면 목록이 84㎡만, 더 보기 개수는 초기화", async () => {
    const stats: AreaStat[] = [60, 84].map((area) => ({
      area,
      count: area === 84 ? 80 : 70,
      max_amount: 50000,
      min_amount: 50000,
      avg_amount: 50000,
      latest_amount: 50000,
      latest_date: "2026-01-06",
      recent_avg: null,
      recent_count: 0,
      peak_date: "2026-01-06",
    }));
    function Harness() {
      const [area, setArea] = useState<number | null>(null);
      return (
        <>
          <AreaStatsTable stats={stats} selected={area} onSelect={setArea} />
          <DealList transactions={many} area={area} />
        </>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    expect(rows()).toHaveLength(100);

    await userEvent.click(screen.getByRole("row", { name: /84㎡/ }));
    expect(rows()).toHaveLength(50);
    rows().forEach((r) => expect(r).toHaveTextContent("84.2㎡"));
    await userEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    expect(rows()).toHaveLength(80);
  });
});
