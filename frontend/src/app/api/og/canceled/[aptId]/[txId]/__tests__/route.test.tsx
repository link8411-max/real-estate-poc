import { beforeEach, describe, expect, test, vi } from "vitest";

const trees: unknown[] = [];
const optsSeen: ({ headers?: Record<string, string> } | undefined)[] = [];
vi.mock("@vercel/og", () => ({
  ImageResponse: class {
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

type El = { props?: { children?: unknown; style?: Record<string, unknown> } } | string | number | null | undefined | unknown[];
function walk(n: El, f: (e: { props: { children?: unknown; style?: Record<string, unknown> } }) => void) {
  if (Array.isArray(n)) return n.forEach((c) => walk(c as El, f));
  if (n && typeof n === "object" && "props" in n && n.props) {
    f(n as { props: { children?: unknown; style?: Record<string, unknown> } });
    walk(n.props.children as El, f);
  }
}
const text = (n: unknown): string =>
  Array.isArray(n) ? n.map(text).join("") : n && typeof n === "object" && "props" in n ? text((n as { props: { children?: unknown } }).props.children) : String(n ?? "");

const apartment = { id: 1554, name: "래미안", dong: "", lawd_cd: "", region_name: "", city: "", jibun: "", build_year: null, apt_seq: null, lat: null, lng: null };
const base = { apartment, area_stats: [], metrics: { recovery_rate: 100, peak_date: "", days_since_last_tx: 1 } };
const tx = (id: number, amount: number, deal: string, cancel: string | null) => ({ id, amount, area: 84.9, floor: 1, deal_date: deal, cancel_date: cancel });
const run = async (txId: string) => {
  trees.length = 0;
  await GET(new Request("http://x"), { params: Promise.resolve({ aptId: "1554", txId }) });
  const tree = trees[0] as El;
  let strike = false;
  const colors: unknown[] = [];
  walk(tree, (e) => {
    if (e.props.style?.textDecoration === "line-through") strike = true;
    if (e.props.style?.fontSize === 84) colors.push(e.props.style.color);
  });
  return { all: text(tree), strike, colors };
};

beforeEach(() => fetchAptTrade.mockReset());

describe("취소 공유 OG", () => {
  test("취소 아님: 실거래 헤더, 취소선 없음, 중립색", async () => {
    fetchAptTrade.mockResolvedValue({ ...base, transactions: [tx(1, 200000, "2026-01-10", null)] });
    const r = await run("1");
    expect(r.all).toContain("zipsise.com · 실거래");
    expect(r.strike).toBe(false);
    expect(r.colors).toEqual(["#F9FAFB"]);
  });
  test("취소됐지만 신고가 아님: 취소된 거래 헤더, 직전 최고가 없으면 줄 생략", async () => {
    fetchAptTrade.mockResolvedValue({ ...base, transactions: [tx(2, 250000, "2026-02-01", "2026-02-21")] });
    const r = await run("2");
    expect(r.all).toContain("zipsise.com · 취소된 거래");
    expect(r.all).not.toContain("직전 최고가");
    expect(r.strike).toBe(true);
  });
  test("취소된 신고가: 취소된 신고가 헤더, 직전 최고가", async () => {
    fetchAptTrade.mockResolvedValue({ ...base, transactions: [tx(1, 200000, "2026-01-10", null), tx(2, 250000, "2026-02-01", "2026-02-21")] });
    const r = await run("2");
    expect(r.all).toContain("zipsise.com · 취소된 신고가");
    expect(r.all).toContain("직전 최고가");
    expect(r.strike).toBe(true);
    expect(r.colors).toEqual(["#FB7185"]);
  });
});

test("찾을 수 없음 대체 이미지는 1년 캐시하지 않는다", async () => {
  fetchAptTrade.mockResolvedValue(null);
  optsSeen.length = 0;
  await GET(new Request("http://x"), { params: Promise.resolve({ aptId: "1554", txId: "9" }) });
  expect(optsSeen[0]?.headers?.["cache-control"]).toBe("public, max-age=300");
});
