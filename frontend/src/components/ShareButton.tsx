"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { type ShareMethod, track, withUtm } from "@/lib/analytics";
import { isKakaoInApp, type KakaoShareMeta, shareKakao } from "@/lib/kakao";

/**
 * 단지 공유. 카톡 인앱 → 카카오톡 공유, 휴대폰 → 기기 공유창, 그 밖(PC) → 카카오톡 공유,
 * 모두 안 되면 링크 복사. 어떤 방법으로 공유했는지 share_click 으로 남기고, 링크에는 방법별 UTM 을 붙인다.
 */
export default function ShareButton({ aptId, meta }: { aptId: number; meta: KakaoShareMeta }) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    const kakaoMeta = { ...meta, url: withUtm(meta.url, "kakao") };
    let method: ShareMethod | null = null;
    const ua = navigator.userAgent;
    if (isKakaoInApp(ua) && (await shareKakao(kakaoMeta))) method = "kakao";
    if (!method && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: meta.title, text: meta.description, url: withUtm(meta.url, "share") });
        method = "share";
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // 사용자가 공유창을 닫음
      }
    }
    if (!method && (await shareKakao(kakaoMeta))) method = "kakao";
    if (!method) {
      try {
        await navigator.clipboard.writeText(withUtm(meta.url, "link"));
        method = "link";
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        return;
      }
    }
    track("share_click", { method, apt_id: String(aptId) });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
    >
      <Share2 className="h-4 w-4" aria-hidden />
      {copied ? "링크 복사됨" : "공유"}
    </button>
  );
}
