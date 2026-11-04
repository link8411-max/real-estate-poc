import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { MapApartment, MapData } from "@/lib/useMapData";
import MapView from "../MapView";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../FilterPanel", () => ({ default: () => null }));
vi.mock("../MyLocationButton", () => ({
  default: ({ liftPx }: { liftPx?: number }) => <button data-testid="loc" data-lift={String(liftPx)} />,
}));

let mapData: MapData | null = null;
vi.mock("@/lib/useMapData", () => ({
  useMapData: () => ({ data: mapData, loading: false, error: null, tooWide: false }),
}));

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
  getProjection: () => ({ containerPointFromCoords: (p: FakeLatLng) => ({ x: (p.lng - 127) * 1e5, y: (37.5 - p.lat) * 1e5 }) }),
};
vi.mock("@/components/KakaoMap", () => ({
  default: ({ onReady }: { onReady: (m: unknown) => void }) => {
    onReady(fakeMap);
    return <div />;
  },
}));

const apt = (over: Partial<MapApartment> = {}): MapApartment => ({
  id: 1, name: "래미안", lat: 37.5, lng: 127.01, latest_trade_amount: 100000, latest_jeonse_deposit: 60000,
  trade_count: 12, build_year: 2015, latest_trade_area: 84.9, latest_trade_date: "2026-10-06", ...over,
});
const setData = (...items: MapApartment[]) => { mapData = { type: "apartments", items }; };
const clickMarker = (i = 0) => act(() => { [...FakeOverlay.live][i].content.click(); });

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 240 } as DOMRect);
  FakeOverlay.live.clear();
  clickHandlers.clear();
  push.mockReset();
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

describe("MapView 미리보기 카드", () => {
  test("마커 클릭 → 카드가 열리고 이동하지 않는다. 라벨·값·링크가 정확하다", () => {
    setData(apt());
    render(<MapView />);
    expect(screen.queryByRole("region")).toBeNull();
    clickMarker();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "래미안" })).toBeTruthy();
    expect(screen.getByText("2015년 · 거래 12건")).toBeTruthy();
    expect(screen.getByText("최근 매매 (25평)")).toBeTruthy();
    expect(screen.getByText("10억원")).toBeTruthy();
    expect(screen.getByText("26.10.06")).toBeTruthy();
    expect(screen.getByText("최근 전세")).toBeTruthy();
    expect(screen.getByText("6억원")).toBeTruthy();
    expect(screen.getByText("전세가율")).toBeTruthy();
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByRole("link", { name: "상세 보기 ›" }).getAttribute("href")).toBe("/apartment/1");
    // 카드 높이 240px 가정: 56 + 240 + 8
    expect(screen.getByTestId("loc").getAttribute("data-lift")).toBe("304");
  });

  test("값이 없으면 -, 전세가율은 한쪽이라도 없으면 -", () => {
    setData(apt({ latest_jeonse_deposit: null, latest_trade_date: null, build_year: null }));
    render(<MapView />);
    clickMarker();
    expect(screen.getByText("거래 12건")).toBeTruthy();
    expect(screen.getAllByText("-")).toHaveLength(2); // 최근 전세, 전세가율
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  test("닫기 버튼 / Escape / 지도 빈 곳 클릭으로 닫힌다", () => {
    setData(apt());
    render(<MapView />);
    clickMarker();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("heading", { name: "래미안" })).toBeNull();
    expect(screen.getByTestId("loc").getAttribute("data-lift")).toBe("undefined");

    clickMarker();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "래미안" })).toBeNull();

    clickMarker();
    act(() => clickHandlers.forEach((h) => h()));
    expect(screen.queryByRole("heading", { name: "래미안" })).toBeNull();
  });

  test("다른 마커를 고르면 카드 내용이 바뀌고, 데이터에서 빠지면 닫힌다", () => {
    setData(apt(), apt({ id: 2, name: "자이", lng: 127.05 }));
    const { rerender } = render(<MapView />);
    clickMarker(0);
    clickMarker(1);
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    const name = screen.getByRole("heading").textContent;
    setData(apt({ id: 3, name: "신규", lng: 127.09 }));
    rerender(<MapView />);
    expect(screen.queryByRole("heading", { name: name! })).toBeNull();
    expect(screen.queryByRole("link", { name: "상세 보기 ›" })).toBeNull();
  });
});
