import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { RecordHigh } from "@/lib/types";
import HighsBoard from "../HighsBoard";

vi.mock("@/lib/areaUnit", () => ({ useAreaUnit: () => ["pyeong", () => {}] }));

const mk = (o: Partial<RecordHigh>): RecordHigh => ({
  tx_id: 1, apt_id: 10, apt_name: "단지", region_name: "서울 강남구", city: "서울", lawd_cd: "11680", dong: "역삼동",
  area: 84.9, area_group: 84, floor: 5, amount: 300000, prev_max: 250000, jump: 50000, jump_pct: 20, deal_date: "2026-10-20", ...o,
});
const items: RecordHigh[] = [
  mk({ tx_id: 1, apt_id: 10, apt_name: "서울단지A", jump_pct: 5.5, deal_date: "2026-10-01" }),
  mk({ tx_id: 2, apt_id: 11, apt_name: "경기단지B", city: "경기", region_name: "경기 성남시", jump_pct: 30.2, deal_date: "2026-10-02" }),
  mk({ tx_id: 3, apt_id: 12, apt_name: "서울단지C", jump_pct: 12, deal_date: "2026-10-30" }),
  mk({ tx_id: 4, apt_id: 13, apt_name: "서울단지D", jump_pct: 8, deal_date: "2026-10-15" }),
  mk({ tx_id: 5, apt_id: 14, apt_name: "서울단지E", jump_pct: 1.5, deal_date: "2026-10-10" }),
];

describe("HighsBoard", () => {
  test("헤드라인과 큰 카드(상승률 순 3개, +% 와 가격, 단지 링크)", () => {
    render(<HighsBoard items={items} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("최근 30일 신고가 5건");
    const cards = screen.getAllByTestId("top-card");
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent("경기단지B");
    expect(cards[0]).toHaveTextContent("+30.2%");
    expect(cards[0]).toHaveTextContent("30억원");
    expect(cards[0]).toHaveAttribute("href", "/apartment/11");
    expect(cards.map((c) => c.textContent)).toEqual([expect.stringContaining("경기단지B"), expect.stringContaining("서울단지C"), expect.stringContaining("서울단지D")]);
  });

  test("목록은 최신순", () => {
    render(<HighsBoard items={items} />);
    const names = screen.getAllByTestId("high-row").map((r) => r.textContent ?? "");
    expect(names[0]).toContain("서울단지C");
    expect(names[1]).toContain("서울단지D");
    expect(names.at(-1)).toContain("서울단지A");
  });

  test("지역 필터는 헤드라인 건수도 바꾼다", () => {
    render(<HighsBoard items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "경기" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("최근 30일 경기 신고가 1건");
    expect(screen.queryAllByText(/서울단지A/)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "인천" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("최근 30일 인천 신고가가 없습니다");
  });

  test("빈 입력은 빈 상태", () => {
    render(<HighsBoard items={[]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("최근 30일 신고가가 없습니다");
    expect(screen.queryAllByTestId("top-card")).toHaveLength(0);
  });
});
