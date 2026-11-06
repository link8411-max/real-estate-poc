import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { MapApartment, MapData } from "@/lib/useMapData";
import MapView from "../MapView";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../FilterPanel", () => ({
  default: ({ onOpen }: { onOpen?: () => void }) => <button data-testid="filter" onClick={onOpen} />,
}));
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
  id: 1, name: "래미안", lat: 37.5, lng: 127.01, latest_trade_amount: 100000, latest_jeonse_deposit: 60000,
  trade_count: 12, build_year: 2015, latest_trade_area: 84.9, latest_trade_date: "2026-10-06", ...over,
});
const setData = (...items: MapApartment[]) => { mapData = { type: "apartments", items }; };
const clickMarker = (i = 0) => act(() => { [...FakeOverlay.live][i].content.click(); });

beforeEach(() => {
  // 카드(section)는 240px, 지도 영역(div)은 375×586(667-81)이라고 가정
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return (this.tagName === "SECTION" ? { width: 351, height: 240 } : { width: 375, height: 586 }) as DOMRect;
  });
  fakeMap.panBy.mockReset();
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
    expect(screen.getByText("최근 매매 (84㎡)")).toBeTruthy();
    expect(screen.getByText("10억")).toBeTruthy();
    expect(screen.getByText("26.10.06")).toBeTruthy();
    expect(screen.getByText("최근 전세")).toBeTruthy();
    expect(screen.getByText("6억")).toBeTruthy();
    expect(screen.getByText("전세가율")).toBeTruthy();
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByRole("link", { name: "상세 보기 ›" }).getAttribute("href")).toBe("/apartment/1");
    // 카드 높이 240px 가정
    expect(screen.getByTestId("loc").getAttribute("data-lift")).toBe("240");
    // md+에서는 오른쪽 아래에 붙어 왼쪽 필터 패널과 겹치지 않는다
    const cls = screen.getByRole("region").className;
    expect(cls).toContain("md:right-4");
    expect(cls).toContain("md:bottom-8");
    expect(cls).toContain("md:w-[360px]");
    expect(cls).not.toContain("md:left-");
    expect(cls).toContain("overflow-y-auto");
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

describe("MapView 모바일 보정", () => {
  const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
  afterEach(() => setWidth(1024));

  test("모바일: 카드에 가려질 마커를 선택하면 위로 panBy, 카드 위에 있으면 움직이지 않는다", () => {
    setWidth(375);
    // 카드 윗선 = 586-56-240 = 290. 마커 y = (37.5-lat)*1e5
    setData(apt({ lat: 37.496 })); // y=400: 카드 아래
    render(<MapView />);
    clickMarker();
    expect(fakeMap.panBy).toHaveBeenCalledTimes(1);
    const [dx, dy] = fakeMap.panBy.mock.calls[0];
    expect(dx).toBe(0);
    expect(dy).toBeCloseTo(400 - 145); // 카드 위 남은 공간(290)의 가운데로
    cleanup();

    fakeMap.panBy.mockReset();
    setData(apt({ lat: 37.4985 })); // y=150: 290-60=230보다 위 → 그대로
    render(<MapView />);
    clickMarker();
    expect(fakeMap.panBy).not.toHaveBeenCalled();
  });

  test("데스크톱: 카드 사각형 아래에 있을 때만 왼쪽으로 옮긴다", () => {
    setWidth(1280);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return (this.tagName === "SECTION" ? { width: 360, height: 240 } : { width: 1280, height: 586 }) as DOMRect;
    });
    // 카드: x 904~1264, y 314~554. 마커 x=(lng-127)*1e5
    setData(apt({ lat: 37.496, lng: 127.01 })); // (1000,400) 카드 안
    render(<MapView />);
    clickMarker();
    expect(fakeMap.panBy).toHaveBeenCalledTimes(1);
    const [dx, dy] = fakeMap.panBy.mock.calls[0];
    expect(dx).toBeCloseTo(1000 - (904 - 80));
    expect(dy).toBe(0);
    cleanup();

    fakeMap.panBy.mockReset();
    setData(apt({ lat: 37.496, lng: 127.005 })); // (500,400) 카드 밖
    render(<MapView />);
    clickMarker();
    expect(fakeMap.panBy).not.toHaveBeenCalled();
  });

  test("필터 시트를 열면 미리보기 카드가 닫힌다", () => {
    setData(apt());
    render(<MapView />);
    clickMarker();
    expect(screen.getByRole("heading", { name: "래미안" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("filter"));
    expect(screen.queryByRole("heading", { name: "래미안" })).toBeNull();
    expect(screen.getByTestId("loc").getAttribute("data-lift")).toBe("undefined");
  });

  test("카드 값은 만원 없이 한 줄(nowrap)로, 전체 금액은 title에 둔다", () => {
    setData(apt({ latest_trade_amount: 115000, latest_jeonse_deposit: 60000 }));
    render(<MapView />);
    clickMarker();
    const trade = screen.getByText("11억 5,000");
    expect(trade.textContent).not.toContain("만원");
    expect(trade.getAttribute("title")).toBe("11억 5,000만원");
    expect(trade.className).toContain("whitespace-nowrap");
    expect(screen.getByText("6억").getAttribute("title")).toBe("6억원");
  });
});
