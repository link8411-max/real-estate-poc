import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { CanceledTx } from "@/lib/canceled";
import CanceledAlert from "../CanceledAlert";
import CanceledDeals from "../CanceledDeals";

const item = (id: number, is_high: boolean, cancel_date = "2026-10-20"): CanceledTx => ({
  id,
  amount: 120000,
  area: 84.9,
  floor: 12,
  deal_date: "2026-09-10",
  cancel_date,
  cancel_iso: "2026-10-20",
  prev_max: 110000,
  is_high,
});

describe("CanceledAlert", () => {
  test("0건이면 아무것도 그리지 않는다", () => {
    const { container } = render(<CanceledAlert total={0} highs={0} />);
    expect(container).toBeEmptyDOMElement();
  });
  test("신고가 포함 문구", () => {
    render(<CanceledAlert total={5} highs={2} />);
    const a = screen.getByRole("link");
    expect(a).toHaveAttribute("href", "#canceled");
    expect(a).toHaveTextContent("최근 1년 취소된 거래 5건 · 그중 신고가였던 거래 2건");
  });
  test("신고가 0건이면 뒷부분 없음", () => {
    render(<CanceledAlert total={3} highs={0} />);
    expect(screen.getByRole("link")).toHaveTextContent(/^최근 1년 취소된 거래 3건$/);
  });
});

describe("CanceledDeals", () => {
  test("0건이면 비어 있다", () => {
    const { container } = render(<CanceledDeals items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  test("제목·배지·안내문구·id", () => {
    const { container } = render(<CanceledDeals items={[item(1, true), item(2, false, "26.10.20")]} />);
    expect(container.querySelector("section#canceled")).not.toBeNull();
    expect(screen.getByText("취소된 거래 2건")).toBeInTheDocument();
    expect(screen.getAllByText("당시 신고가")).toHaveLength(1);
    expect(screen.getAllByText("26.10.20 취소")).toHaveLength(2);
    expect(screen.getAllByText("26.09.10")).toHaveLength(2);
    expect(
      screen.getByText("거래 해제는 대출 불발·계약 합의 해지 등 여러 이유로 생깁니다. 국토교통부 실거래가 공개 자료 기준."),
    ).toBeInTheDocument();
  });
});
