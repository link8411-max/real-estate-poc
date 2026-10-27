import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useMapData } from "../useMapData";

const gangnam = { minLat: 37.49, minLng: 127.03, maxLat: 37.5, maxLng: 127.05 };
const seoul = { minLat: 37.4, minLng: 126.8, maxLat: 37.7, maxLng: 127.2 };
const wide = { minLat: 36, minLng: 126, maxLat: 38, maxLng: 128 };

type Pending = { url: string; signal: AbortSignal; resolve: (body: unknown, status?: number) => void };
let pending: Pending[];

beforeEach(() => {
  pending = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      return new Promise<Response>((res, rej) => {
        const signal = init.signal!;
        signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
        pending.push({ url, signal, resolve: (body, status = 200) => res(Response.json(body, { status })) });
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("useMapData", () => {
  test("bounds·level·mode·필터를 쿼리로 /api/v1/map을 호출하고 단지 응답을 돌려준다", async () => {
    const { result } = renderHook(() => useMapData(gangnam, 5, "rent", { minPrice: "50000" }));
    expect(result.current.loading).toBe(true);
    expect(pending).toHaveLength(1);
    const u = new URL(pending[0].url, "http://x");
    expect(u.pathname).toBe("/api/v1/map");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      minLat: "37.49", minLng: "127.03", maxLat: "37.5", maxLng: "127.05",
      level: "5", mode: "rent", minPrice: "50000",
    });
    pending[0].resolve({ type: "apartments", items: [{ id: 1 }] });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ type: "apartments", items: [{ id: 1 }] });
    expect(result.current.error).toBeNull();
  });

  test("지역 응답(type=regions)도 그대로 돌려준다", async () => {
    const { result } = renderHook(() => useMapData(seoul, 8, "trade", {}));
    pending[0].resolve({ type: "regions", items: [{ code: "11110" }] });
    await waitFor(() => expect(result.current.data?.type).toBe("regions"));
  });

  test("bounds가 바뀌면 이전 요청을 abort하고 늦게 온 이전 응답은 무시한다", async () => {
    const { result, rerender } = renderHook(({ b }) => useMapData(b, 5, "trade", {}), { initialProps: { b: gangnam } });
    rerender({ b: { ...gangnam, maxLat: 37.51 } });
    expect(pending).toHaveLength(2);
    expect(pending[0].signal.aborted).toBe(true);
    expect(pending[1].signal.aborted).toBe(false);
    pending[1].resolve({ type: "apartments", items: [{ id: 2 }] });
    await waitFor(() => expect(result.current.data?.items).toEqual([{ id: 2 }]));
    expect(result.current.error).toBeNull();
  });

  test("필터 객체가 새로 만들어져도 값이 같으면 다시 호출하지 않는다", () => {
    const { rerender } = renderHook(({ f }) => useMapData(gangnam, 5, "trade", f), { initialProps: { f: { minArea: "66" } } });
    rerender({ f: { minArea: "66" } });
    expect(pending).toHaveLength(1);
  });

  test("레벨 7 이하에서 범위가 1.5도를 넘으면 호출하지 않고 tooWide", () => {
    const { result } = renderHook(() => useMapData(wide, 6, "trade", {}));
    expect(pending).toHaveLength(0);
    expect(result.current.tooWide).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  test("크기 0인(min == max) bounds는 호출하지 않는다", () => {
    const point = { minLat: 37.5664005, minLng: 126.9779053, maxLat: 37.5664005, maxLng: 126.9779053 };
    const { result } = renderHook(() => useMapData(point, 8, "trade", {}));
    expect(pending).toHaveLength(0);
    expect(result.current).toEqual({ data: null, loading: false, error: null, tooWide: false });
    renderHook(() => useMapData({ ...gangnam, maxLng: gangnam.minLng + 1e-7 }, 5, "trade", {}));
    expect(pending).toHaveLength(0);
  });

  test("bounds가 없으면 호출하지 않는다", () => {
    const { result } = renderHook(() => useMapData(null, 8, "trade", {}));
    expect(pending).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });

  test("HTTP 오류는 한국어 error로 노출", async () => {
    const { result } = renderHook(() => useMapData(gangnam, 5, "trade", {}));
    pending[0].resolve({ error: { code: "upstream", message: "x" } }, 500);
    await waitFor(() => expect(result.current.error).toBe("지도 데이터를 불러오지 못했습니다."));
    expect(result.current.loading).toBe(false);
  });

  test("언마운트 시 진행 중 요청을 abort", () => {
    const { unmount } = renderHook(() => useMapData(gangnam, 5, "trade", {}));
    unmount();
    expect(pending[0].signal.aborted).toBe(true);
  });
});
