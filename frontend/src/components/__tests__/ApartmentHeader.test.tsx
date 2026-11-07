import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { Apartment } from "@/lib/types";
import ApartmentHeader from "../ApartmentHeader";

const apartment = {
  id: 7, name: "기흥역더스트푸르지오", dong: "구갈동", lawd_cd: "41463", region_name: "경기 용인시 기흥구", city: "경기",
  jibun: "1", build_year: 2023, apt_seq: null, lat: null, lng: null,
} as Apartment;

describe("ApartmentHeader 모바일 레이아웃", () => {
  test("모바일은 제목 아래 줄에 버튼 행을 따로 두고, md+에서만 제목 옆으로 간다", () => {
    const { container } = render(<ApartmentHeader apartment={apartment} actions={<button>공유</button>} />);
    const root = container.firstElementChild!;
    expect(root.className).toContain("flex-col");
    expect(root.className).toContain("md:flex-row");
    const actions = screen.getByTestId("apartment-actions");
    expect(actions.parentElement).toBe(root);
    // 제목 블록과 버튼 행은 형제(같은 줄에 끼지 않는다)
    expect(actions.previousElementSibling).toContain(screen.getByRole("heading", { level: 1 }));
    expect(actions.className).toContain("md:shrink-0");
    expect(actions.className).not.toMatch(/(^|\s)shrink-0/);
    expect(screen.getByRole("button", { name: "공유" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /비교 담기/ })).toBeTruthy();
  });

  test("제목은 음절 묶음 중간에서 끊기지 않게 break-keep", () => {
    render(<ApartmentHeader apartment={apartment} />);
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("break-keep");
  });

  test("주소와 준공연도 사이에 구분자가 있어 텍스트로 읽으면 '주소 · 2023년 준공'", () => {
    const { container } = render(<ApartmentHeader apartment={apartment} />);
    expect(container.textContent).toMatch(/구갈동 1\s*·\s*2023년 준공/);
    render(<ApartmentHeader apartment={{ ...apartment, build_year: null }} />);
    expect(screen.getAllByText("·")).toHaveLength(1); // 준공연도 없으면 구분자도 없다
  });
});
