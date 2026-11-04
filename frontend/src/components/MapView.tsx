"use client";

import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import FilterPanel from "@/components/FilterPanel";
import KakaoMap, { type LatLngLiteral } from "@/components/KakaoMap";
import MapMarkers from "@/components/MapMarkers";
import MapPreviewCard from "@/components/MapPreviewCard";
import MyLocationButton from "@/components/MyLocationButton";
import { type MapBounds, readInitialView, readMapFilters, toApiQuery } from "@/lib/mapFilters";
import { useMapData, type MapApartment } from "@/lib/useMapData";

/** 모바일 카드의 하단 여백(Tailwind bottom-14 = 56px) */
const CARD_BOTTOM_PX = 56;

function Toast({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "error" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm shadow-lg ${
        tone === "error" ? "bg-red-600 text-white" : "bg-gray-900/85 text-white"
      }`}
    >
      {children}
    </div>
  );
}

/** /map 본문: 지도 + 필터 + 상태 표시. 지도 위치는 idle마다 URL(?lat&lng&level)에 남겨 공유할 수 있게 한다. */
export default function MapView() {
  const search = useSearchParams();
  const [initial] = useState(() => readInitialView(new URLSearchParams(search.toString())));
  const [view, setView] = useState<{ bounds: MapBounds; level: number } | null>(null);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);

  // 내 위치 버튼의 안내·오류 토스트(3초 뒤 사라진다)
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showNotice = useCallback((text: string, tone: "info" | "error") => {
    clearTimeout(noticeTimer.current);
    setNotice({ text, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const filters = readMapFilters(new URLSearchParams(search.toString()));
  const { data, loading, error, tooWide } = useMapData(
    view?.bounds ?? null,
    view?.level ?? initial.level,
    filters.mode,
    toApiQuery(filters),
  );

  // 미리보기 카드: 마커 선택 → 카드. 지도 빈 곳 클릭·Escape·닫기로 닫는다.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 카드 높이: 모바일에서 내 위치 버튼을 카드 바로 위(카드 bottom 56px + 간격 8px)로 올린다
  const [cardHeight, setCardHeight] = useState(0);
  const closeCard = useCallback(() => setSelectedId(null), []);
  const selectApartment = useCallback((a: MapApartment) => setSelectedId(a.id), []);
  const selected = data?.type === "apartments" ? (data.items.find((a) => a.id === selectedId) ?? null) : null;
  // 선택한 단지가 불러온 데이터에서 빠지면(이동·필터·확대) 선택을 푼다
  if (selectedId !== null && data && !selected) setSelectedId(null);
  useEffect(() => {
    if (!map) return;
    kakao.maps.event.addListener(map, "click", closeCard);
    return () => kakao.maps.event.removeListener(map, "click", closeCard);
  }, [map, closeCard]);

  const onIdle = useCallback((bounds: MapBounds, level: number, center: LatLngLiteral) => {
    setView({ bounds, level });
    const sp = new URLSearchParams(window.location.search);
    sp.set("lat", center.lat.toFixed(5));
    sp.set("lng", center.lng.toFixed(5));
    sp.set("level", String(level));
    window.history.replaceState(null, "", `${window.location.pathname}?${sp}`);
  }, []);

  return (
    <div className="relative h-[calc(100dvh-81px)] w-full overflow-hidden md:h-[calc(100dvh-53px)]">
      {/* 모바일은 하단 시트 바(44px) 위에서 지도가 끝나 카카오 로고가 가리지 않는다 */}
      <div className="absolute inset-x-0 top-0 bottom-11 md:bottom-0">
        <KakaoMap center={initial.center} level={initial.level} onIdle={onIdle} onReady={setMap} />
      </div>
      {map && <MapMarkers map={map} data={data} mode={filters.mode} bounds={view?.bounds} selectedId={selected?.id ?? null} onSelect={selectApartment} />}
      {map && <MyLocationButton map={map} onNotice={showNotice} liftPx={selected && cardHeight > 0 ? CARD_BOTTOM_PX + cardHeight + 8 : undefined} />}
      {selected && <MapPreviewCard apartment={selected} onClose={closeCard} onHeight={setCardHeight} />}
      <FilterPanel />
      {notice ? (
        <Toast tone={notice.tone}>{notice.text}</Toast>
      ) : tooWide ? (
        <Toast>지도를 더 확대해 주세요</Toast>
      ) : error ? (
        <Toast tone="error">{error}</Toast>
      ) : (
        loading && (
          <Toast>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            불러오는 중…
          </Toast>
        )
      )}
    </div>
  );
}
