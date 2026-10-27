import { describe, expect, test } from "vitest";
import {
  AREA_PRESETS,
  areaPresetLabel,
  BUILT_PRESETS,
  builtFromYears,
  countActiveFilters,
  exceedsMapSpan,
  formatMapLabel,
  readInitialView,
  readMapFilters,
  toApiQuery,
} from "../mapFilters";

describe("formatMapLabel", () => {
  test("억 단위는 소수 한 자리", () => {
    expect(formatMapLabel(123000)).toBe("12.3억");
    expect(formatMapLabel(10000)).toBe("1억");
    expect(formatMapLabel(298000)).toBe("29.8억");
    expect(formatMapLabel(15049)).toBe("1.5억");
  });
  test("1억 미만은 만원 그대로 천 단위 구분", () => {
    expect(formatMapLabel(9500)).toBe("9,500");
  });
});

describe("AREA_PRESETS", () => {
  test("구간은 겹치지 않는 정수 ㎡: ~65, 66–98, 99–131, 132+", () => {
    expect(AREA_PRESETS.map((p) => [p.minArea, p.maxArea])).toEqual([
      [undefined, 65],
      [66, 98],
      [99, 131],
      [132, undefined],
    ]);
  });
  test("평 단위 라벨", () => {
    expect(AREA_PRESETS.map((p) => areaPresetLabel(p, "pyeong"))).toEqual(["~20평", "20평대", "30평대", "40평+"]);
  });
  test("㎡ 단위 라벨", () => {
    expect(AREA_PRESETS.map((p) => areaPresetLabel(p, "m2"))).toEqual(["~65㎡", "66~98㎡", "99~131㎡", "132㎡+"]);
  });
});

describe("readMapFilters / toApiQuery", () => {
  test("URL 쿼리에서 지도 필터만 읽고 API 쿼리로 옮긴다", () => {
    const f = readMapFilters(new URLSearchParams("mode=rent&minPrice=50000&maxArea=98&minArea=66&lat=37&zz=1"));
    expect(f).toEqual({ mode: "rent", minPrice: 50000, minArea: 66, maxArea: 98 });
    expect(toApiQuery(f)).toEqual({ minPrice: "50000", minArea: "66", maxArea: "98" });
  });
  test("모드 기본값은 매매, 숫자가 아닌 값은 무시", () => {
    expect(readMapFilters(new URLSearchParams("mode=x&minPrice=abc"))).toEqual({ mode: "trade" });
  });
  test("활성 필터 수(거래종류 제외)", () => {
    expect(countActiveFilters({ mode: "rent" })).toBe(0);
    expect(countActiveFilters({ mode: "trade", minPrice: 1, maxPrice: 2, minArea: 66, maxArea: 99, builtFrom: 2020 })).toBe(3);
  });
});

describe("BUILT_PRESETS", () => {
  test("N년 이내 → 올해 − N", () => {
    expect(BUILT_PRESETS).toEqual([5, 10, 20]);
    expect(builtFromYears(5, new Date("2026-10-27T12:00:00+09:00"))).toBe(2021);
    expect(builtFromYears(20, new Date("2026-10-27T12:00:00+09:00"))).toBe(2006);
  });
});

describe("exceedsMapSpan", () => {
  const b = (dLat: number, dLng: number) => ({ minLat: 37, minLng: 127, maxLat: 37 + dLat, maxLng: 127 + dLng });
  test("레벨 7 이하에서 1.5도 초과면 true", () => {
    expect(exceedsMapSpan(b(1.6, 0.1), 7)).toBe(true);
    expect(exceedsMapSpan(b(0.1, 1.6), 5)).toBe(true);
    expect(exceedsMapSpan(b(1.5, 1.5), 7)).toBe(false);
  });
  test("레벨 8 이상은 지역 모드라 제한 없음", () => {
    expect(exceedsMapSpan(b(3, 3), 8)).toBe(false);
  });
});

describe("readInitialView", () => {
  test("기본은 서울시청, 레벨 8", () => {
    expect(readInitialView(new URLSearchParams())).toEqual({ center: { lat: 37.5665, lng: 126.978 }, level: 8 });
  });
  test("URL의 lat·lng·level을 쓴다", () => {
    expect(readInitialView(new URLSearchParams("lat=37.5&lng=127.05&level=5"))).toEqual({
      center: { lat: 37.5, lng: 127.05 },
      level: 5,
    });
  });
  test("범위를 벗어나거나 잘못된 값은 기본값", () => {
    expect(readInitialView(new URLSearchParams("lat=10&lng=abc&level=99"))).toEqual({
      center: { lat: 37.5665, lng: 126.978 },
      level: 8,
    });
  });
});
