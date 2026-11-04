import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { SAMPLE_FILE } from "@/test/zones.fixture";

const fetchZones = vi.fn();
vi.mock("../data", () => ({ fetchZones: (...a: unknown[]) => fetchZones(...a) }));
const { resetZonesCache } = await import("../redevelopment");
const { useZones } = await import("../useZones");

beforeEach(() => {
  fetchZones.mockReset();
  resetZonesCache();
});

test("꺼져 있으면 받지 않는다", () => {
  const { result } = renderHook(() => useZones(false));
  expect(fetchZones).not.toHaveBeenCalled();
  expect(result.current).toEqual({ zones: null, loading: false, error: false });
});

test("켜면 한 번 받아 오고, 다시 켜도 다시 받지 않는다", async () => {
  fetchZones.mockResolvedValue(SAMPLE_FILE);
  const { result, rerender } = renderHook(({ on }) => useZones(on), { initialProps: { on: true } });
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.zones).toHaveLength(7));
  rerender({ on: false });
  rerender({ on: true });
  expect(fetchZones).toHaveBeenCalledTimes(1);
});

test("파일이 없으면(null) 빈 목록, 오류 아님", async () => {
  fetchZones.mockResolvedValue(null);
  const { result } = renderHook(() => useZones(true));
  await waitFor(() => expect(result.current.zones).toEqual([]));
  expect(result.current.error).toBe(false);
});

test("요청이 실패하면 error", async () => {
  fetchZones.mockRejectedValue(new Error("net"));
  const { result } = renderHook(() => useZones(true));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.loading).toBe(false);
});
