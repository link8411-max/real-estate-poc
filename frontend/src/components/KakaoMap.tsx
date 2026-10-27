"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { isDegenerateBounds, type MapBounds } from "@/lib/mapFilters";

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

/** 숨은 탭·레이아웃 확정 전에는 컨테이너가 0px일 수 있다. 이때 만든 지도는 범위가 한 점이 된다. */
const hasSize = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/** 카카오맵. SDK는 이 컴포넌트가 있을 때(/map)만 불러온다. */
export default function KakaoMap({ center, level, onIdle, onReady }: Props) {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  /** 컨테이너 크기를 기다리는 관찰자(지도 생성 전) */
  const waitRef = useRef<ResizeObserver | null>(null);
  const [failed, setFailed] = useState(false);

  const callbacks = useRef({ onIdle, onReady });
  useEffect(() => {
    callbacks.current = { onIdle, onReady };
  });
  const initial = useRef({ center, level });

  /**
   * idle·크기 변화·탭 복귀 처리를 붙인다. 언마운트(또는 StrictMode 재마운트) 때 떼기 위해 해제 함수를 남긴다.
   * 크기 변화나 탭 복귀 뒤에는 relayout하지 않으면 새로 드러난 영역에 타일이 그려지지 않는다(회색).
   */
  const attach = useCallback((map: kakao.maps.Map) => {
    detachRef.current?.();
    const container = containerRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** 현재 범위를 바로 알린다. 범위가 한 점이면(컨테이너 0px) 보내지 않는다. */
    const emitNow = () => {
      clearTimeout(timer);
      const b = map.getBounds();
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      const bounds = { minLat: sw.getLat(), minLng: sw.getLng(), maxLat: ne.getLat(), maxLng: ne.getLng() };
      if (isDegenerateBounds(bounds)) return;
      const c = map.getCenter();
      callbacks.current.onIdle(bounds, map.getLevel(), { lat: c.getLat(), lng: c.getLng() });
    };
    const emit = () => {
      clearTimeout(timer);
      timer = setTimeout(emitNow, IDLE_DEBOUNCE_MS);
    };
    const relayoutAndEmit = () => {
      if (container && !hasSize(container)) return;
      const center = map.getCenter();
      map.relayout();
      map.setCenter(center);
      emitNow();
    };
    kakao.maps.event.addListener(map, "idle", emit);
    emitNow();

    const observer = container && typeof ResizeObserver !== "undefined" ? new ResizeObserver(relayoutAndEmit) : null;
    if (container) observer?.observe(container);
    const onVisible = () => {
      if (document.visibilityState === "visible") relayoutAndEmit();
    };
    document.addEventListener("visibilitychange", onVisible);
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
      document.removeEventListener("visibilitychange", onVisible);
      container?.removeEventListener("scroll", unscroll);
      kakao.maps.event.removeListener(map, "idle", emit);
      detachRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) attach(mapRef.current);
    return () => {
      waitRef.current?.disconnect();
      waitRef.current = null;
      detachRef.current?.();
    };
  }, [attach]);

  const create = useCallback(() => {
    const container = containerRef.current;
    if (mapRef.current || !container) return;
    const { center: c, level: l } = initial.current;
    const map = new kakao.maps.Map(container, { center: new kakao.maps.LatLng(c.lat, c.lng), level: l });
    mapRef.current = map;
    map.relayout();
    attach(map);
    callbacks.current.onReady?.(map);
  }, [attach]);

  const init = useCallback(() => {
    const sdk = window.kakao;
    if (!sdk?.maps) {
      setFailed(true);
      return;
    }
    sdk.maps.load(() => {
      const container = containerRef.current;
      if (mapRef.current || !container) return;
      if (hasSize(container) || typeof ResizeObserver === "undefined") {
        create();
        return;
      }
      // 컨테이너가 아직 0px: 크기가 생길 때까지 기다렸다가 만든다
      waitRef.current?.disconnect();
      const wait = new ResizeObserver(() => {
        if (!hasSize(container)) return;
        wait.disconnect();
        waitRef.current = null;
        create();
      });
      waitRef.current = wait;
      wait.observe(container);
    });
  }, [create]);

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
