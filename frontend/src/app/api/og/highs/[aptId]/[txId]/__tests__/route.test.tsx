import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setSupplyEnabledForTest } from "@/lib/supply";

const trees: unknown[] = [];
const optsSeen: ({ headers?: Record<string, string> } | undefined)[] = [];
vi.mock("next/og", () => ({
  ImageResponse: class {
    status = 200;
    headers = new Headers({ "content-type": "image/png" });
    constructor(el: unknown, opts?: { headers?: Record<string, string> }) {
      trees.push(el);
      optsSeen.push(opts);
    }
  },
}));
const fetchAptTrade = vi.fn();
vi.mock("@/lib/data", () => ({ fetchAptTrade: (...a: unknown[]) => fetchAptTrade(...a) }));
vi.mock("@/lib/ogFont", () => ({ FONT_FAMILY: "F", options: async () => ({ width: 1200, height: 630 }) }));

const { GET } = await import("../route");

const text = (n: unknown): string =>
  Array.isArray(n) ? n.map(text).join("") : n && typeof n === "object" && "props" in n ? text((n as { props: { children?: unknown } }).props.children) : typeof n === "string" || typeof n === "number" ? String(n) : "";

const apartment = { id: 1554, name: "래미안", dong: "", lawd_cd: "", region_name: "", city: "", jibun: "", build_year: null, apt_seq: null, lat: null, lng: null, area_types: [] as unknown[] };
const base = { apartment, area_stats: [], metrics: {} };
const share = { badge: "high", base: 90000, diff: 10000, pct: 11.1, shareable: true, held: false };
const tx = (o: Record<string, unknown>) => ({ id: 1, amount: 100000, area: 84.97, floor: 7, deal_date: "2026-11-01", cancel_date: null, grp: 84, ...o });
const run = async () => {
  trees.length = 0;
  const res = (await GET(new Request("http://x"), { params: Promise.resolve({ aptId: "1554", txId: "1" }) })) as unknown as { status: number; headers: Headers };
  return { res, all: text(trees[0]) };
};

beforeEach(() => fetchAptTrade.mockReset());
afterEach(() => setSupplyEnabledForTest(false));

describe("신고가 공유 OG", () => {
  test("신고가 카드: 배지·차이·하단 띠", async () => {
    fetchAptTrade.mockResolvedValue({ ...base, transactions: [tx({ share }), tx({ id: 2, amount: 90000, deal_date: "2026-03-01" })] });
    const { res, all } = await run();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(all).toContain("신고가");
    expect(all).toContain("이전 최고보다 +1억");
    expect(all).toContain("국토교통부 실거래가 · 계약 2026.11.01 · 신고 기준 · zipsise.com");
    expect(all).not.toContain("축하");
  });
  test("상승 카드: 직전 거래보다", async () => {
    fetchAptTrade.mockResolvedValue({ ...base, transactions: [tx({ share: { ...share, badge: "up", diff: 3000 } })] });
    const { all } = await run();
    expect(all).toContain("상승");
    expect(all).toContain("직전 거래보다 +3,000만");
  });
  test("공급 정보 없으면 84㎡ 만, 직거래 표시", async () => {
    setSupplyEnabledForTest(true);
    fetchAptTrade.mockResolvedValue({ ...base, transactions: [tx({ share, direct: true })] });
    const { all } = await run();
    expect(all).toContain("84㎡");
    expect(all).not.toMatch(/\d+평/); // 전용평 금지
    expect(all).toContain("직거래");
  });
  test("공급평 있으면 33평 · 전용 84㎡", async () => {
    setSupplyEnabledForTest(true);
    fetchAptTrade.mockResolvedValue({ ...base, apartment: { ...apartment, area_types: [{ excl: 84.97, supply: 111.52, approx: false }] }, transactions: [tx({ share })] });
    const { all } = await run();
    expect(all).toContain("33평 · 전용 84㎡");
  });
  test("취소되면 신고 후 취소, 배지·차이 숨김", async () => {
    fetchAptTrade.mockResolvedValue({ ...base, transactions: [tx({ share, cancel_date: "2026-11-05" })] });
    const { all } = await run();
    expect(all).toContain("신고 후 취소");
    expect(all).not.toContain("이전 최고보다");
    expect(all).not.toMatch(/신고가(?! )/);
  });
  test("moved_to 면 남은 단지로", async () => {
    fetchAptTrade.mockImplementation(async (id: number) =>
      id === 1554 ? { moved_to: 9 } : { ...base, apartment: { ...apartment, id: 9, name: "남은단지" }, transactions: [tx({ share })] },
    );
    const { all } = await run();
    expect(fetchAptTrade).toHaveBeenCalledWith(9);
    expect(all).toContain("남은단지");
  });
  test("없으면 대체 이미지, 짧은 캐시", async () => {
    fetchAptTrade.mockResolvedValue(null);
    optsSeen.length = 0;
    await run();
    expect(optsSeen[0]?.headers?.["cache-control"]).toBe("public, max-age=300");
  });
});
