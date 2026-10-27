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
const map = { setLevel: vi.fn(), setCenter: vi.fn() };

beforeEach(() => {
  FakeOverlay.live.clear();
  FakeOverlay.created = 0;
  push.mockReset();
  vi.stubGlobal("kakao", { maps: { LatLng: FakeLatLng, CustomOverlay: FakeOverlay } });
});
afterEach(() => vi.unstubAllGlobals());

const apt = (id: number, trade: number | null, jeonse: number | null = null): MapApartment => ({
  id, name: `단지${id}`, lat: 37.5, lng: 127, latest_trade_amount: trade, latest_jeonse_deposit: jeonse,
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
