import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import MapView from "../MapView";
import MyLocationButton from "../MyLocationButton";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/FilterPanel", () => ({ default: () => null }));
vi.mock("@/components/MapMarkers", () => ({ default: () => null }));
vi.mock("@/lib/useMapData", () => ({
  useMapData: () => ({ data: null, loading: false, error: null, tooWide: false }),
}));

let level = 7;
const map = { getLevel: () => level, setLevel: vi.fn(), setCenter: vi.fn() };
vi.mock("@/components/KakaoMap", async () => {
  const { useEffect } = await import("react");
  return {
    default: function FakeKakaoMap({ onReady }: { onReady?: (m: unknown) => void }) {
      useEffect(() => onReady?.(map), [onReady]);
      return null;
    },
  };
});

class FakeLatLng {
  constructor(public lat: number, public lng: number) {}
  getLat() { return this.lat; }
  getLng() { return this.lng; }
}
const overlays: { setMap: ReturnType<typeof vi.fn>; opts: { zIndex?: number; content: HTMLElement } }[] = [];
class FakeOverlay {
  setMap = vi.fn();
  constructor(public opts: { zIndex?: number; content: HTMLElement }) { overlays.push(this); }
}

const getCurrentPosition = vi.fn();
const setGeo = (on: boolean) =>
  Object.defineProperty(navigator, "geolocation", { value: on ? { getCurrentPosition } : undefined, configurable: true });
const succeed = (lat: number, lng: number) =>
  getCurrentPosition.mockImplementationOnce((ok) => ok({ coords: { latitude: lat, longitude: lng } }));
const fail = (code: number) => getCurrentPosition.mockImplementationOnce((_o, err) => err({ code }));
const click = () => act(() => { fireEvent.click(screen.getByRole("button", { name: "내 위치" })); });

beforeEach(() => {
  level = 7;
  overlays.length = 0;
  getCurrentPosition.mockReset();
  map.setLevel.mockReset();
  map.setCenter.mockReset();
  setGeo(true);
  vi.stubGlobal("kakao", { maps: { LatLng: FakeLatLng, CustomOverlay: FakeOverlay, event: { addListener: vi.fn(), removeListener: vi.fn() } } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("내 위치 버튼", () => {
  test("geolocation이 없으면 버튼을 숨긴다", () => {
    setGeo(false);
    render(<MapView />);
    expect(screen.queryByRole("button", { name: "내 위치" })).toBeNull();
  });

  test("로드만으로는 위치를 요청하지 않고, 클릭하면 옵션과 함께 한 번 요청한다", () => {
    render(<MapView />);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    getCurrentPosition.mockImplementationOnce(() => {});
    click();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });

  test("성공: 중심 이동 + 레벨 7이면 5로, 오버레이 생성", () => {
    render(<MapView />);
    succeed(37.5, 127);
    click();
    expect(map.setCenter).toHaveBeenCalledTimes(1);
    expect(map.setCenter.mock.calls[0][0]).toMatchObject({ lat: 37.5, lng: 127 });
    expect(map.setLevel).toHaveBeenCalledWith(5);
    expect(overlays).toHaveLength(1);
    expect(overlays[0].setMap).toHaveBeenCalledWith(map);
    // 단지 라벨(호버 시 10)보다 위, 마커 클릭을 막지 않는다
    expect(overlays[0].opts.zIndex).toBeGreaterThan(10);
    expect(overlays[0].opts.content.className).toContain("pointer-events-none");
  });

  test("레벨이 5 이하면 레벨은 그대로", () => {
    level = 4;
    render(<MapView />);
    succeed(37.5, 127);
    click();
    expect(map.setCenter).toHaveBeenCalled();
    expect(map.setLevel).not.toHaveBeenCalled();
  });

  test("다시 성공하면 이전 오버레이를 걷어낸다", () => {
    render(<MapView />);
    succeed(37.5, 127);
    click();
    succeed(37.6, 127.1);
    click();
    expect(overlays).toHaveLength(2);
    expect(overlays[0].setMap).toHaveBeenCalledWith(null);
  });

  test("권한 거부(1): 권한 안내 토스트", () => {
    render(<MapView />);
    fail(1);
    click();
    expect(screen.getByRole("alert").textContent).toBe("위치 권한을 허용해 주세요");
    expect(map.setCenter).not.toHaveBeenCalled();
  });

  test("타임아웃(3): 못 찾았다는 토스트", () => {
    render(<MapView />);
    fail(3);
    click();
    expect(screen.getByRole("alert").textContent).toBe("현재 위치를 찾지 못했어요");
  });

  test("수도권 밖이면 이동은 하되 안내 토스트", () => {
    render(<MapView />);
    succeed(35.1, 129.0);
    click();
    expect(map.setCenter).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("이 지역은 아직 데이터가 없어요");
  });

  test("토스트는 3초 뒤 사라진다", () => {
    vi.useFakeTimers();
    render(<MapView />);
    fail(1);
    click();
    expect(screen.getByRole("alert")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByRole("alert")).toBeNull();
    vi.useRealTimers();
  });

  test("liftPx가 있으면 버튼 하단 오프셋이 그 값을 따른다", () => {
    const { rerender } = render(<MyLocationButton map={map as never} onNotice={() => {}} />);
    const btn = () => screen.getByRole("button", { name: "내 위치" });
    expect(btn().style.getPropertyValue("--lift")).toBe("");
    rerender(<MyLocationButton map={map as never} onNotice={() => {}} liftPx={240} />);
    expect(btn().style.getPropertyValue("--lift")).toBe("240px");
    expect(btn().className).toContain("bottom-[calc(var(--card-bottom)+var(--lift)+8px)]");
    // 데스크톱(md+)에서도 같은 lift가 적용된다: 카드 하단 여백만 32px로 바뀐다
    expect(btn().className).toContain("md:[--card-bottom:32px]");
    expect(btn().className).not.toContain("md:bottom-8");
    rerender(<MyLocationButton map={map as never} onNotice={() => {}} liftPx={180} />);
    expect(btn().style.getPropertyValue("--lift")).toBe("180px");
  });
});
