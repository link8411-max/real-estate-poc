import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import SiteHeader, { NAV } from "../SiteHeader";

test("제목과 모든 메뉴 링크는 줄바꿈하지 않는다", () => {
  render(<SiteHeader />);
  expect(screen.getByRole("link", { name: "수도권 실거래가" })).toHaveClass("whitespace-nowrap");
  const nav = within(screen.getByRole("navigation"));
  for (const n of NAV) expect(nav.getByRole("link", { name: n.label })).toHaveClass("whitespace-nowrap");
});

test("면적 단위 토글이 헤더에 있다", () => {
  render(<SiteHeader />);
  expect(screen.getByRole("radiogroup")).toBeInTheDocument();
});
