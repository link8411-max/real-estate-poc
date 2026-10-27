// 카카오톡 공유 (Kakao SDK for JavaScript). 지도와 같은 카카오 앱의 JavaScript 키(공개 값)를 쓴다.
// 카카오 개발자 콘솔에 등록한 사이트 도메인에서만 동작한다.
const SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
const SDK_INTEGRITY = "sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka";

export interface KakaoShareMeta {
  title: string;
  description: string;
  url: string;
  imageUrl: string;
}

type KakaoSDK = {
  isInitialized: () => boolean;
  init: (key: string) => void;
  Share: { sendDefault: (template: ReturnType<typeof kakaoFeed>) => void };
};

export function isKakaoInApp(userAgent: string): boolean {
  return /KAKAOTALK/i.test(userAgent);
}

/** 피드 템플릿: 단지 이름·최근가, 미리보기 이미지(1200×630), "실거래가 보기" 버튼 */
export function kakaoFeed(m: KakaoShareMeta) {
  const link = { mobileWebUrl: m.url, webUrl: m.url };
  return {
    objectType: "feed" as const,
    content: { title: m.title, description: m.description, imageUrl: m.imageUrl, imageWidth: 1200, imageHeight: 630, link },
    buttons: [{ title: "실거래가 보기", link }],
  };
}

let loading: Promise<KakaoSDK | null> | null = null;

function loadKakao(): Promise<KakaoSDK | null> {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  const w = globalThis as unknown as { window?: Window & { Kakao?: KakaoSDK } };
  if (!w.window || !key) return Promise.resolve(null);
  if (w.window.Kakao) return Promise.resolve(init(w.window.Kakao, key));
  if (!loading) {
    loading = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = SDK_URL;
      s.integrity = SDK_INTEGRITY;
      s.crossOrigin = "anonymous";
      s.async = true;
      s.onload = () => resolve(w.window!.Kakao ? init(w.window!.Kakao, key) : null);
      s.onerror = () => {
        loading = null;
        resolve(null);
      };
      document.head.appendChild(s);
      // 제한 시간에 걸리면 다음 공유 때 다시 불러온다
      setTimeout(() => {
        if (!w.window!.Kakao) loading = null;
        resolve(null);
      }, 8000);
    });
  }
  return loading;
}

function init(k: KakaoSDK, key: string): KakaoSDK | null {
  try {
    if (!k.isInitialized()) k.init(key);
    return k;
  } catch {
    return null;
  }
}

/** 카카오톡 공유 화면을 연다. 실패하면 false — 호출 쪽이 기기 공유·링크 복사로 넘어간다. */
export async function shareKakao(m: KakaoShareMeta): Promise<boolean> {
  const k = await loadKakao();
  if (!k) return false;
  try {
    k.Share.sendDefault(kakaoFeed(m));
    return true;
  } catch {
    return false;
  }
}
