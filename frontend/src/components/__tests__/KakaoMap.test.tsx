import { cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import KakaoMap from "../KakaoMap";

/** next/script 대역: outcome에 따라 마운트 직후 onReady 또는 onError를 부른다. */
let outcome: "ready" | "error" = "ready";
vi.mock("next/script", () => ({
  default: function Script({ onReady, onError }: { onReady?: () => void; onError?: () => void }) {
    useEffect(() => (outcome === "ready" ? onReady?.() : onError?.()), [onReady, onError]);
    return null;
  },
}));

const props = { center: { lat: 37.5665, lng: 126.978 }, level: 8, onIdle: () => {} };

beforeEach(() => {
  outcome = "ready";
  vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "test-key");
});
afterEach(() => {
  cleanup(); // 언마운트(리스너 해제)가 kakao 대역을 지우기 전에 일어나게
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** 컨테이너 크기(getBoundingClientRect) 대역. 바꾸면 이후 측정에 반영된다. */
let size = { width: 800, height: 600 };
const stubSize = () =>
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ x: 0, y: 0, top: 0, left: 0, right: size.width, bottom: size.height, ...size, toJSON: () => ({}) }) as DOMRect,
  );

/** ResizeObserver 대역: 만들어진 관찰자 콜백을 모두 모은다. */
function stubResizeObserver() {
  const observers: { cb: () => void; disconnected: boolean }[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      entry: { cb: () => void; disconnected: boolean };
      constructor(cb: () => void) {
        this.entry = { cb, disconnected: false };
        observers.push(this.entry);
      }
      observe() {}
      disconnect() { this.entry.disconnected = true; }
    },
  );
  /** 아직 연결된 관찰자 모두에게 크기 변화를 알린다 */
  const fire = () => observers.filter((o) => !o.disconnected).forEach((o) => o.cb());
  return { observers, fire };
}

type Corner = { lat: number; lng: number };
function stubKakao(corners: { sw: Corner; ne: Corner } = { sw: { lat: 37, lng: 126 }, ne: { lat: 38, lng: 128 } }) {
  const center = { getLat: () => 37.5, getLng: () => 127 };
  const ll = (c: Corner) => ({ getLat: () => c.lat, getLng: () => c.lng });
  const fakeMap = {
    relayout: vi.fn(),
    setCenter: vi.fn(),
    getCenter: () => center,
    getLevel: () => 8,
    getBounds: () => ({ getSouthWest: () => ll(corners.sw), getNorthEast: () => ll(corners.ne) }),
  };
  const MapCtor = vi.fn(function () { return fakeMap; });
  const listeners: Record<string, () => void> = {};
  const removeListener = vi.fn();
  vi.stubGlobal("kakao", {
    maps: {
      load: (cb: () => void) => cb(),
      LatLng: function (this: object, lat: number, lng: number) { Object.assign(this, { lat, lng }); },
      Map: MapCtor,
      event: { addListener: (_m: unknown, type: string, h: () => void) => { listeners[type] = h; }, removeListener },
    },
  });
  return { fakeMap, center, MapCtor, listeners, removeListener };
}

beforeEach(() => {
  size = { width: 800, height: 600 };
});

describe("KakaoMap", () => {
  test("앱 키가 없으면 키 설정 안내", () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "");
    render(<KakaoMap {...props} />);
    expect(screen.getByText("지도 키가 설정되지 않았습니다.")).toBeInTheDocument();
  });

  test("스크립트 로드 오류면 안내 문구", async () => {
    outcome = "error";
    render(<KakaoMap {...props} />);
    expect(await screen.findByText(/지도를 불러오지 못했습니다/)).toBeInTheDocument();
  });

  test("스크립트는 불렀지만 window.kakao가 없으면 안내 문구", async () => {
    render(<KakaoMap {...props} />);
    expect(await screen.findByText(/지도를 불러오지 못했습니다/)).toBeInTheDocument();
  });

  test("지도 생성 직후 relayout, 컨테이너 크기 변화 시 relayout 후 이전 중심 복원, 언마운트 시 정리", () => {
    stubSize();
    const { fakeMap, center, removeListener } = stubKakao();
    const ro = stubResizeObserver();
    const onReady = vi.fn();
    const { unmount } = render(<KakaoMap {...props} onReady={onReady} />);
    expect(onReady).toHaveBeenCalledWith(fakeMap);
    expect(fakeMap.relayout).toHaveBeenCalledTimes(1);

    ro.fire();
    expect(fakeMap.relayout).toHaveBeenCalledTimes(2);
    expect(fakeMap.setCenter).toHaveBeenLastCalledWith(center);
    expect(fakeMap.relayout.mock.invocationCallOrder[1]).toBeLessThan(fakeMap.setCenter.mock.invocationCallOrder[0]);

    // 오버레이 버튼 포커스 등으로 컨테이너가 스크롤되면 즉시 0으로 되돌린다(타일 어긋남 방지)
    const container = screen.getByTestId("kakao-map");
    container.scrollTop = 204;
    container.scrollLeft = 196;
    container.dispatchEvent(new Event("scroll"));
    expect([container.scrollTop, container.scrollLeft]).toEqual([0, 0]);

    unmount();
    expect(ro.observers.every((o) => o.disconnected)).toBe(true);
    expect(removeListener).toHaveBeenCalledWith(fakeMap, "idle", expect.any(Function));
  });

  test("생성 직후 범위를 바로 알린다", () => {
    stubSize();
    stubKakao();
    stubResizeObserver();
    const onIdle = vi.fn();
    render(<KakaoMap {...props} onIdle={onIdle} />);
    expect(onIdle).toHaveBeenCalledWith({ minLat: 37, minLng: 126, maxLat: 38, maxLng: 128 }, 8, { lat: 37.5, lng: 127 });
  });

  test("컨테이너 크기가 0이면 지도 생성을 미루고, 크기가 생기면 만든 뒤 바로 onIdle", () => {
    size = { width: 1024, height: 0 };
    stubSize();
    const { MapCtor, fakeMap } = stubKakao();
    const ro = stubResizeObserver();
    const onIdle = vi.fn();
    const onReady = vi.fn();
    render(<KakaoMap {...props} onIdle={onIdle} onReady={onReady} />);
    expect(MapCtor).not.toHaveBeenCalled();
    expect(onIdle).not.toHaveBeenCalled();

    ro.fire(); // 아직 0
    expect(MapCtor).not.toHaveBeenCalled();

    size = { width: 1024, height: 715 };
    ro.fire();
    expect(MapCtor).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith(fakeMap);
    expect(onIdle).toHaveBeenCalledWith({ minLat: 37, minLng: 126, maxLat: 38, maxLng: 128 }, 8, { lat: 37.5, lng: 127 });
    expect(ro.observers[0].disconnected).toBe(true); // 대기용 관찰자는 정리
  });

  test("크기 변화 콜백은 relayout 뒤 바로 onIdle을 보낸다", () => {
    stubSize();
    stubKakao();
    const ro = stubResizeObserver();
    const onIdle = vi.fn();
    render(<KakaoMap {...props} onIdle={onIdle} />);
    onIdle.mockClear();
    ro.fire();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  test("범위가 한 점(min == max)이면 onIdle을 보내지 않는다", () => {
    vi.useFakeTimers();
    stubSize();
    const p = { lat: 37.5664005, lng: 126.9779053 };
    const { listeners } = stubKakao({ sw: p, ne: p });
    const ro = stubResizeObserver();
    const onIdle = vi.fn();
    render(<KakaoMap {...props} onIdle={onIdle} />);
    ro.fire();
    listeners.idle();
    vi.advanceTimersByTime(1000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  test("탭이 다시 보이면 relayout 후 onIdle", () => {
    stubSize();
    const { fakeMap } = stubKakao();
    stubResizeObserver();
    const onIdle = vi.fn();
    render(<KakaoMap {...props} onIdle={onIdle} />);
    onIdle.mockClear();
    fakeMap.relayout.mockClear();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fakeMap.relayout).toHaveBeenCalledTimes(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
