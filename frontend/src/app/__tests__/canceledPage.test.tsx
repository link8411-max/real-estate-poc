import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const fetchCanceledRecent = vi.fn();
vi.mock("@/lib/data", () => ({ fetchCanceledRecent: (...a: unknown[]) => fetchCanceledRecent(...a) }));
vi.mock("@/lib/areaUnit", () => ({ useAreaUnit: () => ["pyeong", () => {}] }));
const { default: Page } = await import("../canceled/page");

test("null 이어도 빈 상태 렌더", async () => {
  fetchCanceledRecent.mockResolvedValue(null);
  render(await Page());
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("최근 30일 취소된 신고가가 없습니다");
});

test("throw 해도 빈 상태 렌더", async () => {
  fetchCanceledRecent.mockRejectedValue(new Error("boom"));
  render(await Page());
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("최근 30일 취소된 신고가가 없습니다");
});
