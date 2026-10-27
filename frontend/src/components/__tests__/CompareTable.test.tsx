import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { AptRent, AptTrade, AreaStat, Transaction } from "@/lib/types";
import CompareTable from "../CompareTable";

const stat = (area: number, count: number, latest: number, max: number, recent_avg: number | null): AreaStat => ({
  area,
  count,
  max_amount: max,
  min_amount: latest,
  avg_amount: latest,
  latest_amount: latest,
  latest_date: "2026-01-06",
  recent_avg,
  recent_count: 3,
  peak_date: "2021-09-25",
});

const apt = (id: number, name: string, extra: Partial<AptTrade> = {}, build_year: number | null = 2008): AptTrade => ({
  apartment: {
    id,
    name,
    dong: "잠실동",
    lawd_cd: "11710",
    region_name: "서울 송파구",
    city: "서울",
    jibun: null,
    build_year,
    apt_seq: null,
    lat: null,
    lng: null,
  },
  area_stats: [],
  metrics: {},
  transactions: [],
  ...extra,
});

const TODAY = "2026-10-27";

let seq = 0;
const tx = (deal_date: string, amount: number, area = 85.1, cancel_date: string | null = null): Transaction => ({
  id: ++seq,
  amount,
  area,
  floor: 5,
  deal_date,
  cancel_date,
});

const full = apt(1, "잠실 엘스", {
  area_stats: [stat(60, 10, 200000, 220000, 190000), stat(85, 40, 245000, 270000, 240000)],
  // 내보낸 날 기준 지표(낡은 값)는 쓰지 않는다
  metrics: { recovery_rate: 1, jeonse_ratio: 1, days_since_last_tx: 999 },
  transactions: [
    tx("2026-10-20", 999999, 85.1, "2026-10-22"), // 취소 → 무시
    tx("2026-10-15", 245000),
    tx("2026-09-01", 235000),
    tx("2026-07-28", 100000), // 91일 전 → 3개월 평균에서 제외
    tx("2026-08-01", 210000, 60.2),
    tx("2021-09-25", 270000),
  ],
});
const fullRent: AptRent = {
  apartment: full.apartment,
  rent_area_stats: [],
  rents: [
    { id: 1, deposit: 132500, monthly_rent: 0, area: 85.0, floor: 3, deal_date: "2026-10-01", contract_type: null, use_rr_right: null, pre_deposit: null, pre_monthly_rent: null },
  ],
};
const empty = apt(2, "빈 단지", {}, null);

const rowValues = (label: string) => {
  const row = screen.getByRole("row", { name: new RegExp(`^${label}`) });
  return within(row).getAllByRole("cell").map((c) => c.textContent);
};

describe("CompareTable", () => {
  test("단지 이름 헤더는 상세 페이지로 연결", () => {
    render(<CompareTable items={[full, empty]} today={TODAY} />);
    expect(screen.getByRole("link", { name: "잠실 엘스" })).toHaveAttribute("href", "/apartment/1");
    expect(screen.getByRole("link", { name: "빈 단지" })).toHaveAttribute("href", "/apartment/2");
  });

  test("㎡ 모드의 대표 평형", () => {
    localStorage.setItem("areaUnit", "m2");
    render(<CompareTable items={[full, empty]} today={TODAY} />);
    expect(rowValues("대표 평형")).toEqual(["85㎡ (전용 26평)", "—"]);
  });

  test("대표 평형(거래 최다) 기준 값과 오늘 기준 지표", () => {
    render(<CompareTable items={[full, empty]} rents={[fullRent, null]} today={TODAY} />);
    expect(rowValues("대표 평형")).toEqual(["전용 26평 (85㎡)", "—"]);
    expect(rowValues("최근 실거래")).toEqual(["24억 5,000", "—"]);
    expect(rowValues("최고가")).toEqual(["27억", "—"]);
    expect(rowValues("최근 3개월 평균")).toEqual(["24억", "—"]);
    expect(screen.queryByRole("row", { name: /최근 1년 평균/ })).not.toBeInTheDocument();
    expect(rowValues("전고점 회복률")).toEqual(["91%", "—"]);
    expect(rowValues("전세가율")).toEqual(["55%", "—"]);
    expect(rowValues("마지막 거래")).toEqual(["12일 전", "—"]);
    expect(rowValues("준공")).toEqual(["2008년", "—"]);
    expect(rowValues("지역")).toEqual(["서울 송파구 잠실동", "서울 송파구 잠실동"]);
  });

  test("오늘이 지나면 3개월 평균·경과일이 따라 바뀐다", () => {
    render(<CompareTable items={[full]} today="2027-01-10" />);
    expect(rowValues("최근 3개월 평균")).toEqual(["24억 5,000"]);
    expect(rowValues("마지막 거래")).toEqual(["87일 전"]);
    expect(rowValues("전세가율")).toEqual(["—"]); // 전월세 데이터 없음
  });

  test("행은 tbody 안에 있다(하이드레이션 안전)", () => {
    const { container } = render(<CompareTable items={[full, empty]} today={TODAY} />);
    expect(container.querySelectorAll("table > tbody > tr").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("table > tr")).toHaveLength(0);
  });

  test("한 단지만 있어도 렌더링", () => {
    render(<CompareTable items={[full]} today={TODAY} />);
    expect(rowValues("최고가")).toEqual(["27억"]);
  });
});
