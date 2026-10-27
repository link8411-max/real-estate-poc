import { beforeEach, describe, expect, test, vi } from "vitest";

const calls: { options: { fonts?: { data: unknown }[] } }[] = [];
vi.mock("@vercel/og", () => ({
  ImageResponse: class {
    constructor(_el: unknown, options: { fonts?: { data: unknown }[] }) {
      calls.push({ options });
    }
  },
}));
const fetchAptTrade = vi.fn();
vi.mock("@/lib/data", () => ({ fetchAptTrade: (...a: unknown[]) => fetchAptTrade(...a) }));
const readFile = vi.fn();
vi.mock("node:fs/promises", () => ({ readFile: (...a: unknown[]) => readFile(...a), default: { readFile: (...a: unknown[]) => readFile(...a) } }));

async function load() {
  vi.resetModules();
  return await import("../route");
}
const FONT_PATH = `${process.cwd()}/public/fonts/NotoSansKR-Bold-subset.woff`;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  calls.length = 0;
  readFile.mockReset();
  fetchAptTrade.mockReset().mockResolvedValue(null);
});

describe("OG route", () => {
  test("Node 런타임(엣지 아님)", async () => {
    const mod = (await load()) as Record<string, unknown>;
    expect(mod.runtime).toBeUndefined();
  });

  test("폰트를 public/fonts 에서 읽어 fonts 옵션으로 넘긴다", async () => {
    const buf = Buffer.from("font");
    readFile.mockResolvedValue(buf);
    const { GET } = await load();
    await GET(new Request("http://x/api/og/1"), params("1"));
    expect(readFile).toHaveBeenCalledWith(FONT_PATH);
    expect(calls[0].options.fonts).toHaveLength(1);
    expect(calls[0].options.fonts?.[0].data).toBe(buf);
  });

  test("실제 폰트 파일이 저장소에 있다(트레이싱 대상)", async () => {
    const fs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    expect((await fs.stat(FONT_PATH)).size).toBeGreaterThan(100_000);
  });

  test("폰트 읽기가 실패해도 기본 폰트로 이미지를 낸다(500 아님), 다음 요청은 다시 시도", async () => {
    readFile.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await load();
    await expect(GET(new Request("http://x/api/og/1"), params("1"))).resolves.toBeDefined();
    expect(calls[0].options.fonts).toBeUndefined();
    expect(calls[0].options).toMatchObject({ width: 1200, height: 630 });
    readFile.mockResolvedValue(Buffer.from("font"));
    await GET(new Request("http://x/api/og/1"), params("1"));
    expect(calls[1].options.fonts).toHaveLength(1);
    expect(readFile).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
