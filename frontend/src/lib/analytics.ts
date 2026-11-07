// GA4 이벤트. 측정 ID 는 공개 값이라 NEXT_PUBLIC_GA_ID 로 받는다(없으면 아무것도 보내지 않는다).
// 실제 통계는 운영 주소(SITE_URL 의 호스트)에서만 보낸다 — 로컬·Vercel 미리보기는 dataLayer 에만 쌓인다.
// 개인정보 원칙: 검색어 원문은 보내지 않는다. 단지 id·지역 코드·위치 이름 같은 키만 보낸다.
import { SITE_URL } from "@/lib/seo";

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";

export type ShareMethod = "kakao" | "share" | "link" | "image";

const UTM_SOURCE: Record<ShareMethod, string> = { kakao: "kakaotalk", share: "share_sheet", link: "link_copy", image: "image_save" };

/** 공유 링크에 UTM 을 붙인다 — 카톡·인스타 인앱 브라우저는 레퍼러를 지워서 유입 경로를 UTM 으로 구분한다.
 *  페이지마다 canonical 이 있어 검색 색인에는 영향이 없다. */
export function withUtm(url: string, method: ShareMethod): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", UTM_SOURCE[method]);
  u.searchParams.set("utm_medium", "share");
  return u.toString();
}

type Events = {
  apt_view: { apt_id: string; region: string };
  search_select: { apt_id: string };
  share_click: { method: ShareMethod; apt_id: string };
};

const ALLOWED_KEYS = new Set(["apt_id", "region", "method"]);
const SAFE_VALUE = /^[A-Za-z0-9_가-힣]{1,32}$/;
export const isSafeValue = (v: unknown) => typeof v === "string" && SAFE_VALUE.test(v);

/** 운영 호스트(www 포함) 판정 식. layout 의 GA 초기화 스크립트도 이 식을 쓴다. */
export const PROD_HOST_SOURCE = `^(www\\.)?${new URL(SITE_URL).hostname.replace(/\./g, "\\.")}$`;
export const isProdHost = (host: string) => new RegExp(PROD_HOST_SOURCE).test(host);

type Gtag = (...a: unknown[]) => void;
const getGtag = () => (globalThis as { window?: { gtag?: Gtag } }).window?.gtag;

// GA 초기화(afterInteractive)보다 먼저 나는 이벤트(첫 화면 apt_view 등)는 잠시 모았다가 보낸다.
const pending: [string, Record<string, string>][] = [];
let flushTries = 0;
function flushLater() {
  if (flushTries > 0) return;
  const tick = () => {
    const gtag = getGtag();
    if (typeof gtag === "function") {
      for (const [e, p] of pending.splice(0)) gtag("event", e, p);
      flushTries = 0;
      return;
    }
    if (++flushTries > 50) {
      pending.length = 0; // 약 10초 뒤 포기(광고·추적 차단)
      flushTries = 0;
      return;
    }
    setTimeout(tick, 200);
  };
  flushTries = 1;
  setTimeout(tick, 200);
}

export function track<E extends keyof Events>(event: E, params: Events[E]) {
  if (!GA_ID || !(globalThis as { window?: unknown }).window) return;
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (ALLOWED_KEYS.has(k) && isSafeValue(v)) clean[k] = v as string;
  const gtag = getGtag();
  if (typeof gtag === "function") {
    gtag("event", event, clean);
    return;
  }
  pending.push([event, clean]);
  flushLater();
}

/** layout 에 넣는 초기화 스크립트 본문. 운영 호스트에서만 gtag.js 를 불러온다. */
export function gaInitScript(id: string): string {
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());
if(new RegExp(${JSON.stringify(PROD_HOST_SOURCE)}).test(location.hostname)){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${id}';document.head.appendChild(s);gtag('config','${id}');}`;
}
