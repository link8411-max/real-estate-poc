// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { clearCompare, getCompareIds, toggleCompare } from "../compare";

describe("compare", () => {
  test("처음엔 비어 있다", () => {
    expect(getCompareIds()).toEqual([]);
  });

  test("toggle로 추가·제거, localStorage에 저장", () => {
    expect(toggleCompare(1)).toEqual([1]);
    expect(toggleCompare(2)).toEqual([1, 2]);
    expect(getCompareIds()).toEqual([1, 2]);
    expect(toggleCompare(1)).toEqual([2]);
    expect(getCompareIds()).toEqual([2]);
  });

  test("2개 초과면 가장 오래된 것 제거", () => {
    toggleCompare(1);
    toggleCompare(2);
    expect(toggleCompare(3)).toEqual([2, 3]);
    expect(getCompareIds()).toEqual([2, 3]);
  });

  test("clearCompare", () => {
    toggleCompare(1);
    clearCompare();
    expect(getCompareIds()).toEqual([]);
  });

  test("깨진 저장값은 무시", () => {
    localStorage.setItem("compare_ids", "{bad");
    expect(getCompareIds()).toEqual([]);
    localStorage.setItem("compare_ids", JSON.stringify(["x", 5, 6, 7]));
    expect(getCompareIds()).toEqual([6, 7]);
  });
});
