import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { CanceledHigh } from "@/lib/types";
import CanceledBoard from "../CanceledBoard";

const mk = (o: Partial<CanceledHigh>): CanceledHigh => ({
  tx_id: 1, apt_id: 10, apt_name: "단지", region_name: "강남구", city: "서울", area: 84.9, area_group: 84,
  floor: 5, amount: 300000, prev_max: 250000, jump: 50000, deal_date: "2026-10-01", cancel_date: "2026-11-03",
  days_to_cancel: 33, ...o,
});

const TODAY = "2026-11-04";
const items: CanceledHigh[] = [
  mk({ tx_id: 1, apt_id: 10, apt_name: "서울단지A", jump: 50000 }),
  mk({ tx_id: 2, apt_id: 11, apt_name: "경기단지B", city: "경기", region_name: "성남시", jump: 90000, cancel_date: "2026-11-02" }),
  mk({ tx_id: 3, apt_id: 12, apt_name: "서울단지C", jump: 20000, cancel_date: "2026-10-10" }),
  mk({ tx_id: 4, apt_id: 13, apt_name: "서울단지D", jump: 70000, cancel_date: "2026-10-12" }),
  mk({ tx_id: 5, apt_id: 14, apt_name: "서울단지E", jump: 10000, cancel_date: "2026-10-15" }),
];

vi.mock("@/lib/areaUnit", () => ({ useAreaUnit: () => ["pyeong", () => {}] }));

describe("CanceledBoard", () => {
  test("7일 2건 미만이면 30일 헤드라인, 탭 전환", () => {
    render(<CanceledBoard items={items} today={TODAY} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("최근 30일, 신고가 5건이 신고 후 취소됐습니다");
    expect(screen.getByRole("tab", { name: "30일" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "7일" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("최근 7일, 신고가 2건이 신고 후 취소됐습니다");
  });

  test("지역 필터", () => {
    render(<CanceledBoard items={items} today={TODAY} />);
    expect(screen.getAllByText(/서울단지A/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "경기" }));
    expect(screen.queryAllByText(/서울단지A/)).toHaveLength(0);
    expect(screen.getAllByText(/경기단지B/).length).toBeGreaterThan(0);
  });

  test("큰 카드는 jump 내림차순, 링크 형식", () => {
    render(<CanceledBoard items={items} today={TODAY} />);
    const cards = screen.getAllByTestId("top-card");
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveAttribute("href", "/canceled/11/2");
    expect(cards[1]).toHaveAttribute("href", "/canceled/13/4");
    expect(cards[2]).toHaveAttribute("href", "/canceled/10/1");
    expect(cards[0].textContent).toContain("+9억원");
    expect(cards[0].textContent).toContain("33일 만에 취소");
  });

  test("빈 배열", () => {
    render(<CanceledBoard items={[]} today={TODAY} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("최근 30일 취소된 신고가가 없습니다");
  });

  test("안내 문구", () => {
    render(<CanceledBoard items={items} today={TODAY} />);
    expect(screen.getByText("거래 해제는 대출 불발·계약 합의 해지 등 여러 이유로 생깁니다. 국토교통부 실거래가 공개 자료 기준.")).toBeInTheDocument();
  });

  test("7일 탭이 비면 현재 기간으로 빈 상태", () => {
    render(<CanceledBoard items={items.slice(2)} today={TODAY} />);
    fireEvent.click(screen.getByRole("tab", { name: "7일" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("최근 7일 취소된 신고가가 없습니다");
  });

  test("지역 필터 결과가 비어도 빈 상태", () => {
    render(<CanceledBoard items={items} today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "인천" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("최근 30일 취소된 신고가가 없습니다");
  });

  test("7일 3건 이상이면 처음부터 7일 탭", () => {
    const recent = [1, 2, 3].map((n) => mk({ tx_id: n, apt_id: n, cancel_date: "2026-11-03" }));
    render(<CanceledBoard items={recent} today={TODAY} />);
    expect(screen.getByRole("tab", { name: "7일" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("최근 7일, 신고가 3건이");
  });

  test("지역명에 시·도가 이미 들어 있어 중복 출력하지 않는다", () => {
    const one = [mk({ tx_id: 9, apt_name: "중복단지", city: "경기", region_name: "경기 성남수정" })];
    const { container } = render(<CanceledBoard items={one} today={TODAY} />);
    expect(screen.getAllByText(/경기 성남수정/).length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("경기 경기");
  });

  test("intro 문단을 렌더", () => {
    render(<CanceledBoard items={items} today={TODAY} intro="취소 소개 문장입니다." />);
    expect(screen.getByText("취소 소개 문장입니다.")).toBeInTheDocument();
  });
});
