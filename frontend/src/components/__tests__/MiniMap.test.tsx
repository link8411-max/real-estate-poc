import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import MiniMap from "../MiniMap";

/** KakaoMap 대역: 마운트되면 SDK를 요청한 것으로 본다. */
const mounted = vi.fn();
vi.mock("../KakaoMap", () => ({
  default: (p: { interactive?: boolean; level: number; onError?: () => void }) => {
    mounted(p);
    return <div data-testid="kakao-map" />;
  },
}));
vi.mock("@/lib/useMapData", () => ({ useMapData: () => ({ data: null, loading: false, error: null, tooWide: false }) }));
vi.mock("../MapMarkers", () => ({ default: () => null }));

/** IntersectionObserver 대역: 만들어진 콜백을 모아 직접 교차시킨다. next/link(프리페치)도 같은 전역을 쓰므로 관찰 대상으로 구분한다. */
const observers: { cb: (e: { isIntersecting: boolean }[]) => void; opts?: IntersectionObserverInit; target?: Element; disconnected: boolean }[] = [];
/** 미니 지도 카드(div)를 보는 관찰자. next/link는 앵커를 본다. */
const mini = () => observers.find((o) => o.target?.tagName === "DIV")!;
beforeEach(() => {
  mounted.mockClear();
  observers.length = 0;
  vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "test-key");
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      entry: (typeof observers)[number];
      constructor(cb: (e: { isIntersecting: boolean }[]) => void, opts?: IntersectionObserverInit) {
        this.entry = { cb, opts, disconnected: false };
        observers.push(this.entry);
      }
      observe(el: Element) { this.entry.target = el; }
      unobserve() {}
      disconnect() { this.entry.disconnected = true; }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const props = { center: { lat: 37.5, lng: 127 }, level: 8, href: "/map", pillLabel: "⤢ 지도 크게 보기", pillTone: "dark" as const, heightClass: "h-[180px]" };

describe("MiniMap", () => {
  test("교차 전에는 지도(SDK)를 요청하지 않고, 링크와 알약은 바로 보인다", () => {
    render(<MiniMap {...props} />);
    expect(mounted).not.toHaveBeenCalled();
    expect(mini().opts?.rootMargin).toBe("200px");
    const pill = screen.getByRole("link", { name: "⤢ 지도 크게 보기" });
    expect(pill).toHaveAttribute("href", "/map");
    expect(pill.className).toContain("bg-gray-900");
  });

  test("교차하면 비상호작용 지도를 한 번 띄우고 관찰을 끝낸다", () => {
    render(<MiniMap {...props} />);
    act(() => mini().cb([{ isIntersecting: false }]));
    expect(mounted).not.toHaveBeenCalled();
    act(() => mini().cb([{ isIntersecting: true }]));
    expect(mounted).toHaveBeenCalled();
    expect(mounted.mock.calls[0][0]).toMatchObject({ interactive: false, level: 8 });
    expect(mini().disconnected).toBe(true);
  });

  test("키가 없으면 교차해도 지도 없이 링크 카드만 둔다", () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "");
    render(<MiniMap {...props} />);
    expect(observers.some((o) => o.target?.tagName === "DIV")).toBe(false);
    expect(mounted).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "⤢ 지도 크게 보기" })).toBeInTheDocument();
  });

  test("SDK 실패(onError)면 지도를 걷어내고 링크는 남긴다", () => {
    render(<MiniMap {...props} />);
    act(() => mini().cb([{ isIntersecting: true }]));
    act(() => mounted.mock.calls[0][0].onError());
    expect(screen.queryByTestId("kakao-map")).toBeNull();
    expect(screen.getByRole("link", { name: "⤢ 지도 크게 보기" })).toBeInTheDocument();
  });
});
