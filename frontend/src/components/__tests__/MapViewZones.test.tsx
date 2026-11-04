import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ZONE_DISCLAIMER } from "@/lib/redevelopment";
import type { MapApartment, MapData } from "@/lib/useMapData";
import { SAMPLE_ZONES } from "@/test/zones.fixture";
import MapView from "../MapView";

let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("../FilterPanel", () => ({ default: () => null }));
vi.mock("../MyLocationButton", () => ({ default: () => null }));

let mapData: MapData | null = null;
vi.mock("@/lib/useMapData", () => ({
  useMapData: () => ({ data: mapData, loading: false, error: null, tooWide: false }),
}));
let zonesState: { zones: unknown; loading: boolean; error: boolean } = { zones: null, loading: false, error: false };
const useZones = vi.fn((on: boolean) => (on ? zonesState : { zones: null, loading: false, error: false }));
vi.mock("@/lib/useZones", () => ({ useZones: (on: boolean) => useZones(on) }));

class FakeLatLng {
  constructor(public lat: number, public lng: number) {}
}
class FakeOverlay {
  static live = new Set<FakeOverlay>();
  constructor(public opts: { content: HTMLElement; map?: unknown }) {
    if (opts.map) FakeOverlay.live.add(this);
  }
  get content() { return this.opts.content; }
  setMap(m: unknown) { if (m) FakeOverlay.live.add(this); else FakeOverlay.live.delete(this); }
  setContent(c: HTMLElement) { this.opts.content = c; }
  setZIndex() {}
}
const clickHandlers = new Set<() => void>();
const fakeMap = {
  setLevel: vi.fn(),
  setCenter: vi.fn(),
  panBy: vi.fn(),
  getProjection: () => ({ containerPointFromCoords: (p: FakeLatLng) => ({ x: (p.lng - 127) * 1e5, y: (37.5 - p.lat) * 1e5 }) }),
};
vi.mock("@/components/KakaoMap", () => ({
  default: ({ onReady }: { onReady: (m: unknown) => void }) => {
    onReady(fakeMap);
    return <div />;
  },
}));

const apt = (over: Partial<MapApartment> = {}): MapApartment => ({
  id: 1, name: "래미안", lat: 37.5, lng: 127.5, latest_trade_amount: 100000, latest_jeonse_deposit: 60000,
  trade_count: 12, build_year: 2015, latest_trade_area: 84.9, latest_trade_date: "2026-10-06", ...over,
});
const overlays = () => [...FakeOverlay.live].map((o) => o.content);
const zoneMarkers = () => overlays().filter((c) => c.dataset.zoneId);
const aptMarkers = () => overlays().filter((c) => !c.dataset.zoneId);
const click = (el: HTMLElement) => act(() => { el.click(); });

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width: 375, height: 240 }) as DOMRect);
  FakeOverlay.live.clear();
  clickHandlers.clear();
  query = "";
  mapData = null;
  zonesState = { zones: SAMPLE_ZONES, loading: false, error: false };
  useZones.mockClear();
  vi.stubGlobal("kakao", {
    maps: {
      LatLng: FakeLatLng,
      CustomOverlay: FakeOverlay,
      event: {
        addListener: (_t: unknown, type: string, h: () => void) => { if (type === "click") clickHandlers.add(h); },
        removeListener: (_t: unknown, _type: string, h: () => void) => clickHandlers.delete(h),
      },
    },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MapView 정비사업 레이어", () => {
  test("기본(꺼짐)은 구역 마커가 없고 데이터도 받지 않는다", () => {
    render(<MapView />);
    expect(zoneMarkers()).toHaveLength(0);
    expect(useZones).toHaveBeenLastCalledWith(false);
  });

  test("zones=1 이면 좌표 있는 구역을 모두 그린다(아파트 데이터와 무관)", () => {
    query = "zones=1";
    render(<MapView />);
    expect(useZones).toHaveBeenLastCalledWith(true);
    expect(zoneMarkers().map((c) => c.dataset.zoneId).sort()).toEqual(["z001", "z002", "z003", "z004", "z006"]);
    expect(aptMarkers()).toHaveLength(0);
  });

  test("유형·단계 필터(복수 선택)가 마커에 반영된다", () => {
    query = "zones=1&zt=재건축,주거환경개선&zs=관리처분인가,사업시행자지정";
    render(<MapView />);
    expect(zoneMarkers().map((c) => c.dataset.zoneId).sort()).toEqual(["z002", "z006"]);
  });

  test("구역을 누르면 구역 카드, 단지 카드와 한 번에 하나만", () => {
    query = "zones=1";
    mapData = { type: "apartments", items: [apt()] };
    render(<MapView />);
    click(aptMarkers()[0]);
    expect(screen.getByRole("heading", { name: "래미안" })).toBeTruthy();
    click(zoneMarkers().find((c) => c.dataset.zoneId === "z003")!);
    expect(screen.getByRole("heading", { name: "한남3구역" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "래미안" })).toBeNull();
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getByText(ZONE_DISCLAIMER)).toBeTruthy();
    // 다시 단지를 누르면 구역 카드가 닫힌다
    click(aptMarkers()[0]);
    expect(screen.queryByRole("heading", { name: "한남3구역" })).toBeNull();
    expect(screen.getByRole("heading", { name: "래미안" })).toBeTruthy();
  });

  test("닫기·Escape·지도 클릭으로 구역 카드가 닫힌다", () => {
    query = "zones=1";
    render(<MapView />);
    const open = () => click(zoneMarkers().find((c) => c.dataset.zoneId === "z003")!);
    open();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("heading", { name: "한남3구역" })).toBeNull();
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "한남3구역" })).toBeNull();
    open();
    act(() => clickHandlers.forEach((h) => h()));
    expect(screen.queryByRole("heading", { name: "한남3구역" })).toBeNull();
  });

  test("선택한 구역이 필터에서 빠지면 카드가 닫힌다", () => {
    query = "zones=1";
    const { rerender } = render(<MapView />);
    click(zoneMarkers().find((c) => c.dataset.zoneId === "z003")!);
    expect(screen.getByRole("heading", { name: "한남3구역" })).toBeTruthy();
    query = "zones=1&zt=재건축";
    rerender(<MapView />);
    expect(screen.queryByRole("heading", { name: "한남3구역" })).toBeNull();
  });

  test("정비사업 데이터를 못 받으면 오류 안내", () => {
    query = "zones=1";
    zonesState = { zones: null, loading: false, error: true };
    render(<MapView />);
    expect(screen.getByRole("alert").textContent).toContain("정비사업");
  });

  test("파일이 없어 빈 목록이면 마커·오류 없음", () => {
    query = "zones=1";
    zonesState = { zones: [], loading: false, error: false };
    render(<MapView />);
    expect(zoneMarkers()).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
