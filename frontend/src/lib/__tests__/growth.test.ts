import { afterEach, describe, expect, test, vi } from "vitest";
import { kakaoFeed, isKakaoInApp } from "../kakao";

describe("kakao", () => {
  test("카톡 인앱 판별", () => {
    expect(isKakaoInApp("Mozilla/5.0 ... KAKAOTALK 10.4.5")).toBe(true);
    expect(isKakaoInApp("Mozilla/5.0 (iPhone) Safari")).toBe(false);
  });

  test("피드 템플릿은 1200×630 이미지와 같은 링크의 버튼을 쓴다", () => {
    const f = kakaoFeed({ title: "잠실엘스 실거래가", description: "최근 매매 33억", url: "https://x/apartment/1", imageUrl: "https://x/api/og/1" });
    expect(f.objectType).toBe("feed");
    expect(f.content).toMatchObject({ title: "잠실엘스 실거래가", imageWidth: 1200, imageHeight: 630 });
    expect(f.buttons[0].link.webUrl).toBe("https://x/apartment/1");
  });
});

describe("analytics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test("운영 호스트만 통과(www 포함), 미리보기·로컬은 막는다", async () => {
    const { isProdHost } = await import("../analytics");
    expect(isProdHost("real-estate-poc-self.vercel.app")).toBe(true);
    expect(isProdHost("www.real-estate-poc-self.vercel.app")).toBe(true);
    expect(isProdHost("real-estate-gy1pgeb5e-link8411-maxs-projects.vercel.app")).toBe(false);
    expect(isProdHost("localhost")).toBe(false);
  });

  test("허용 키·안전한 값만 gtag 로 보낸다", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-TEST");
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    const { track } = await import("../analytics");
    track("apt_view", { apt_id: "1554", region: "11710", q: "잠실 엘스 101동" } as never);
    expect(gtag).toHaveBeenCalledWith("event", "apt_view", { apt_id: "1554", region: "11710" });
    track("share_click", { method: "link", apt_id: "15 54!" } as never);
    expect(gtag).toHaveBeenLastCalledWith("event", "share_click", { method: "link" });
  });

  test("GA_ID 가 없으면 아무것도 보내지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "");
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    const { track } = await import("../analytics");
    track("search_select", { apt_id: "1" });
    expect(gtag).not.toHaveBeenCalled();
  });

  test("초기화 스크립트는 운영 호스트 조건 안에서만 gtag.js 를 부른다", async () => {
    const { gaInitScript } = await import("../analytics");
    const s = gaInitScript("G-TEST");
    expect(s).toMatch(/if\(new RegExp\(.+\)\.test\(location\.hostname\)\)\{.*gtag\/js\?id=G-TEST/);
  });
});
