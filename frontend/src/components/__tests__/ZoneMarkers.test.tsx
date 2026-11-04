import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SAMPLE_ZONES, zone } from "@/test/zones.fixture";
import ZoneMarkers from "../ZoneMarkers";

class FakeLatLng {
  constructor(public lat: number, public lng: number) {}
}
class FakeOverlay {
  static live = new Set<FakeOverlay>();
  content: HTMLElement;
  constructor(opts: { content: HTMLElement; map?: unknown }) {
    this.content = opts.content;
    if (opts.map) FakeOverlay.live.add(this);
  }
  setMap(m: unknown) {
    if (m) FakeOverlay.live.add(this);
    else FakeOverlay.live.delete(this);
  }
  setContent(c: HTMLElement) { this.content = c; }
  setZIndex() {}
}
/** 경도 0.01도 = 1000px 로 투영하는 가짜 지도 */
const map = {
  getProjection: () => ({ containerPointFromCoords: (p: FakeLatLng) => ({ x: (p.lng - 127) * 1e5, y: (37.5 - p.lat) * 1e5 }) }),
} as unknown as kakao.maps.Map;

beforeEach(() => {
  FakeOverlay.live.clear();
  vi.stubGlobal("kakao", { maps: { LatLng: FakeLatLng, CustomOverlay: FakeOverlay } });
});
afterEach(() => vi.unstubAllGlobals());

const located = SAMPLE_ZONES.filter((z) => z.lat !== null);
const live = () => [...FakeOverlay.live].map((o) => o.content);

describe("ZoneMarkers", () => {
  test("구역마다 '유형 · 단계' 라벨 마커 한 개", () => {
    render(<ZoneMarkers map={map} zones={located} />);
    expect(live().map((c) => c.textContent).sort()).toEqual(
      ["재건축 · 조합설립인가", "재건축 · 관리처분인가", "재개발 · 착공", "재개발 · 정비구역지정", "주거환경개선 · 사업시행자지정"].sort(),
    );
  });

  test("유형별로 다른 색, 단계가 높을수록 채도가 높다", () => {
    render(<ZoneMarkers map={map} zones={located} />);
    const diamond = (id: string) => live().find((c) => c.dataset.zoneId === id)!.querySelector("[data-diamond]") as HTMLElement;
    const bg = (id: string) => diamond(id).dataset.fill!;
    expect(new Set(["z001", "z003", "z006"].map(bg)).size).toBe(3); // 재건축·재개발·주거환경개선
    const sat = (c: string) => Number(/hsl\(\d+ (\d+)%/.exec(c)![1]);
    expect(sat(bg("z002"))).toBeGreaterThan(sat(bg("z001"))); // 관리처분 > 조합설립
  });

  test("동 단위 대략 위치(dong_approx)는 속이 빈 마름모, 나머지는 채운 마름모", () => {
    render(<ZoneMarkers map={map} zones={located} />);
    const find = (id: string) => live().find((c) => c.dataset.zoneId === id)!;
    expect(find("z004").dataset.hollow).toBe("true");
    expect(find("z001").dataset.hollow).toBeUndefined();
    expect((find("z004").querySelector("[data-diamond]") as HTMLElement).style.backgroundColor).toBe("transparent");
  });

  test("클릭하면 onSelect(구역)", () => {
    const onSelect = vi.fn();
    render(<ZoneMarkers map={map} zones={located} onSelect={onSelect} />);
    live().find((c) => c.dataset.zoneId === "z003")!.click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ zone_id: "z003" }));
  });

  test("겹치는 마커는 진행 단계가 높은 쪽만 남긴다", () => {
    const a = zone({ zone_id: "a", lat: 37.5, lng: 127.0, stage: "추진위구성", stage_order: 3 });
    const b = zone({ zone_id: "b", lat: 37.5, lng: 127.0001, stage: "착공", stage_order: 7 });
    const c = zone({ zone_id: "c", lat: 37.5, lng: 127.05, stage: "추진위구성", stage_order: 3 }); // 멀리
    render(<ZoneMarkers map={map} zones={[a, b, c]} />);
    expect(live().map((x) => x.dataset.zoneId).sort()).toEqual(["b", "c"]);
  });

  test("선택한 구역은 겹쳐도 남는다", () => {
    const a = zone({ zone_id: "a", lat: 37.5, lng: 127.0, stage: "추진위구성", stage_order: 3 });
    const b = zone({ zone_id: "b", lat: 37.5, lng: 127.0001, stage: "착공", stage_order: 7 });
    render(<ZoneMarkers map={map} zones={[a, b]} selectedId="a" />);
    expect(live().map((x) => x.dataset.zoneId)).toContain("a");
  });

  test("zones 가 비면 마커를 모두 지운다", () => {
    const { rerender } = render(<ZoneMarkers map={map} zones={located} />);
    expect(FakeOverlay.live.size).toBe(5);
    rerender(<ZoneMarkers map={map} zones={[]} />);
    expect(FakeOverlay.live.size).toBe(0);
  });

  test("interactive=false 면 클릭을 막는다", () => {
    render(<ZoneMarkers map={map} zones={located} interactive={false} />);
    expect(live()[0].classList.contains("pointer-events-none")).toBe(true);
  });
});
