import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { AptTrade, AreaStat } from "@/lib/types";
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

const full = apt(1, "잠실 엘스", {
  area_stats: [stat(60, 10, 200000, 220000, 190000), stat(85, 40, 245000, 270000, 240000)],
  metrics: { recovery_rate: 90.7, jeonse_ratio: 55.2, days_since_last_tx: 12 },
});
const empty = apt(2, "빈 단지", {}, null);

const rowValues = (label: string) => {
  const row = screen.getByRole("row", { name: new RegExp(`^${label}`) });
  return within(row).getAllByRole("cell").map((c) => c.textContent);
};

describe("CompareTable", () => {
  test("단지 이름 헤더는 상세 페이지로 연결", () => {
    render(<CompareTable items={[full, empty]} />);
    expect(screen.getByRole("link", { name: "잠실 엘스" })).toHaveAttribute("href", "/apartment/1");
    expect(screen.getByRole("link", { name: "빈 단지" })).toHaveAttribute("href", "/apartment/2");
  });

  test("대표 평형(거래 최다) 기준 값과 지표", () => {
    render(<CompareTable items={[full, empty]} />);
    expect(rowValues("대표 평형")).toEqual(["85㎡ (26평)", "—"]);
    expect(rowValues("최근 실거래")).toEqual(["24억 5,000", "—"]);
    expect(rowValues("최고가")).toEqual(["27억", "—"]);
    expect(rowValues("최근 1년 평균")).toEqual(["24억", "—"]);
    expect(rowValues("전고점 회복률")).toEqual(["91%", "—"]);
    expect(rowValues("전세가율")).toEqual(["55%", "—"]);
    expect(rowValues("마지막 거래")).toEqual(["12일 전", "—"]);
    expect(rowValues("준공")).toEqual(["2008년", "—"]);
    expect(rowValues("지역")).toEqual(["서울 송파구 잠실동", "서울 송파구 잠실동"]);
  });

  test("한 단지만 있어도 렌더링", () => {
    render(<CompareTable items={[full]} />);
    expect(rowValues("최고가")).toEqual(["27억"]);
  });
});
