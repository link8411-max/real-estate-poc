import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import SiteHeader, { NAV } from "../SiteHeader";

test("제목과 모든 메뉴 링크는 줄바꿈하지 않는다", () => {
  render(<SiteHeader />);
  expect(screen.getByRole("link", { name: "집시세 홈" })).toHaveClass("whitespace-nowrap");
  const nav = within(screen.getByRole("navigation"));
  for (const n of NAV) expect(nav.getByRole("link", { name: n.label })).toHaveClass("whitespace-nowrap");
});

test("면적 단위 토글이 헤더에 있다", () => {
  render(<SiteHeader />);
  expect(screen.getByRole("radiogroup")).toBeInTheDocument();
});

test("취소된 신고가 메뉴가 통계 앞에 있다", () => {
  const labels = NAV.map((n) => n.label);
  expect(NAV.find((n) => n.label === "취소된 신고가")?.href).toBe("/canceled");
  expect(labels.indexOf("취소된 신고가")).toBe(labels.indexOf("통계") - 1);
});
