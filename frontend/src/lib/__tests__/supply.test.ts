import { afterEach, describe, expect, test } from "vitest";
import { exactLabel, findType, groupLabel, setSupplyEnabledForTest, supplyPyeong } from "@/lib/supply";

afterEach(() => setSupplyEnabledForTest(false));

describe("supplyPyeong", () => {
  test("버림", () => {
    expect(supplyPyeong(111.52)).toBe(33);
    expect(supplyPyeong(84.75)).toBe(25);
  });
});

const types = [{ excl: 84.8, supply: 111.52, approx: false }];

describe("findType", () => {
  test("±0.05 허용", () => {
    expect(findType(types, 84.84)).toEqual(types[0]);
    expect(findType(types, 84.9)).toBeNull();
  });
});

describe("exactLabel / groupLabel", () => {
  const two = [
    { excl: 84.8, supply: 111.52, approx: false },
    { excl: 84.88, supply: 112.9, approx: true },
  ];
  test("groupLabel 범위", () => {
    expect(groupLabel(two, 84)).toEqual({ min: 33, max: 34, approx: true });
  });
  test("groupLabel 없음", () => {
    expect(groupLabel(undefined, 84)).toBeNull();
    expect(groupLabel([], 84)).toBeNull();
    expect(groupLabel(two, 59)).toBeNull();
  });
  test("exactLabel: 정확 일치", () => {
    expect(exactLabel(two, 84.8)).toEqual({ min: 33, max: 33, approx: false });
  });
  test("exactLabel: 일치 실패 시 묶음", () => {
    expect(exactLabel(two, 84.5)).toEqual({ min: 33, max: 34, approx: true });
    expect(exactLabel(undefined, 84.5)).toBeNull();
  });
});
