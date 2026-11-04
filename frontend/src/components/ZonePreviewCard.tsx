"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ZoneChip } from "@/components/ZoneChips";
import { formatHouseholds, ZONE_DISCLAIMER } from "@/lib/redevelopment";
import type { Zone } from "@/lib/types";

interface Props {
  zone: Zone;
  onClose: () => void;
  /** 카드 높이(px)가 바뀔 때마다 알린다(내 위치 버튼을 카드 위로 올리는 데 쓴다) */
  onHeight?: (height: number) => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg bg-gray-50 px-2 py-2">
      <p className="truncate text-[11px] text-gray-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-gray-900">{value}</p>
    </div>
  );
}

/** 정비구역 마커를 눌렀을 때 뜨는 카드. 단지 미리보기 카드(MapPreviewCard)와 같은 자리·같은 닫기 방식. */
export default function ZonePreviewCard({ zone: z, onClose, onHeight }: Props) {
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

  return (
    <section
      ref={ref}
      aria-label={`${z.name} 정비구역`}
      className="absolute inset-x-3 bottom-14 z-10 max-h-[calc(100dvh-81px-68px)] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl md:inset-x-auto md:bottom-8 md:right-4 md:max-h-[calc(100dvh-53px-44px)] md:w-[360px]"
    >
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute right-2 top-2 rounded-full p-1.5 text-gray-400 hover:bg-gray-100">
        <X className="h-4 w-4" aria-hidden />
      </button>
      <h2 className="truncate pr-8 text-base font-bold text-gray-900">{z.name}</h2>
      <p className="mt-0.5 text-xs text-gray-500">
        {z.sido.replace(/특별시|광역시|도$/, "")} {z.sigungu} · <span>{z.type}</span>
      </p>
      <div className="mt-2">
        <ZoneChip zone={z} />
      </div>
      <div className="mt-3 flex gap-2">
        <Stat label="공급 예정 세대수" value={formatHouseholds(z.households)} />
        <Stat label="사업시행자" value={z.operator ?? "-"} />
      </div>
      {z.geo === "dong_approx" && <p className="mt-2 text-xs text-gray-500">위치는 동 단위 대략</p>}
      <div className="mt-3 flex flex-col gap-2">
        {z.apt_ids.map((id, i) => (
          <Link key={id} href={`/apartment/${id}`} className="block rounded-lg bg-blue-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700">
            {z.apt_ids.length > 1 ? `단지 ${i + 1} 보기 ›` : "단지 보기 ›"}
          </Link>
        ))}
        <Link href={`/redevelopment#zone-${z.zone_id}`} className="block text-center text-sm text-blue-600 hover:underline">
          목록에서 보기 ›
        </Link>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-gray-400">{ZONE_DISCLAIMER}</p>
    </section>
  );
}
