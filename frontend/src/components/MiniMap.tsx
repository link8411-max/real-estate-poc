"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import KakaoMap, { type LatLngLiteral } from "@/components/KakaoMap";
import MapMarkers from "@/components/MapMarkers";
import type { MapBounds } from "@/lib/mapFilters";
import { useMapData } from "@/lib/useMapData";

interface Props {
  center: LatLngLiteral;
  level: number;
  /** 카드 전체와 알약이 가는 곳 */
  href: string;
  pillLabel: string;
  /** dark: 홈(검정 알약), light: 단지 페이지(흰 알약+테두리) */
  pillTone: "dark" | "light";
  /** 높이 클래스. 플레이스홀더와 지도가 같아 레이아웃이 밀리지 않는다. */
  heightClass: string;
  /** 지도 중심에 붉은 `여기` 핀을 둔다(단지 페이지) */
  showHere?: boolean;
  /** 이 단지의 일반 마커는 빼고 `여기` 핀만 보인다 */
  excludeId?: number;
  testId?: string;
}

const PILL_TONE = {
  dark: "bg-gray-900 text-white",
  light: "border border-gray-300 bg-white text-gray-800",
};

/** 중심 좌표에 붉은 `여기` 알약 오버레이를 올린다. */
function HerePin({ map, position }: { map: kakao.maps.Map; position: LatLngLiteral }) {
  useEffect(() => {
    const content = document.createElement("span");
    content.className = "pointer-events-none rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow ring-2 ring-white";
    content.textContent = "여기";
    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(position.lat, position.lng),
      content,
      map,
      yAnchor: 0.5,
      zIndex: 20,
    });
    return () => overlay.setMap(null);
  }, [map, position.lat, position.lng]);
  return null;
}

/**
 * 조작할 수 없는 미니 지도 카드. 카드 전체가 링크다.
 * 카카오 SDK는 카드가 화면 200px 앞에 들어올 때 처음 불러온다. 그 전·키 없음·SDK 실패일 때는
 * 같은 크기의 회색 자리 + 알약 링크만 남는다(에러 UI 없음).
 */
export default function MiniMap({ center, level, href, pillLabel, pillTone, heightClass, showHere, excludeId, testId }: Props) {
  const hasKey = !!process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  const rootRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);
  const [view, setView] = useState<{ bounds: MapBounds; level: number } | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!hasKey || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      // 관찰자가 없는 환경: 바로 지도를 띄운다(렌더 중이 아니라 다음 틱에)
      queueMicrotask(() => setNear(true));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasKey]);

  const { data } = useMapData(view?.bounds ?? null, view?.level ?? level, "trade", {});
  const shown = excludeId !== undefined && data?.type === "apartments" ? { ...data, items: data.items.filter((a) => a.id !== excludeId) } : data;

  return (
    <div
      ref={rootRef}
      data-testid={testId}
      className={`relative overflow-hidden rounded-2xl border border-gray-100 bg-gray-100 shadow-sm ${heightClass}`}
    >
      {hasKey && near && !failed && (
        <div className="absolute inset-0">
          <KakaoMap
            center={center}
            level={level}
            interactive={false}
            onIdle={(bounds, lv) => setView({ bounds, level: lv })}
            onReady={setMap}
            onError={() => setFailed(true)}
          />
        </div>
      )}
      {map && <MapMarkers map={map} data={shown} mode="trade" bounds={view?.bounds} interactive={false} />}
      {map && showHere && <HerePin map={map} position={center} />}
      {/* 지도 위를 덮는 링크: 카드 어디를 눌러도 이동한다 */}
      <Link href={href} aria-hidden tabIndex={-1} className="absolute inset-0 z-10" />
      <Link
        href={href}
        className={`absolute bottom-3 right-3 z-20 rounded-full px-3 py-1.5 text-sm font-semibold shadow-md ${PILL_TONE[pillTone]}`}
      >
        {pillLabel}
      </Link>
    </div>
  );
}
