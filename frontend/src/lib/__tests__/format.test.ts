import { afterEach, describe, expect, test } from "vitest";
import { setSupplyEnabledForTest } from "@/lib/supply";
import { areaToPyeong, formatArea, formatExactArea, formatDeal, formatManwon, formatPrice } from "@/lib/format";

describe("formatManwon", () => {
  test("억 단위", () => {
    expect(formatManwon(125000)).toBe("12억 5,000");
    expect(formatManwon(100000)).toBe("10억");
    expect(formatManwon(10000)).toBe("1억");
    expect(formatManwon(10500)).toBe("1억 500");
  });
  test("1억 미만", () => {
    expect(formatManwon(9500)).toBe("9,500");
    expect(formatManwon(0)).toBe("0");
  });
  test("음수", () => {
    expect(formatManwon(-125000)).toBe("-12억 5,000");
    expect(formatManwon(-500)).toBe("-500");
  });
});

test("areaToPyeong", () => {
  expect(areaToPyeong(84.99)).toBe(26);
  expect(areaToPyeong(59.96)).toBe(18);
});

test("formatDeal", () => {
  expect(formatDeal("2026-10-06")).toBe("26.10.06");
});

describe("formatArea", () => {
  test("기본은 평: 전용 평 (㎡), 평형 그룹(버림) 기준", () => {
    expect(formatArea(84)).toBe("전용 25평 (84㎡)");
    expect(formatArea(84.88)).toBe("전용 25평 (84㎡)");
    expect(formatArea(59.53, "pyeong")).toBe("전용 18평 (59㎡)");
  });
  test("㎡ 모드: 기존 형식", () => {
    expect(formatArea(84, "m2")).toBe("84㎡ (전용 25평)");
    expect(formatArea(84.88, "m2")).toBe("84㎡ (전용 25평)");
    expect(formatArea(59.53, "m2")).toBe("59㎡ (전용 18평)");
  });
});

describe("formatExactArea", () => {
  test("평: 소수 1자리", () => {
    expect(formatExactArea(80.87, "pyeong")).toBe("전용 24.5평");
    expect(formatExactArea(80.87)).toBe("전용 24.5평");
  });
  test("㎡: 소수 2자리까지, 끝 0 제거", () => {
    expect(formatExactArea(80.87, "m2")).toBe("80.87㎡");
    expect(formatExactArea(84.2, "m2")).toBe("84.2㎡");
    expect(formatExactArea(84, "m2")).toBe("84㎡");
  });
});

describe("formatPrice", () => {
  test("단위 붙인 문장용 금액", () => {
    expect(formatPrice(245000)).toBe("24억 5,000만원");
    expect(formatPrice(100000)).toBe("10억원");
    expect(formatPrice(9500)).toBe("9,500만원");
  });
});

describe("공급평 플래그", () => {
  const exact = { min: 33, max: 33, approx: false };
  afterEach(() => setSupplyEnabledForTest(false));

  test("flag off keeps legacy labels", () => {
    expect(formatArea(84.88, "pyeong", exact)).toBe("전용 25평 (84㎡)");
    expect(formatArea(84.88, "m2", exact)).toBe("84㎡ (전용 25평)");
    expect(formatExactArea(80.87, "pyeong", exact)).toBe("전용 24.5평");
  });
  test("flag on exact", () => {
    setSupplyEnabledForTest(true);
    expect(formatArea(84.88, "pyeong", exact)).toBe("33평 · 84㎡");
    expect(formatArea(84.88, "m2", exact)).toBe("84㎡ (33평)");
    expect(formatExactArea(80.87, "pyeong", exact)).toBe("33평 · 80.87㎡");
    expect(formatExactArea(80.87, "m2", exact)).toBe("80.87㎡ (33평)");
  });
  test("flag on approx", () => {
    setSupplyEnabledForTest(true);
    const a = { min: 34, max: 34, approx: true };
    expect(formatArea(84.88, "pyeong", a)).toBe("약 34평 · 84㎡");
    expect(formatArea(84.88, "m2", a)).toBe("84㎡ (약 34평)");
  });
  test("flag on range", () => {
    setSupplyEnabledForTest(true);
    const r = { min: 33, max: 34, approx: false };
    expect(formatArea(84.88, "pyeong", r)).toBe("33~34평 · 84㎡");
    expect(formatExactArea(80.87, "pyeong", r)).toBe("33~34평 · 80.87㎡");
  });
  test("flag on missing never shows 전용평", () => {
    setSupplyEnabledForTest(true);
    expect(formatArea(84.88, "pyeong", null)).toBe("84㎡");
    expect(formatArea(84.88, "m2")).toBe("84㎡");
    expect(formatExactArea(80.87, "pyeong", null)).toBe("80.87㎡");
  });
});
