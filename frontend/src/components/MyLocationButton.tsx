"use client";

import { Loader2, LocateFixed } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const LOCATE_LEVEL = 5;
/** 단지 라벨(MapMarkers: 평소 0, 선택 10, 호버 11)보다 항상 위에 보이게 한다 */
const LOCATE_Z = 100;
/** 수도권 데이터 범위(대략). 밖이어도 이동은 하되 안내한다. */
const AREA = { minLat: 36.9, maxLat: 38.3, minLng: 126.0, maxLng: 127.9 };
const inArea = (lat: number, lng: number) =>
  lat >= AREA.minLat && lat <= AREA.maxLat && lng >= AREA.minLng && lng <= AREA.maxLng;

interface Props {
  map: kakao.maps.Map;
  /** 안내·오류 문구 전달(토스트는 호출한 쪽이 띄운다) */
  onNotice: (message: string, tone: "info" | "error") => void;
  /** 모바일에서 미리보기 카드가 열려 있으면 이 높이(px, 하단 기준)로 올려 카드를 가리지 않게 한다 */
  liftPx?: number;
}

/** "내 위치" 버튼: 클릭할 때만 위치를 요청하고, 지도를 옮긴 뒤 파란 점을 찍는다. */
export default function MyLocationButton({ map, onNotice, liftPx }: Props) {
  const [busy, setBusy] = useState(false);
  const overlayRef = useRef<kakao.maps.CustomOverlay | null>(null);

  useEffect(
    () => () => {
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
    },
    [],
  );

  // 지도(map)가 생긴 뒤에만 렌더되므로 SSR 걱정 없이 바로 확인한다
  if (!navigator.geolocation) return null;

  const onSuccess = (pos: GeolocationPosition) => {
    setBusy(false);
    const { latitude: lat, longitude: lng } = pos.coords;
    const latlng = new kakao.maps.LatLng(lat, lng);
    // 너무 멀리 나가 있으면 주변이 보이도록 당긴다(이미 가까우면 그대로)
    if (map.getLevel() > LOCATE_LEVEL) map.setLevel(LOCATE_LEVEL);
    map.setCenter(latlng);

    const dot = document.createElement("div");
    dot.className = "pointer-events-none relative h-4 w-4";
    dot.innerHTML =
      '<span class="absolute -inset-2 animate-ping rounded-full bg-blue-500/40"></span>' +
      '<span class="absolute inset-0 rounded-full border-2 border-white bg-blue-600 shadow"></span>';
    overlayRef.current?.setMap(null);
    const overlay = new kakao.maps.CustomOverlay({ position: latlng, content: dot, zIndex: LOCATE_Z });
    overlay.setMap(map);
    overlayRef.current = overlay;
    if (!inArea(lat, lng)) onNotice("이 지역은 아직 데이터가 없어요", "info");
  };

  const onFail = (err: GeolocationPositionError) => {
    setBusy(false);
    onNotice(err.code === 1 ? "위치 권한을 허용해 주세요" : "현재 위치를 찾지 못했어요", "error");
  };

  const locate = () => {
    if (busy) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(onSuccess, onFail, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    });
  };

  return (
    <button
      type="button"
      aria-label="내 위치"
      onClick={locate}
      disabled={busy}
      className={`absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg hover:bg-gray-50 md:bottom-8 ${liftPx === undefined ? "bottom-14" : "bottom-[var(--lift)]"}`}
      style={liftPx === undefined ? undefined : ({ "--lift": `${liftPx}px` } as React.CSSProperties)}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <LocateFixed className="h-5 w-5" aria-hidden />}
    </button>
  );
}
