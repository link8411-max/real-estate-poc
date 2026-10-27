import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/script", () => ({
  default: function Script({ onError }: { onError?: () => void }) {
    useEffect(() => onError?.(), [onError]);
    return null;
  },
}));

describe("KakaoMap", () => {
  test("SDK를 불러오지 못하면(window.kakao 없음) 안내 문구를 보여준다", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "test-key");
    const { default: KakaoMap } = await import("../KakaoMap");
    render(<KakaoMap center={{ lat: 37.5665, lng: 126.978 }} level={8} onIdle={() => {}} />);
    expect(await screen.findByText(/지도를 불러오지 못했습니다/)).toBeInTheDocument();
    vi.unstubAllEnvs();
  });
});
