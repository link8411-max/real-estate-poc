import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setShareHighsEnabledForTest } from "@/lib/highShare";
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

  test("intro 문단을 h1 아래에 렌더", () => {
    render(<HighsBoard items={items} intro="소개 문장입니다." />);
    expect(screen.getByText("소개 문장입니다.")).toBeInTheDocument();
  });

  test("목록은 100건씩, 더 보기로 늘리고 도시를 바꾸면 처음으로", () => {
    const many = Array.from({ length: 250 }, (_, i) =>
      mk({ tx_id: 100 + i, apt_id: 100 + i, apt_name: `대량${i}`, city: i < 150 ? "서울" : "경기", deal_date: "2026-10-01" }),
    );
    render(<HighsBoard items={many} />);
    const rows = () => screen.getAllByTestId("high-row").length / 2; // 모바일 목록 + 데스크톱 표
    expect(rows()).toBe(100);
    fireEvent.click(screen.getByRole("button", { name: "더 보기 (남은 150건)" }));
    expect(rows()).toBe(200);
    fireEvent.click(screen.getByRole("button", { name: "더 보기 (남은 50건)" }));
    expect(rows()).toBe(250);
    expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "서울" }));
    expect(rows()).toBe(100);
    fireEvent.click(screen.getByRole("button", { name: "경기" }));
    expect(rows()).toBe(100);
    expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
  });
});

describe("HighsBoard 평형 묶음·직거래", () => {
  test("면적은 area_group(평형 묶음)으로, 직거래면 가격 옆 '직거래'", () => {
    render(<HighsBoard items={[mk({ tx_id: 1, area: 85.01, area_group: 84, direct: true }), mk({ tx_id: 2, apt_name: "다른단지" })]} />);
    const rows = screen.getAllByTestId("high-row");
    const mine = rows.filter((r) => r.textContent?.includes("직거래"));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0].textContent).toContain("84㎡");
    expect(mine[0].textContent).not.toContain("85㎡");
    expect(rows.filter((r) => r.textContent?.includes("다른단지")).every((r) => !r.textContent?.includes("직거래"))).toBe(true);
  });
});

describe("HighsBoard 공유 버튼", () => {
  afterEach(() => setShareHighsEnabledForTest(false));
  const list = [
    mk({ tx_id: 1, apt_name: "공유가능", shareable: true, held: false }),
    mk({ tx_id: 2, apt_name: "정정의심", shareable: false, held: true }),
    mk({ tx_id: 3, apt_name: "최고가아님", shareable: false, held: false }),
  ];
  const buttonsIn = (name: string) =>
    screen.getAllByTestId("high-row").filter((r) => r.textContent?.includes(name)).flatMap((r) => within(r).queryAllByRole("button", { name: "이 거래 공유" }));

  test("플래그 on: shareable 항목만 버튼", () => {
    setShareHighsEnabledForTest(true);
    render(<HighsBoard items={list} />);
    expect(buttonsIn("공유가능").length).toBeGreaterThan(0);
    expect(buttonsIn("정정의심")).toHaveLength(0);
    expect(buttonsIn("최고가아님")).toHaveLength(0);
  });
  test("플래그 off: 버튼 없음", () => {
    render(<HighsBoard items={list} />);
    expect(screen.queryAllByRole("button", { name: "이 거래 공유" })).toHaveLength(0);
  });
});
