import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { MapApartment, MapData, MapRegion } from "@/lib/useMapData";
import MapMarkers from "../MapMarkers";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

class FakeLatLng {
  constructor(public lat: number, public lng: number) {}
  getLat() { return this.lat; }
  getLng() { return this.lng; }
}
class FakeOverlay {
  static live = new Set<FakeOverlay>();
  static created = 0;
  content: HTMLElement;
  constructor(opts: { content: HTMLElement; map?: unknown }) {
    this.content = opts.content;
    FakeOverlay.created++;
    if (opts.map) FakeOverlay.live.add(this);
  }
  setMap(m: unknown) {
    if (m) FakeOverlay.live.add(this);
    else FakeOverlay.live.delete(this);
  }
  setContent(c: HTMLElement) { this.content = c; }
  setZIndex() {}
}
/** 경도 0.01도 = 1000px, 위도 0.01도 = 1000px 로 투영하는 가짜 지도 */
const map = {
  setLevel: vi.fn(),
  setCenter: vi.fn(),
  getProjection: () => ({
    containerPointFromCoords: (p: FakeLatLng) => ({ x: (p.lng - 127) * 1e5, y: (37.5 - p.lat) * 1e5 }),
  }),
};

beforeEach(() => {
  FakeOverlay.live.clear();
  FakeOverlay.created = 0;
  push.mockReset();
  vi.stubGlobal("kakao", { maps: { LatLng: FakeLatLng, CustomOverlay: FakeOverlay } });
});
afterEach(() => vi.unstubAllGlobals());

const apt = (id: number, trade: number | null, jeonse: number | null = null): MapApartment => ({
  id, name: `단지${id}`, lat: 37.5, lng: 127 + id * 0.01, latest_trade_amount: trade, latest_jeonse_deposit: jeonse,
  trade_count: 1, build_year: 2000, latest_trade_area: 84,
});
const apts = (...items: MapApartment[]): MapData => ({ type: "apartments", items });
const texts = () => [...FakeOverlay.live].map((o) => o.content.textContent);
const m = map as unknown as kakao.maps.Map;

describe("MapMarkers", () => {
  test("단지 라벨은 억 한 자리 + 단지명, 클릭하면 단지 페이지로", () => {
    render(<MapMarkers map={m} data={apts(apt(1, 123000), apt(2, 9500))} mode="trade" />);
    expect(texts()).toEqual(["12.3억단지1", "9,500단지2"]);
    [...FakeOverlay.live][0].content.click();
    expect(push).toHaveBeenCalledWith("/apartment/1");
  });

  test("전세 모드는 보증금으로 라벨", () => {
    render(<MapMarkers map={m} data={apts(apt(1, 123000, 80000))} mode="rent" />);
    expect(texts()).toEqual(["8억단지1"]);
  });

  test("업데이트 시 id로 비교해 남는 오버레이는 재생성하지 않고 빠진 것만 제거", () => {
    const { rerender } = render(<MapMarkers map={m} data={apts(apt(1, 10000), apt(2, 20000))} mode="trade" />);
    const first = [...FakeOverlay.live].find((o) => o.content.textContent?.includes("단지1"));
    rerender(<MapMarkers map={m} data={apts(apt(1, 10000), apt(3, 30000))} mode="trade" />);
    expect(FakeOverlay.created).toBe(3);
    expect(texts().sort()).toEqual(["1억단지1", "3억단지3"]);
    expect(FakeOverlay.live.has(first!)).toBe(true);
  });

  test("화면에서 겹치는 단지 라벨은 거래 수가 많은 것만 남긴다", () => {
    const busy = { ...apt(1, 10000), trade_count: 99 };
    const quiet = { ...apt(2, 20000), lng: busy.lng + 0.0001, trade_count: 3 }; // 10px 옆
    const far = apt(3, 30000);
    render(<MapMarkers map={m} data={apts(quiet, busy, far)} mode="trade" />);
    expect(texts().sort()).toEqual(["1억단지1", "3억단지3"]);
  });

  test("매매→전세 전환 시 라벨 글자가 같아도 다시 그린다(색 변경)", () => {
    const { rerender } = render(<MapMarkers map={m} data={apts(apt(1, 80000, 80000))} mode="trade" />);
    const overlay = [...FakeOverlay.live][0];
    expect(overlay.content.innerHTML).toContain("bg-blue-600");
    rerender(<MapMarkers map={m} data={apts(apt(1, 80000, 80000))} mode="rent" />);
    expect(FakeOverlay.created).toBe(1);
    expect(overlay.content.textContent).toBe("8억단지1");
    expect(overlay.content.innerHTML).toContain("bg-emerald-600");
  });

  test("전세 모드 지역 원은 매매 평균 대신 단지 수", () => {
    const region: MapRegion = { code: "11680", name: "강남구", city: "서울", lat: 37.51, lng: 127.04, apartment_count: 150, avg_amount: 250000 };
    render(<MapMarkers map={m} data={{ type: "regions", items: [region] }} mode="rent" />);
    expect(texts()).toEqual(["강남구단지 150개"]);
  });

  test("지역 원: 이름 + 평균가, 클릭하면 중심으로 이동 후 레벨 6", () => {
    const region: MapRegion = { code: "11680", name: "강남구", city: "서울", lat: 37.51, lng: 127.04, apartment_count: 150, avg_amount: 250000 };
    render(<MapMarkers map={m} data={{ type: "regions", items: [region] }} mode="trade" />);
    expect(texts()).toEqual(["강남구25억"]);
    [...FakeOverlay.live][0].content.click();
    expect(map.setCenter).toHaveBeenCalledWith(expect.objectContaining({ lat: 37.51, lng: 127.04 }));
    expect(map.setLevel).toHaveBeenCalledWith(6);
  });

  test("data가 null이면 모두 제거, 언마운트 시에도 모두 제거", () => {
    const { rerender, unmount } = render(<MapMarkers map={m} data={apts(apt(1, 10000))} mode="trade" />);
    rerender(<MapMarkers map={m} data={null} mode="trade" />);
    expect(FakeOverlay.live.size).toBe(0);
    rerender(<MapMarkers map={m} data={apts(apt(1, 10000))} mode="trade" />);
    expect(FakeOverlay.live.size).toBe(1);
    unmount();
    expect(FakeOverlay.live.size).toBe(0);
  });
});
