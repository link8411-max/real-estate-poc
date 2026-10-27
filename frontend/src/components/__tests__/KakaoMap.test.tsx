import { render, screen } from "@testing-library/react";
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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
    const center = { getLat: () => 37.5, getLng: () => 127 };
    const fakeMap = {
      relayout: vi.fn(),
      setCenter: vi.fn(),
      getCenter: () => center,
      getLevel: () => 8,
      getBounds: () => ({
        getSouthWest: () => ({ getLat: () => 37, getLng: () => 126 }),
        getNorthEast: () => ({ getLat: () => 38, getLng: () => 128 }),
      }),
    };
    const removeListener = vi.fn();
    vi.stubGlobal("kakao", {
      maps: {
        load: (cb: () => void) => cb(),
        LatLng: function (this: object, lat: number, lng: number) { Object.assign(this, { lat, lng }); },
        Map: function () { return fakeMap; },
        event: { addListener: vi.fn(), removeListener },
      },
    });
    let resize: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) { resize = cb; }
        observe() {}
        disconnect = disconnect;
      },
    );
    const onReady = vi.fn();
    const { unmount } = render(<KakaoMap {...props} onReady={onReady} />);
    expect(onReady).toHaveBeenCalledWith(fakeMap);
    expect(fakeMap.relayout).toHaveBeenCalledTimes(1);

    resize!();
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
    expect(disconnect).toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalledWith(fakeMap, "idle", expect.any(Function));
  });
});
