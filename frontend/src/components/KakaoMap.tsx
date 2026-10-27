"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapBounds } from "@/lib/mapFilters";

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface Props {
  /** 최초 중심·레벨. 지도는 한 번만 만들고 이후 변경은 반영하지 않는다. */
  center: LatLngLiteral;
  level: number;
  /** 이동·줌이 끝나면(idle) 300ms 디바운스 후 호출 */
  onIdle: (bounds: MapBounds, level: number, center: LatLngLiteral) => void;
  /** 지도 인스턴스 전달(지역 클릭 시 setLevel/setCenter 등에 쓴다) */
  onReady?: (map: kakao.maps.Map) => void;
}

const IDLE_DEBOUNCE_MS = 300;

/** 카카오맵. SDK는 이 컴포넌트가 있을 때(/map)만 불러온다. */
export default function KakaoMap({ center, level, onIdle, onReady }: Props) {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);

  const callbacks = useRef({ onIdle, onReady });
  useEffect(() => {
    callbacks.current = { onIdle, onReady };
  });
  const initial = useRef({ center, level });

  /**
   * idle 리스너와 컨테이너 ResizeObserver를 붙인다. 언마운트(또는 StrictMode 재마운트) 때 떼기 위해 해제 함수를 남긴다.
   * 컨테이너 크기가 바뀌면 relayout하지 않을 경우 새로 드러난 영역에 타일이 그려지지 않는다(회색).
   */
  const attach = useCallback((map: kakao.maps.Map) => {
    detachRef.current?.();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const emit = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const b = map.getBounds();
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        const c = map.getCenter();
        callbacks.current.onIdle(
          { minLat: sw.getLat(), minLng: sw.getLng(), maxLat: ne.getLat(), maxLng: ne.getLng() },
          map.getLevel(),
          { lat: c.getLat(), lng: c.getLng() },
        );
      }, IDLE_DEBOUNCE_MS);
    };
    kakao.maps.event.addListener(map, "idle", emit);
    emit();
    const container = containerRef.current;
    const observer =
      container && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            const center = map.getCenter();
            map.relayout();
            map.setCenter(center);
          })
        : null;
    if (container) observer?.observe(container);
    // 오버레이 버튼이 클릭으로 포커스되면 브라우저가 overflow:hidden 컨테이너를 스크롤해 버린다.
    // 카카오맵은 이 스크롤을 모르고 타일을 계산해 일부가 회색으로 남으므로 항상 0으로 되돌린다.
    const unscroll = () => {
      if (container && (container.scrollTop || container.scrollLeft)) {
        container.scrollTop = 0;
        container.scrollLeft = 0;
      }
    };
    container?.addEventListener("scroll", unscroll);
    detachRef.current = () => {
      clearTimeout(timer);
      observer?.disconnect();
      container?.removeEventListener("scroll", unscroll);
      kakao.maps.event.removeListener(map, "idle", emit);
      detachRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) attach(mapRef.current);
    return () => detachRef.current?.();
  }, [attach]);

  const init = useCallback(() => {
    const sdk = window.kakao;
    if (!sdk?.maps) {
      setFailed(true);
      return;
    }
    sdk.maps.load(() => {
      if (mapRef.current || !containerRef.current) return;
      const { center: c, level: l } = initial.current;
      const map = new sdk.maps.Map(containerRef.current, { center: new sdk.maps.LatLng(c.lat, c.lng), level: l });
      mapRef.current = map;
      map.relayout();
      attach(map);
      callbacks.current.onReady?.(map);
    });
  }, [attach]);

  if (!appKey || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 px-6 text-center text-sm text-gray-600">
        {appKey ? "지도를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." : "지도 키가 설정되지 않았습니다."}
      </div>
    );
  }

  return (
    <>
      <Script
        src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`}
        strategy="afterInteractive"
        onReady={init}
        onError={() => setFailed(true)}
      />
      <div ref={containerRef} data-testid="kakao-map" className="h-full w-full bg-gray-100" />
    </>
  );
}
