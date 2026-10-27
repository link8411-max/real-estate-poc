import { describe, it, expect } from "vitest";
import {
  parseApartmentFilters,
  applyFilters,
  parseBbox,
  escapeLike,
  monthsAgoISO,
  PAGE_SIZE,
  type FilterableQuery,
} from "@/lib/filters";

const sp = (s: string) => new URLSearchParams(s);

function recorder() {
  const calls: [string, ...unknown[]][] = [];
  const q = new Proxy({} as Record<string, unknown>, {
    get: (_t, name: string) => (...args: unknown[]) => {
      calls.push([name, ...args]);
      return q;
    },
  }) as unknown as FilterableQuery;
  return { q, calls };
}

describe("parseApartmentFilters", () => {
  it("defaults", () => {
    expect(parseApartmentFilters(sp(""))).toEqual({ sort: "latest", page: 1 });
  });
  it("parses valid values", () => {
    const f = parseApartmentFilters(
      sp("lawd=11680,11650&city=서울&minPrice=10000&maxPrice=50000&minArea=59&maxArea=84&builtFrom=2000&builtTo=2020&activeMonths=12&sort=price_desc&page=3"),
    );
    expect(f).toEqual({
      lawd: ["11680", "11650"], city: "서울", minPrice: 10000, maxPrice: 50000,
      minArea: 59, maxArea: 84, builtFrom: 2000, builtTo: 2020, activeMonths: 12,
      sort: "price_desc", page: 3,
    });
  });
  it("ignores invalid numbers", () => {
    const f = parseApartmentFilters(sp("minPrice=abc&maxPrice=&page=0&activeMonths=-3&builtFrom=Infinity"));
    expect(f).toEqual({ sort: "latest", page: 1 });
  });
  it("sort whitelist", () => {
    expect(parseApartmentFilters(sp("sort=drop")).sort).toBe("latest");
    expect(parseApartmentFilters(sp("sort=yoy_desc")).sort).toBe("yoy_desc");
  });
  it("drops non-digit lawd codes", () => {
    expect(parseApartmentFilters(sp("lawd=11680,x),1")).lawd).toEqual(["11680"]);
  });
});

describe("applyFilters", () => {
  it("applies nothing for defaults except sort", () => {
    const { q, calls } = recorder();
    applyFilters(q, { sort: "latest", page: 1 }, new Date("2026-10-27"));
    expect(calls).toEqual([["order", "latest_trade_date", { ascending: false, nullsFirst: false }]]);
  });
  it("applies all filters", () => {
    const { q, calls } = recorder();
    applyFilters(
      q,
      { lawd: ["11680"], city: "서울", minPrice: 1, maxPrice: 2, minArea: 3, maxArea: 4, builtFrom: 5, builtTo: 6, activeMonths: 3, sort: "count_desc", page: 1 },
      new Date("2026-10-27T00:00:00Z"),
    );
    expect(calls).toEqual([
      ["in", "lawd_cd", ["11680"]],
      ["eq", "city", "서울"],
      ["gte", "latest_trade_amount", 1],
      ["lte", "latest_trade_amount", 2],
      ["gte", "latest_trade_area", 3],
      ["lte", "latest_trade_area", 4],
      ["gte", "build_year", 5],
      ["lte", "build_year", 6],
      ["gte", "latest_trade_date", "2026-07-27"],
      ["order", "trade_count", { ascending: false, nullsFirst: false }],
    ]);
  });
  it("sort variants", () => {
    const run = (sort: "price_desc" | "price_asc" | "yoy_desc") => {
      const { q, calls } = recorder();
      applyFilters(q, { sort, page: 1 });
      return calls[0];
    };
    expect(run("price_desc")).toEqual(["order", "latest_trade_amount", { ascending: false, nullsFirst: false }]);
    expect(run("price_asc")).toEqual(["order", "latest_trade_amount", { ascending: true, nullsFirst: false }]);
    expect(run("yoy_desc")).toEqual(["order", "latest_trade_date", { ascending: false, nullsFirst: false }]);
  });
});

describe("helpers", () => {
  it("monthsAgoISO", () => {
    expect(monthsAgoISO(12, new Date("2026-10-27T00:00:00Z"))).toBe("2025-10-27");
  });
  it("escapeLike", () => {
    expect(escapeLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
  it("PAGE_SIZE", () => expect(PAGE_SIZE).toBe(50));
  it("parseBbox ok", () => {
    expect(parseBbox(sp("minLat=1&minLng=2&maxLat=3&maxLng=4"))).toEqual({ ok: true, bbox: { minLat: 1, minLng: 2, maxLat: 3, maxLng: 4 } });
  });
  it("parseBbox missing / NaN / inverted", () => {
    expect(parseBbox(sp("minLat=1&minLng=2&maxLat=3")).ok).toBe(false);
    expect(parseBbox(sp("minLat=a&minLng=2&maxLat=3&maxLng=4")).ok).toBe(false);
    expect(parseBbox(sp("minLat=5&minLng=2&maxLat=3&maxLng=4")).ok).toBe(false);
  });
});
