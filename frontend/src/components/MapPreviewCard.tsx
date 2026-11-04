"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { areaGroup, areaToPyeong, formatDeal, formatPrice } from "@/lib/format";
import type { MapApartment } from "@/lib/useMapData";

interface Props {
  apartment: MapApartment;
  onClose: () => void;
  /** 카드 높이(px)가 바뀔 때마다 알린다(내 위치 버튼을 카드 위로 올리는 데 쓴다) */
  onHeight?: (height: number) => void;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg bg-gray-50 px-2 py-2">
      <p className="truncate text-[11px] text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-gray-900">{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

/** 마커를 눌렀을 때 뜨는 단지 미리보기 카드. Escape로도 닫힌다. */
export default function MapPreviewCard({ apartment: a, onClose, onHeight }: Props) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !onHeight) return;
    const report = () => onHeight(node.getBoundingClientRect().height);
    report();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(report);
    ro.observe(node);
    return () => ro.disconnect();
  }, [onHeight]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const subtitle = [a.build_year !== null && `${a.build_year}년`, a.trade_count !== null && `거래 ${a.trade_count}건`]
    .filter(Boolean)
    .join(" · ");
  const tradeLabel = a.latest_trade_area === null ? "최근 매매" : `최근 매매 (${areaToPyeong(areaGroup(a.latest_trade_area))}평)`;
  const ratio =
    a.latest_trade_amount && a.latest_jeonse_deposit !== null
      ? `${Math.round((a.latest_jeonse_deposit / a.latest_trade_amount) * 100)}%`
      : "-";

  return (
    <section
      ref={ref}
      aria-label={`${a.name} 미리보기`}
      className="absolute inset-x-3 bottom-14 z-10 max-h-[calc(100dvh-81px-68px)] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl md:inset-x-auto md:bottom-8 md:right-4 md:max-h-[calc(100dvh-53px-44px)] md:w-[360px]"
    >
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute right-2 top-2 rounded-full p-1.5 text-gray-400 hover:bg-gray-100">
        <X className="h-4 w-4" aria-hidden />
      </button>
      <h2 className="truncate pr-8 text-base font-bold text-gray-900">{a.name}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      <div className="mt-3 flex gap-2">
        <Stat
          label={tradeLabel}
          value={a.latest_trade_amount === null ? "-" : formatPrice(a.latest_trade_amount)}
          sub={a.latest_trade_date ? formatDeal(a.latest_trade_date) : undefined}
        />
        <Stat label="최근 전세" value={a.latest_jeonse_deposit === null ? "-" : formatPrice(a.latest_jeonse_deposit)} />
        <Stat label="전세가율" value={ratio} />
      </div>
      <Link
        href={`/apartment/${a.id}`}
        className="mt-3 block rounded-lg bg-blue-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
      >
        상세 보기 ›
      </Link>
    </section>
  );
}
