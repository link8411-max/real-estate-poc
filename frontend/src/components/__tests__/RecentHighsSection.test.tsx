import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { RecordHigh } from "@/lib/types";
import RecentHighsSection from "../RecentHighsSection";

const mk = (n: number): RecordHigh => ({
  tx_id: n, apt_id: 10 + n, apt_name: `단지${n}`, region_name: "서울 강남구", city: "서울", lawd_cd: "11680", dong: "역삼동",
  area: 84.9, area_group: 84, floor: 5, amount: 120000, prev_max: 100000, jump: 20000, jump_pct: 20, deal_date: "2026-10-20",
});

test("항목·단지 링크·/highs 링크", () => {
  render(<RecentHighsSection items={[mk(1), mk(2)]} />);
  expect(screen.getByRole("heading", { name: /최근 신고가/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /단지1/ })).toHaveAttribute("href", "/apartment/11");
  expect(screen.getAllByText(/\+20%/)).toHaveLength(2);
  expect(screen.getByRole("link", { name: /전체 보기/ })).toHaveAttribute("href", "/highs");
});

test("항목 없으면 아무것도 렌더하지 않음", () => {
  const { container } = render(<RecentHighsSection items={[]} />);
  expect(container).toBeEmptyDOMElement();
});
