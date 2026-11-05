import { afterEach, describe, expect, test, vi } from "vitest";
import { setSupplyEnabledForTest } from "@/lib/supply";

const calls: [string, ...unknown[]][] = [];
const builder: Record<string, unknown> = new Proxy(
  {},
  {
    get: (_t, name: string) => {
      if (name === "then") return undefined;
      return (...args: unknown[]) => {
        calls.push([name, ...args]);
        return name === "limit" ? Promise.resolve({ data: [], error: null }) : builder;
      };
    },
  },
);
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: () => ({ from: () => builder }) }));

const { GET, MAP_COLUMNS } = await import("../route");
const url = (extra = "") => new Request(`http://x/api/v1/map?minLat=37&maxLat=37.1&minLng=127&maxLng=127.1&level=5${extra}`);

afterEach(() => {
  setSupplyEnabledForTest(false);
  calls.length = 0;
});

describe("지도 API 공급평", () => {
  test("flag off: select 에 새 열이 없고 minPy 는 무시된다", async () => {
    await GET(url("&minPy=30&maxPy=39"));
    const select = calls.find(([n]) => n === "select")!;
    expect(select[1]).toBe(MAP_COLUMNS);
    expect(calls.some(([, c]) => c === "latest_supply_min")).toBe(false);
  });
  test("flag on: 세 열을 select 하고 latest_supply_min 에 gte/lte", async () => {
    setSupplyEnabledForTest(true);
    await GET(url("&minPy=30&maxPy=39"));
    const select = calls.find(([n]) => n === "select")!;
    expect(String(select[1]).split(",")).toEqual(expect.arrayContaining(["latest_supply_min", "latest_supply_max", "latest_supply_approx"]));
    expect(calls).toContainEqual(["gte", "latest_supply_min", 30]);
    expect(calls).toContainEqual(["lte", "latest_supply_min", 39]);
  });
});
