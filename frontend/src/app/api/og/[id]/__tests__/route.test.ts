import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const calls: { options: { fonts?: unknown[] } }[] = [];
vi.mock("@vercel/og", () => ({
  ImageResponse: class {
    constructor(_el: unknown, options: { fonts?: unknown[] }) {
      calls.push({ options });
    }
  },
}));
const fetchAptTrade = vi.fn();
vi.mock("@/lib/data", () => ({ fetchAptTrade: (...a: unknown[]) => fetchAptTrade(...a) }));

async function load() {
  vi.resetModules();
  return await import("../route");
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  calls.length = 0;
  fetchAptTrade.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllGlobals());

describe("OG route", () => {
  test("폰트를 받으면 fonts 옵션으로 넘긴다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    const { GET } = await load();
    await GET(new Request("http://x/api/og/1"), params("1"));
    expect(calls[0].options.fonts).toHaveLength(1);
  });

  test("폰트 fetch가 실패해도 기본 폰트로 이미지를 낸다(500 아님)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await load();
    await expect(GET(new Request("http://x/api/og/1"), params("1"))).resolves.toBeDefined();
    expect(calls[0].options.fonts).toBeUndefined();
    expect(calls[0].options).toMatchObject({ width: 1200, height: 630 });
    spy.mockRestore();
  });

  test("폰트 응답이 404여도 기본 폰트로", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await load();
    await GET(new Request("http://x/api/og/1"), params("1"));
    expect(calls[0].options.fonts).toBeUndefined();
    spy.mockRestore();
  });
});
