import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SAMPLE_FILE } from "@/test/zones.fixture";

const fetchZones = vi.fn();
vi.mock("@/lib/data", () => ({ fetchZones: (...a: unknown[]) => fetchZones(...a) }));
const mod = await import("../redevelopment/page");
const Page = mod.default;

test("ISR 3600, 메타데이터 제목·canonical", async () => {
  expect(mod.revalidate).toBe(3600);
  const m = await mod.generateMetadata();
  expect(m.title).toBe("재건축·재개발 현황");
  expect(m.alternates?.canonical).toBe("/redevelopment");
  expect(m.openGraph).toMatchObject({ url: "/redevelopment", siteName: "집시세" });
});

test("표본 데이터로 목록 렌더", async () => {
  fetchZones.mockResolvedValue(SAMPLE_FILE);
  render(await Page());
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("재건축·재개발 현황");
  expect(screen.getByText("은마구역")).toBeTruthy();
});

test.each([["null", null], ["throw", new Error("boom")], ["깨진 JSON", {}]])("%s 여도 빈 상태 렌더(500 아님)", async (_n, v) => {
  if (v instanceof Error) fetchZones.mockRejectedValue(v);
  else fetchZones.mockResolvedValue(v);
  render(await Page());
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("재건축·재개발 현황");
  expect(screen.getByText(/아직 없습니다/)).toBeTruthy();
});
