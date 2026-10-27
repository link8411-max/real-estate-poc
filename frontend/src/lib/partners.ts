// 제휴·연결 링크. 주소는 여기 한 곳에서만 바꾼다.

/** 같은 운영자의 운세 사이트 "운명을 읽다" */
export const UNSE_URL = "https://unse-ai.com";

/** 운세 사이트로 보내는 링크. 유입은 GA 에서 utm 으로 구분한다. */
export function unseLink(path: string, campaign: string): string {
  const u = new URL(path, UNSE_URL);
  u.searchParams.set("utm_source", "real_estate");
  u.searchParams.set("utm_medium", "referral");
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}

// 쿠팡 파트너스 다이나믹 배너 — 운세 사이트와 같은 파트너스 계정(공개 값). subId 로 사이트·위치별 실적을 나눈다.
export const COUPANG_WIDGET_ID = 1043563;
export const COUPANG_TRACKING_CODE = "AF6497036";
export const COUPANG_DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

export function coupangBannerSrc(subId: string, width: number, height: number): string {
  return `https://ads-partners.coupang.com/widgets.html?id=${COUPANG_WIDGET_ID}&template=carousel&trackingCode=${COUPANG_TRACKING_CODE}&subId=${subId}&width=${width}&height=${height}&tsource=`;
}
