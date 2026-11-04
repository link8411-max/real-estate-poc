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

test("메타데이터: openGraph·twitter", async () => {
  const { generateMetadata } = await import("../canceled/page");
  const m = await generateMetadata();
  expect(m.openGraph).toMatchObject({ title: "취소된 신고가", url: "/canceled", type: "website", siteName: "집시세", locale: "ko_KR", description: m.description });
  expect(m.twitter).toMatchObject({ card: "summary", title: "취소된 신고가", description: m.description });
});

test("신고가 페이지로 가는 링크 한 줄", async () => {
  fetchCanceledRecent.mockResolvedValue(null);
  render(await Page());
  expect(screen.getByRole("link", { name: /최근 신고가/ })).toHaveAttribute("href", "/highs");
});
