import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { RegionApartment, RegionFile } from "@/lib/types";

const fetchRegion = vi.fn();
const fetchStats = vi.fn();
vi.mock("@/lib/data", () => ({
  fetchRegion: (...a: unknown[]) => fetchRegion(...a),
  fetchStats: (...a: unknown[]) => fetchStats(...a),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  permanentRedirect: (to: string) => {
    throw new Error(`PERMANENT:${to}`);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/region/11680",
  useSearchParams: () => new URLSearchParams(),
}));

const dongPage = await import("../region/[code]/[dong]/page");
const regionPage = await import("../region/[code]/page");

const apt = (id: number, name: string, dong: string, o: Partial<RegionApartment> = {}): RegionApartment => ({
  id, name, dong, build_year: 2005, trade_count: 3, latest_trade_amount: 100000, latest_trade_date: "2026-10-01",
  latest_jeonse_deposit: 60000, lat: 37.5, lng: 127.0, ...o,
});
const file: RegionFile = {
  code: "11680", name: "강남", city: "서울", succeeded_by: null,
  apartments: [
    apt(1, "오래된거래", "역삼동", { latest_trade_date: "2026-08-01", latest_trade_amount: 80000 }),
    apt(2, "최근거래", "역삼동", { latest_trade_date: "2026-10-20", latest_trade_amount: 285000, lat: 37.7, lng: 127.2 }),
    apt(3, "좌표없음", "역삼동", { lat: null, lng: null, latest_jeonse_deposit: null, latest_trade_amount: null, latest_trade_date: null }),
    apt(4, "혼자", "중앙동(1)"),
    apt(5, "다른동", "개포동"),
    apt(6, "다른동2", "개포동"),
  ],
} as RegionFile;

const params = (dong: string, code = "11680") => ({ params: Promise.resolve({ code, dong }) });

beforeEach(() => {
  fetchRegion.mockReset();
  fetchStats.mockReset();
  fetchRegion.mockResolvedValue(file);
  fetchStats.mockResolvedValue(null);
});

describe("동 페이지", () => {
  test("ISR 설정", () => {
    expect(dongPage.revalidate).toBe(3600);
    expect(dongPage.generateStaticParams()).toEqual([]);
  });

  test("H1·요약·단지 목록(최근 거래일 최신순, 거래 없는 단지는 맨 뒤)·단지 링크·전세", async () => {
    render(await dongPage.default(params(encodeURIComponent("역삼동"))));
    expect(screen.getByRole("heading", { level: 1, name: "역삼동 아파트 실거래가" })).toBeInTheDocument();
    expect(screen.getByText(/단지 3개/)).toBeInTheDocument();
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/apartment/"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/apartment/2", "/apartment/1", "/apartment/3"]);
    expect(screen.getAllByText(/전세 6억/)).toHaveLength(2); // 좌표 없음 단지는 전세 없음
  });

  test("미니 지도: 좌표 있는 단지 평균 중심, /map 링크 레벨 5", async () => {
    render(await dongPage.default(params(encodeURIComponent("역삼동"))));
    const pill = screen.getAllByRole("link").find((a) => a.getAttribute("href")?.startsWith("/map?"));
    expect(pill?.getAttribute("href")).toBe("/map?lat=37.6&lng=127.1&level=5");
  });

  test("괄호 든 동 + 단지 1개 + 좌표 전혀 없음 → 지도 생략, 안 깨짐", async () => {
    fetchRegion.mockResolvedValue({ ...file, apartments: [apt(4, "혼자", "중앙동(1)", { lat: null, lng: null })] });
    render(await dongPage.default(params(encodeURIComponent("중앙동(1)"))));
    expect(screen.getByRole("heading", { level: 1, name: "중앙동(1) 아파트 실거래가" })).toBeInTheDocument();
    expect(screen.getByText(/단지 1개/)).toBeInTheDocument();
    expect(screen.queryAllByRole("link").some((a) => a.getAttribute("href")?.startsWith("/map?"))).toBe(false);
  });

  test("없는 동·모르는 지역 → 404, 폐지 코드 → 구 페이지로 이동", async () => {
    await expect(dongPage.default(params("없는동"))).rejects.toThrow("NOT_FOUND");
    await expect(dongPage.default(params("역삼동", "99999"))).rejects.toThrow("NOT_FOUND");
    await expect(dongPage.default(params("역삼동", "28260"))).rejects.toThrow("PERMANENT:/region/28275");
    fetchRegion.mockResolvedValue(null);
    await expect(dongPage.default(params("역삼동"))).rejects.toThrow("NOT_FOUND");
  });

  test("메타데이터: 제목·설명·canonical(인코딩), 없는 동은 noindex", async () => {
    const m = await dongPage.generateMetadata(params(encodeURIComponent("중앙동(1)")));
    expect(m.title).toEqual({ absolute: "중앙동(1) 아파트 실거래가 · 시세 | 강남구" });
    expect(m.description).toMatch(/^강남구 중앙동\(1\) 아파트 1개 단지 실거래가\./);
    expect(m.alternates?.canonical).toBe(`/region/11680/${encodeURIComponent("중앙동(1)")}`);
    const none = await dongPage.generateMetadata(params("없는동"));
    expect(none.robots).toMatchObject({ index: false });
  });
});

describe("지역 페이지 동 칩", () => {
  test("동마다 링크(단지 많은 동 먼저, 단지 수 표시)", async () => {
    render(await regionPage.default({ params: Promise.resolve({ code: "11680" }) }));
    const chips = screen.getAllByRole("link").filter((a) => /^\/region\/11680\/./.test(a.getAttribute("href") ?? ""));
    expect(chips.map((a) => a.getAttribute("href"))).toEqual(
      ["역삼동", "개포동", "중앙동(1)"].map((d) => `/region/11680/${encodeURIComponent(d)}`),
    );
    expect(chips[0]).toHaveTextContent("역삼동");
    expect(chips[0]).toHaveTextContent("3");
  });
});
