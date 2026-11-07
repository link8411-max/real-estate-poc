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
  expect(m.openGraph).toMatchObject({ url: "/highs", siteName: "집시세", description: m.description });
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

test("서버 HTML 에 소개 문단", async () => {
  fetchHighsRecent.mockResolvedValue({ items: [{ tx_id: 1, apt_id: 1, apt_name: "가나다", region_name: "서울 강남구", city: "서울", lawd_cd: "11680", dong: "역삼동", area: 84, area_group: 84, floor: 1, amount: 120000, prev_max: 100000, jump: 20000, jump_pct: 20, deal_date: "2026-10-01" }] });
  render(await Page());
  expect(screen.getByText(/최근 30일 수도권 아파트 신고가는 1건으로 서울 1건입니다.*가장 큰 상승은 가나다 \+20%입니다/)).toBeInTheDocument();
});
