import { afterEach, describe, expect, test, vi } from "vitest";
import { kakaoFeed, isKakaoInApp } from "../kakao";
import { COUPANG_DISCLOSURE, coupangBannerSrc, unseLink } from "../partners";

describe("partners", () => {
  test("운세 링크에 utm 세 개가 붙고 경로가 유지된다", () => {
    const u = new URL(unseLink("/fortune", "apt-detail"));
    expect(u.origin + u.pathname).toBe("https://unse-ai.com/fortune");
    expect(u.searchParams.get("utm_source")).toBe("real_estate");
    expect(u.searchParams.get("utm_medium")).toBe("referral");
    expect(u.searchParams.get("utm_campaign")).toBe("apt-detail");
  });

  test("쿠팡 배너 주소는 위젯 id·trackingCode·subId·크기를 담는다", () => {
    const u = new URL(coupangBannerSrc("apt-detail", 400, 140));
    expect(u.host).toBe("ads-partners.coupang.com");
    expect(u.searchParams.get("id")).toBe("1043563");
    expect(u.searchParams.get("trackingCode")).toBe("AF6497036");
    expect(u.searchParams.get("subId")).toBe("apt-detail");
    expect(u.searchParams.get("width")).toBe("400");
  });

  test("대가성 문구는 쿠팡 규정 문장 그대로", () => {
    expect(COUPANG_DISCLOSURE).toBe("이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.");
  });
});

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
    track("partner_click", { partner: "unse", slot: "apt detail!" });
    expect(gtag).toHaveBeenLastCalledWith("event", "partner_click", { partner: "unse" });
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
