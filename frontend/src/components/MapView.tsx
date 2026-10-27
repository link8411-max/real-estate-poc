"use client";

import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import FilterPanel from "@/components/FilterPanel";
import KakaoMap, { type LatLngLiteral } from "@/components/KakaoMap";
import MapMarkers from "@/components/MapMarkers";
import { type MapBounds, readInitialView, readMapFilters, toApiQuery } from "@/lib/mapFilters";
import { useMapData } from "@/lib/useMapData";

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

  const filters = readMapFilters(new URLSearchParams(search.toString()));
  const { data, loading, error, tooWide } = useMapData(
    view?.bounds ?? null,
    view?.level ?? initial.level,
    filters.mode,
    toApiQuery(filters),
  );

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
      {map && <MapMarkers map={map} data={data} mode={filters.mode} />}
      <FilterPanel />
      {tooWide ? (
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
