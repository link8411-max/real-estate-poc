import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import ApartmentNotFound from "../apartment/[id]/not-found";
import AppError from "../error";
import NotFound from "../not-found";

describe("not-found / error 페이지", () => {
  test("전역 404는 한국어 안내와 홈 링크", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "페이지를 찾을 수 없습니다" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "홈으로" })).toHaveAttribute("href", "/");
  });

  test("아파트 404는 검색·홈 링크", () => {
    render(<ApartmentNotFound />);
    expect(screen.getByRole("heading", { name: "아파트를 찾을 수 없습니다" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "아파트 검색" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "홈으로" })).toHaveAttribute("href", "/");
  });

  test("에러 페이지의 다시 시도는 reset을 부른다", async () => {
    const reset = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AppError error={new Error("fetch failed: 503")} reset={reset} />);
    expect(screen.getByRole("heading", { name: "데이터를 불러오지 못했습니다" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(reset).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
