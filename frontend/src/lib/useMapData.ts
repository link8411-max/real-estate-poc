"use client";

import { useEffect, useState } from "react";
import { exceedsMapSpan, isDegenerateBounds, type MapBounds, type MapMode } from "./mapFilters";

export interface MapApartment {
  id: number;
  name: string;
  lat: number;
  lng: number;
  latest_trade_amount: number | null;
  latest_jeonse_deposit: number | null;
  trade_count: number | null;
  build_year: number | null;
  latest_trade_area: number | null;
}

export interface MapRegion {
  code: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  apartment_count: number | null;
  avg_amount: number | null;
}

export type MapData = { type: "apartments"; items: MapApartment[] } | { type: "regions"; items: MapRegion[] };

export interface MapDataState {
  data: MapData | null;
  loading: boolean;
  error: string | null;
  /** 단지 레벨인데 범위가 너무 넓어 호출하지 않았다: "지도를 더 확대해 주세요" */
  tooWide: boolean;
}

const ERROR_MESSAGE = "지도 데이터를 불러오지 못했습니다.";

interface Settled {
  key: string;
  data: MapData | null;
  error: string | null;
}

/**
 * 지도 범위의 단지/지역을 /api/v1/map에서 가져온다. 쿼리가 바뀌면 이전 요청은 abort한다.
 * 새 응답이 올 때까지 이전 data를 유지해 마커가 깜빡이지 않게 한다.
 */
export function useMapData(
  bounds: MapBounds | null,
  level: number,
  mode: MapMode,
  filters: Record<string, string>,
): MapDataState {
  const usable = bounds !== null && !isDegenerateBounds(bounds);
  const tooWide = usable && exceedsMapSpan(bounds, level);
  const key =
    usable && !tooWide
      ? new URLSearchParams({
          minLat: String(bounds.minLat),
          minLng: String(bounds.minLng),
          maxLat: String(bounds.maxLat),
          maxLng: String(bounds.maxLng),
          level: String(level),
          mode,
          ...filters,
        }).toString()
      : null;

  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (key === null) return;
    const ctrl = new AbortController();
    fetch(`/api/v1/map?${key}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as MapData;
        if (!ctrl.signal.aborted) setSettled({ key, data, error: null });
      })
      .catch(() => {
        if (ctrl.signal.aborted) return; // 다음 요청이 대신한다
        setSettled((prev) => ({ key, data: prev?.data ?? null, error: ERROR_MESSAGE }));
      });
    return () => ctrl.abort();
  }, [key]);

  if (key === null) return { data: tooWide ? null : (settled?.data ?? null), loading: false, error: null, tooWide };
  const current = settled?.key === key;
  return {
    data: settled?.data ?? null,
    loading: !current,
    error: current ? settled.error : null,
    tooWide: false,
  };
}
