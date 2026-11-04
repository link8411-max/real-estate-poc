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
  trade_count: 1, build_year: 2000, latest_trade_area: 84, latest_trade_date: "2026-10-06",
});
const apts = (...items: MapApartment[]): MapData => ({ type: "apartments", items });
const texts = () => [...FakeOverlay.live].map((o) => o.content.textContent);
const m = map as unknown as kakao.maps.Map;

describe("MapMarkers", () => {
  test("단지 라벨은 윗줄 평수 + 아랫줄 억 한 자리, 클릭하면 onSelect(이동 없음)", () => {
    const onSelect = vi.fn();
    render(<MapMarkers map={m} data={apts(apt(1, 123000), apt(2, 9500))} mode="trade" onSelect={onSelect} />);
    expect(texts()).toEqual(["단지1 · 25평12.3억", "단지2 · 25평9,500"]);
    [...FakeOverlay.live][0].content.click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(push).not.toHaveBeenCalled();
  });

  test("㎡ 단위면 윗줄이 ㎡", () => {
    localStorage.setItem("areaUnit", "m2");
    render(<MapMarkers map={m} data={apts(apt(1, 123000))} mode="trade" />);
    expect(texts()).toEqual(["단지1 · 84㎡12.3억"]);
    localStorage.removeItem("areaUnit");
  });

  test("전세 모드 윗줄은 전세", () => {
    render(<MapMarkers map={m} data={apts(apt(1, 123000, 80000))} mode="rent" />);
    expect(texts()).toEqual(["단지1 · 전세8억"]);
  });

  test("면적이 없으면 윗줄은 단지명만", () => {
    render(<MapMarkers map={m} data={apts({ ...apt(1, 123000), latest_trade_area: null })} mode="trade" />);
    expect(texts()).toEqual(["단지112.3억"]);
  });

  test("단지명은 레벨과 무관하게 윗줄에 항상 보이고 7자 초과는 …, title엔 전체 이름", () => {
    const long = { ...apt(1, 10000), name: "가나다라마바사아자차" };
    render(<MapMarkers map={m} data={apts(long)} mode="trade" />);
    const c = [...FakeOverlay.live][0].content;
    expect(c.textContent).toBe("가나다라마바사… · 25평1억");
    expect(c.title).toBe("가나다라마바사아자차");
    expect(c.querySelector(".hidden")).toBeNull();
  });

  test("선택된 마커는 어두운 배경으로 강조", () => {
    render(<MapMarkers map={m} data={apts(apt(1, 10000))} mode="trade" selectedId={1} />);
    expect([...FakeOverlay.live][0].content.innerHTML).toContain("bg-gray-900");
    expect([...FakeOverlay.live][0].content.innerHTML).not.toContain("bg-blue-600");
  });

  test("interactive={false}면 클릭해도 이동하지 않는다(미니 지도)", () => {
    const onSelect = vi.fn();
    render(<MapMarkers map={m} data={apts(apt(1, 123000))} mode="trade" interactive={false} onSelect={onSelect} />);
    const content = [...FakeOverlay.live][0].content;
    content.click();
    expect(onSelect).not.toHaveBeenCalled();
    expect(content.className).toContain("pointer-events-none");
  });

  test("전세 모드는 보증금으로 라벨", () => {
    render(<MapMarkers map={m} data={apts(apt(1, 123000, 80000))} mode="rent" />);
    expect(texts()).toEqual(["단지1 · 전세8억"]);
  });

  test("업데이트 시 id로 비교해 남는 오버레이는 재생성하지 않고 빠진 것만 제거", () => {
    const { rerender } = render(<MapMarkers map={m} data={apts(apt(1, 10000), apt(2, 20000))} mode="trade" />);
    const first = [...FakeOverlay.live].find((o) => o.content.title === "단지1");
    rerender(<MapMarkers map={m} data={apts(apt(1, 10000), apt(3, 30000))} mode="trade" />);
    expect(FakeOverlay.created).toBe(3);
    expect(texts().sort()).toEqual(["단지1 · 25평1억", "단지3 · 25평3억"]);
    expect(FakeOverlay.live.has(first!)).toBe(true);
  });

  test("화면에서 겹치는 단지 라벨은 거래 수가 많은 것만 남긴다", () => {
    const busy = { ...apt(1, 10000), trade_count: 99 };
    const quiet = { ...apt(2, 20000), lng: busy.lng + 0.0001, trade_count: 3 }; // 10px 옆
    const far = apt(3, 30000);
    render(<MapMarkers map={m} data={apts(quiet, busy, far)} mode="trade" />);
    expect(texts().sort()).toEqual(["단지1 · 25평1억", "단지3 · 25평3억"]);
  });

  test("매매→전세 전환 시 라벨 글자가 같아도 다시 그린다(색 변경)", () => {
    const { rerender } = render(<MapMarkers map={m} data={apts(apt(1, 80000, 80000))} mode="trade" />);
    const overlay = [...FakeOverlay.live][0];
    expect(overlay.content.innerHTML).toContain("bg-blue-600");
    rerender(<MapMarkers map={m} data={apts(apt(1, 80000, 80000))} mode="rent" />);
    expect(FakeOverlay.created).toBe(1);
    expect(overlay.content.textContent).toBe("단지1 · 전세8억");
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
