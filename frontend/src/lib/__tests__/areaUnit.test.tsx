import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { DEFAULT_AREA_UNIT, useAreaUnit } from "../areaUnit";

describe("useAreaUnit", () => {
  test("기본값은 평", () => {
    expect(DEFAULT_AREA_UNIT).toBe("pyeong");
    const { result } = renderHook(() => useAreaUnit());
    expect(result.current[0]).toBe("pyeong");
  });

  test("저장된 값을 복원한다", () => {
    localStorage.setItem("areaUnit", "m2");
    const { result } = renderHook(() => useAreaUnit());
    expect(result.current[0]).toBe("m2");
  });

  test("깨진 값이면 기본값", () => {
    localStorage.setItem("areaUnit", "acre");
    const { result } = renderHook(() => useAreaUnit());
    expect(result.current[0]).toBe("pyeong");
  });

  test("변경하면 저장되고 같은 탭의 다른 구독자도 갱신", () => {
    const a = renderHook(() => useAreaUnit());
    const b = renderHook(() => useAreaUnit());
    act(() => a.result.current[1]("m2"));
    expect(localStorage.getItem("areaUnit")).toBe("m2");
    expect(a.result.current[0]).toBe("m2");
    expect(b.result.current[0]).toBe("m2");
  });

  test("setItem이 예외를 던져도 무시한다", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem");
    const orig = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error("quota");
    };
    const { result } = renderHook(() => useAreaUnit());
    expect(() => act(() => result.current[1]("m2"))).not.toThrow();
    localStorage.setItem = orig;
    spy.mockRestore();
  });
});
