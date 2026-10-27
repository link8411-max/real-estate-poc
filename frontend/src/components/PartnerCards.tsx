"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { gaSlot, track } from "@/lib/analytics";
import { COUPANG_DISCLOSURE, coupangBannerSrc, unseLink } from "@/lib/partners";

const BANNER_W = 400;
const BANNER_H = 140;

/**
 * 단지 페이지 아래 연결 카드: 운세 사이트(같은 운영자) 카드 + 쿠팡 파트너스 배너.
 * 실거래 정보를 다 본 뒤에만 보이도록 페이지 맨 아래에 둔다.
 */
export default function PartnerCards({ slot }: { slot: string }) {
  const gslot = gaSlot(slot);
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    let seen = false;
    const io =
      box && "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              if (!seen && entries.some((e) => e.isIntersecting)) {
                seen = true;
                track("coupang_banner_view", { slot: gslot });
                io?.disconnect();
              }
            },
            { threshold: 0.5 },
          )
        : null;
    if (box) io?.observe(box);
    // 배너는 다른 도메인 iframe 이라 클릭을 직접 볼 수 없어, 창의 초점이 iframe 으로 옮겨 가는 순간을 클릭으로 본다.
    const onBlur = () => {
      setTimeout(() => {
        if (document.activeElement === frameRef.current) track("partner_click", { partner: "coupang", slot: gslot });
      }, 0);
    };
    window.addEventListener("blur", onBlur);
    return () => {
      io?.disconnect();
      window.removeEventListener("blur", onBlur);
    };
  }, [gslot]);

  return (
    <section aria-label="함께 보기" className="space-y-4">
      <a
        href={unseLink("/fortune", slot)}
        target="_blank"
        rel="noopener"
        onClick={() => track("partner_click", { partner: "unse", slot: gslot })}
        className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 transition hover:border-blue-200"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900">이사·내 집 마련 전에 올해 재물운 보기</span>
          <span className="block text-xs text-gray-500">생년월일로 보는 신년운세 · 운명을 읽다</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
      </a>

      <div ref={boxRef} className="rounded-2xl border border-gray-100 bg-white p-4">
        <p className="mb-2 text-center text-xs text-gray-500">추천 상품</p>
        <div className="flex justify-center">
          <iframe
            ref={frameRef}
            src={coupangBannerSrc(slot, BANNER_W, BANNER_H)}
            width={BANNER_W}
            height={BANNER_H}
            frameBorder="0"
            scrolling="no"
            referrerPolicy="unsafe-url"
            loading="lazy"
            title="쿠팡 추천 상품"
            className="max-w-full rounded-xl"
          />
        </div>
        <p className="mt-2 text-center text-[10px] text-gray-400">{COUPANG_DISCLOSURE}</p>
      </div>
    </section>
  );
}
