import { afterEach, describe, expect, test } from "vitest";
import { exactLabel, findType, groupLabel, setSupplyEnabledForTest, supplyPyeong } from "@/lib/supply";

afterEach(() => setSupplyEnabledForTest(false));

describe("supplyPyeong", () => {
  test("버림", () => {
    expect(supplyPyeong(111.52)).toBe(33);
    expect(supplyPyeong(84.75)).toBe(25);
    expect(supplyPyeong(82.55)).toBe(25); // .95 이상은 올림(대장·분양 면적 오차)
    expect(supplyPyeong(108.82)).toBe(32);
  });
});

const types = [{ excl: 84.8, supply: 111.52, approx: false }];

describe("findType", () => {
  test("±0.05 허용", () => {
    expect(findType(types, 84.84)).toEqual(types[0]);
    expect(findType(types, 84.9)).toBeNull();
  });
  test("경계 ±0.05 포함(부동소수 오차 허용)", () => {
    expect(findType(types, 84.85)).toEqual(types[0]);
    expect(findType([{ excl: 84.85, supply: 1, approx: false }], 84.8)).not.toBeNull();
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

describe("groupLabel 평형 묶음", () => {
  const boundary = [
    { excl: 84.97, supply: 111.52, approx: false },
    { excl: 85.01, supply: 115.0, approx: false },
  ];
  test("84 묶음에 85.01 주택형도 들어간다", () => {
    expect(groupLabel(boundary, 84)).toEqual({ min: 33, max: 34, approx: false });
  });
  test("exactLabel 일치 실패 시 같은 묶음 범위", () => {
    expect(exactLabel(boundary, 85.3)).toEqual({ min: 33, max: 34, approx: false });
  });
});
