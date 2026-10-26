import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const status = (s: number) => ({ ok: false, status: s, json: async () => ({}) });

async function load() {
  vi.resetModules();
  return await import("@/lib/data");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DATA_URL", "http://data.test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchJson", () => {
  test("URL 조합과 기본 revalidate", async () => {
    const f = vi.fn().mockResolvedValue(ok({ a: 1 }));
    vi.stubGlobal("fetch", f);
    const { fetchJson } = await load();
    expect(await fetchJson("/v1/meta.json")).toEqual({ a: 1 });
    expect(f).toHaveBeenCalledWith("http://data.test/v1/meta.json", { next: { revalidate: 600 } });
  });
  test("호출자 init 병합", async () => {
    const f = vi.fn().mockResolvedValue(ok({}));
    vi.stubGlobal("fetch", f);
    const { fetchJson } = await load();
    await fetchJson("/x.json", { cache: "no-store" });
    expect(f).toHaveBeenCalledWith("http://data.test/x.json", { next: { revalidate: 600 }, cache: "no-store" });
  });
  test("404 → null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(404)));
    const { fetchAptTrade } = await load();
    expect(await fetchAptTrade(1)).toBeNull();
  });
  test("그 외 비정상 → status 포함 Error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(500)));
    const { fetchRegion } = await load();
    await expect(fetchRegion("11680")).rejects.toThrow(/500/);
  });
  test("DATA_URL 미설정이면 호출 시점에 에러(임포트는 성공)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_URL", "");
    vi.stubGlobal("fetch", vi.fn());
    const { fetchMeta } = await load();
    await expect(fetchMeta()).rejects.toThrow(/NEXT_PUBLIC_DATA_URL/);
  });
});

describe("경로", () => {
  test("각 fetch 함수의 경로", async () => {
    const f = vi.fn().mockResolvedValue(ok({}));
    vi.stubGlobal("fetch", f);
    const d = await load();
    await d.fetchAptTrade(7);
    await d.fetchAptRent(7);
    await d.fetchRegion("11680");
    await d.fetchStats();
    await d.fetchMeta();
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      "http://data.test/v1/apt/7/trade.json",
      "http://data.test/v1/apt/7/rent.json",
      "http://data.test/v1/region/11680.json",
      "http://data.test/v1/stats/summary.json",
      "http://data.test/v1/meta.json",
    ]);
  });
});

describe("fetchSearchIndex 캐시", () => {
  test("Promise 재사용", async () => {
    const f = vi.fn().mockResolvedValue(ok([[1, "a", "b", "c", null]]));
    vi.stubGlobal("fetch", f);
    const { fetchSearchIndex } = await load();
    const a = await fetchSearchIndex();
    const b = await fetchSearchIndex();
    expect(a).toBe(b);
    expect(f).toHaveBeenCalledTimes(1);
  });
  test("실패하면 캐시 비우고 재시도", async () => {
    const f = vi.fn().mockResolvedValueOnce(status(500)).mockResolvedValueOnce(ok([[1, "a", "b", "c", null]]));
    vi.stubGlobal("fetch", f);
    const { fetchSearchIndex } = await load();
    await expect(fetchSearchIndex()).rejects.toThrow();
    expect(await fetchSearchIndex()).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(2);
  });
  test("404(null)도 에러로 취급해 캐시하지 않음", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(404)));
    const { fetchSearchIndex } = await load();
    await expect(fetchSearchIndex()).rejects.toThrow();
  });
});
