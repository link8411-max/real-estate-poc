import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { SAMPLE_ZONES } from "@/test/zones.fixture";
import { ZONE_DISCLAIMER } from "@/lib/redevelopment";
import RegionRedevelopment from "../RegionRedevelopment";
import { ZoneBadge } from "../ZoneChips";
import ZonesBoard from "../ZonesBoard";

afterEach(cleanup);

describe("ZonesBoard", () => {
  test("요약 숫자: 전체·재건축·재개발", () => {
    render(<ZonesBoard zones={SAMPLE_ZONES} />);
    const sum = screen.getByLabelText("요약");
    expect(within(sum).getByText("전체").previousSibling?.textContent).toBe("7");
    expect(within(sum).getByText("재건축").previousSibling?.textContent).toBe("3");
    expect(within(sum).getByText("재개발").previousSibling?.textContent).toBe("3");
  });

  test("단계별 막대와 개수", () => {
    render(<ZonesBoard zones={SAMPLE_ZONES} />);
    const bars = screen.getByLabelText("단계별 구역 수");
    expect(within(bars).getByText("착공").parentElement?.textContent).toContain("1");
    expect(within(bars).getAllByRole("listitem")).toHaveLength(7);
  });

  test("목록: 구역 id 앵커, 시군구·유형·단계 칩·세대수·사업시행자", () => {
    const { container } = render(<ZonesBoard zones={SAMPLE_ZONES} />);
    const row = container.querySelector("#zone-z002") as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.textContent).toContain("잠실주공5단지");
    expect(row.textContent).toContain("송파구");
    expect(row.textContent).toContain("재건축 · 관리처분인가");
    expect(row.textContent).toContain("6,491세대");
    expect(row.textContent).toContain("조합");
  });

  test("세대수 null 은 -, 0 은 0세대, 사업시행자 null 은 표시 생략", () => {
    const { container } = render(<ZonesBoard zones={SAMPLE_ZONES} />);
    expect((container.querySelector("#zone-z004") as HTMLElement).textContent).toContain("세대수 -");
    expect((container.querySelector("#zone-z007") as HTMLElement).textContent).toContain("0세대");
  });

  test("매칭된 단지 링크, 없으면 링크 없음", () => {
    const { container } = render(<ZonesBoard zones={SAMPLE_ZONES} />);
    const links = within(container.querySelector("#zone-z002") as HTMLElement).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/apartment/102", "/apartment/103"]);
    expect(links.map((a) => a.textContent)).toEqual(["잠실주공5단지 ›", "잠실주공4단지 ›"]); // 이름으로 표시
    expect(within(container.querySelector("#zone-z003") as HTMLElement).queryAllByRole("link")).toHaveLength(0);
  });

  test("필터: 지역·유형·단계, 개수 갱신", () => {
    const { container } = render(<ZonesBoard zones={SAMPLE_ZONES} />);
    fireEvent.click(screen.getByRole("button", { name: "경기" }));
    expect(container.querySelectorAll("[id^=zone-]")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "전체 지역" }));
    fireEvent.click(screen.getByRole("button", { name: "재개발" }));
    expect(container.querySelectorAll("[id^=zone-]")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "착공" }));
    expect(container.querySelectorAll("[id^=zone-]")).toHaveLength(1);
    expect(screen.getByText(/1곳/)).toBeTruthy();
  });

  test("필터 결과가 없으면 안내", () => {
    render(<ZonesBoard zones={SAMPLE_ZONES} />);
    fireEvent.click(screen.getByRole("button", { name: "경기" }));
    fireEvent.click(screen.getByRole("button", { name: "착공" }));
    expect(screen.getByText("조건에 맞는 구역이 없습니다")).toBeTruthy();
  });

  test("안내 문구가 정확히 보이고 단정 표현은 없다", () => {
    const { container } = render(<ZonesBoard zones={SAMPLE_ZONES} />);
    expect(screen.getByText(ZONE_DISCLAIMER)).toBeTruthy();
    expect(container.textContent).not.toMatch(/투자 추천|호재/);
  });

  test("데이터가 없으면 빈 상태(제목은 유지)", () => {
    render(<ZonesBoard zones={[]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("재건축·재개발 현황");
    expect(screen.getByText(/아직 불러올 수 없습니다|아직 없습니다/)).toBeTruthy();
  });

  test("목록은 100곳씩 더 보기", () => {
    const many = Array.from({ length: 130 }, (_, i) => ({ ...SAMPLE_ZONES[0], zone_id: `m${i}`, name: `구역${i}` }));
    const { container } = render(<ZonesBoard zones={many} />);
    expect(container.querySelectorAll("[id^=zone-]")).toHaveLength(100);
    fireEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    expect(container.querySelectorAll("[id^=zone-]")).toHaveLength(130);
  });
});

describe("RegionRedevelopment", () => {
  test("구역이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<RegionRedevelopment zones={[]} />);
    expect(container.innerHTML).toBe("");
  });
  test("요약·목록·안내 문구·전체 목록 링크", () => {
    render(<RegionRedevelopment zones={[SAMPLE_ZONES[0], SAMPLE_ZONES[1]]} />);
    expect(screen.getByText(/재건축 2곳/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "은마구역" }).getAttribute("href")).toBe("/redevelopment#zone-z001");
    expect(screen.getByRole("link", { name: /전체 목록/ }).getAttribute("href")).toBe("/redevelopment");
    expect(screen.getByText(ZONE_DISCLAIMER)).toBeTruthy();
  });
  test("8곳 넘으면 나머지는 개수로", () => {
    const zs = Array.from({ length: 11 }, (_, i) => ({ ...SAMPLE_ZONES[0], zone_id: `r${i}`, name: `구역${i}` }));
    render(<RegionRedevelopment zones={zs} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByText(/외 3곳/)).toBeTruthy();
  });
});

describe("ZoneBadge", () => {
  test("재건축 · 단계, 구역 앵커로 이동", () => {
    render(<ZoneBadge zone={SAMPLE_ZONES[0]} />);
    const a = screen.getByRole("link", { name: "재건축 · 조합설립인가" });
    expect(a.getAttribute("href")).toBe("/redevelopment#zone-z001");
  });
});
