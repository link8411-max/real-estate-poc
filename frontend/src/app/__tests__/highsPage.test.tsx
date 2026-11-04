import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const fetchHighsRecent = vi.fn();
vi.mock("@/lib/data", () => ({ fetchHighsRecent: (...a: unknown[]) => fetchHighsRecent(...a) }));
vi.mock("@/lib/areaUnit", () => ({ useAreaUnit: () => ["pyeong", () => {}] }));
const mod = await import("../highs/page");
const Page = mod.default;

test("ISR 3600, 메타데이터", async () => {
  expect(mod.revalidate).toBe(3600);
  const m = await mod.generateMetadata();
  expect(m.alternates?.canonical).toBe("/highs");
  expect(m.openGraph).toMatchObject({ url: "/highs", siteName: "수도권 아파트 실거래가", description: m.description });
});

test("null 이어도 빈 상태 렌더 (첫 배포 직후)", async () => {
  fetchHighsRecent.mockResolvedValue(null);
  render(await Page());
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("최근 30일 신고가가 없습니다");
});

test("throw 해도 빈 상태 렌더", async () => {
  fetchHighsRecent.mockRejectedValue(new Error("boom"));
  render(await Page());
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("최근 30일 신고가가 없습니다");
});

test("items 없는 깨진 JSON 도 빈 상태", async () => {
  fetchHighsRecent.mockResolvedValue({});
  render(await Page());
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("최근 30일 신고가가 없습니다");
});
