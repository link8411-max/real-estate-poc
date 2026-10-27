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
  it("mode=rent is kept; anything else is trade (omitted)", () => {
    expect(parseApartmentFilters(sp("mode=rent")).mode).toBe("rent");
    expect(parseApartmentFilters(sp("mode=trade"))).toEqual({ sort: "latest", page: 1 });
    expect(parseApartmentFilters(sp("mode=x"))).toEqual({ sort: "latest", page: 1 });
  });
  it("drops non-digit lawd codes", () => {
    expect(parseApartmentFilters(sp("lawd=11680,x),1")).lawd).toEqual(["11680"]);
  });
});

describe("parseApartmentFilters bounds", () => {
  it.each([
    ["page=1e21"], ["page=10001"], ["page=1.5"],
    ["builtFrom=2000.5"], ["builtFrom=1899"], ["builtTo=2101"],
    ["minPrice=1e30"], ["maxPrice=-1"], ["minPrice=10000001"],
    ["minArea=1001"], ["maxArea=5.5"],
    ["activeMonths=241"], ["activeMonths=0"], ["activeMonths=1.5"],
  ])("ignores %s", (q) => {
    expect(parseApartmentFilters(sp(q))).toEqual({ sort: "latest", page: 1 });
  });
  it("accepts boundaries", () => {
    const f = parseApartmentFilters(sp("page=10000&minPrice=0&maxPrice=10000000&maxArea=1000&builtFrom=1900&builtTo=2100&activeMonths=240"));
    expect(f).toMatchObject({ page: 10000, minPrice: 0, maxPrice: 10000000, maxArea: 1000, builtFrom: 1900, builtTo: 2100, activeMonths: 240 });
  });
});

describe("applyFilters", () => {
  it("rent mode applies price bounds to the jeonse deposit", () => {
    const { q, calls } = recorder();
    applyFilters(q, { mode: "rent", minPrice: 1, maxPrice: 2, sort: "latest", page: 1 });
    expect(calls.slice(0, 2)).toEqual([
      ["gte", "latest_jeonse_deposit", 1],
      ["lte", "latest_jeonse_deposit", 2],
    ]);
  });
  it("rent mode area bounds keep rows without a trade area (rent-only complexes)", () => {
    const both = recorder();
    applyFilters(both.q, { mode: "rent", minArea: 59, maxArea: 85, sort: "latest", page: 1 });
    expect(both.calls.slice(0, 1)).toEqual([
      ["or", "latest_trade_area.is.null,and(latest_trade_area.gte.59,latest_trade_area.lte.85)"],
    ]);
    expect(both.calls.some(([n, c]) => (n === "gte" || n === "lte") && c === "latest_trade_area")).toBe(false);

    const minOnly = recorder();
    applyFilters(minOnly.q, { mode: "rent", minArea: 59, sort: "latest", page: 1 });
    expect(minOnly.calls[0]).toEqual(["or", "latest_trade_area.is.null,latest_trade_area.gte.59"]);

    const maxOnly = recorder();
    applyFilters(maxOnly.q, { mode: "rent", maxArea: 85, sort: "latest", page: 1 });
    expect(maxOnly.calls[0]).toEqual(["or", "latest_trade_area.is.null,latest_trade_area.lte.85"]);
  });
  it("rent mode or() filter is built only from validated integers", () => {
    const f = parseApartmentFilters(sp("mode=rent&minArea=59),id.gt.0&maxArea=85.5"));
    expect(f.minArea).toBeUndefined();
    expect(f.maxArea).toBeUndefined();
    const { q, calls } = recorder();
    applyFilters(q, f);
    expect(calls.some(([n]) => n === "or")).toBe(false);
  });
  it("trade mode area bounds stay plain gte/lte", () => {
    const { q, calls } = recorder();
    applyFilters(q, { minArea: 59, maxArea: 85, sort: "latest", page: 1 });
    expect(calls.slice(0, 2)).toEqual([
      ["gte", "latest_trade_area", 59],
      ["lte", "latest_trade_area", 85],
    ]);
  });
  it("applies nothing for defaults except sort", () => {
    const { q, calls } = recorder();
    applyFilters(q, { sort: "latest", page: 1 }, new Date("2026-10-27"));
    expect(calls).toEqual([["order", "latest_trade_date", { ascending: false, nullsFirst: false }],
    ["order", "id", { ascending: true }]]);
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
      ["order", "id", { ascending: true }],
    ]);
  });
  it("sort variants", () => {
    const run = (sort: "price_desc" | "price_asc" | "yoy_desc") => {
      const { q, calls } = recorder();
      applyFilters(q, { sort, page: 1 });
      expect(calls[calls.length - 1]).toEqual(["order", "id", { ascending: true }]);
      return calls[0];
    };
    expect(run("price_desc")).toEqual(["order", "latest_trade_amount", { ascending: false, nullsFirst: false }]);
    expect(run("price_asc")).toEqual(["order", "latest_trade_amount", { ascending: true, nullsFirst: false }]);
    expect(run("yoy_desc")).toEqual(["order", "latest_trade_date", { ascending: false, nullsFirst: false }]);
  });
});

describe("helpers", () => {
  it("monthsAgoISO end-of-month clamp", () => {
    expect(monthsAgoISO(1, new Date("2026-10-31T00:00:00Z"))).toBe("2026-09-30");
    expect(monthsAgoISO(1, new Date("2026-03-31T00:00:00Z"))).toBe("2026-02-28");
  });
  it("monthsAgoISO uses KST date", () => {
    expect(monthsAgoISO(1, new Date("2026-10-30T16:00:00Z"))).toBe("2026-09-30");
  });
  it("escapeLike strips *", () => expect(escapeLike("a*b")).toBe("ab"));
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
