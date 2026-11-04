import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const fetchAptTrade = vi.fn();
const fetchAptRent = vi.fn();
vi.mock("@/lib/data", () => ({
  fetchAptTrade: (...a: unknown[]) => fetchAptTrade(...a),
  fetchAptRent: (...a: unknown[]) => fetchAptRent(...a),
}));
vi.mock("@/components/CompareFromStorage", () => ({ default: () => <div>storage</div> }));
vi.mock("@/components/CompareTable", () => ({
  default: ({ items }: { items: { apartment: { name: string } }[] }) => <div>{items.map((i) => i.apartment.name).join(",")}</div>,
}));

const page = await import("../compare/page");
const apt = { apartment: { id: 1, name: "남은단지" }, area_stats: [], metrics: {}, transactions: [] };

beforeEach(() => {
  fetchAptTrade.mockReset();
  fetchAptRent.mockReset().mockResolvedValue(null);
});

describe("비교 페이지", () => {
  test("moved 응답은 없음으로 취급하고 크래시하지 않는다", async () => {
    fetchAptTrade.mockImplementation(async (id: number) => (id === 1 ? apt : { moved_to: 1 }));
    fetchAptRent.mockImplementation(async (id: number) => (id === 1 ? null : { moved_to: 1 }));
    render(await page.default({ searchParams: Promise.resolve({ ids: "1,2" }) }));
    expect(screen.getByText("남은단지")).toBeInTheDocument();
  });
  test("전부 moved 면 찾을 수 없음 문구", async () => {
    fetchAptTrade.mockResolvedValue({ moved_to: 1 });
    render(await page.default({ searchParams: Promise.resolve({ ids: "2" }) }));
    expect(screen.getByText("비교할 단지를 찾을 수 없습니다")).toBeInTheDocument();
  });
});
