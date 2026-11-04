"use client";

import { useEffect, useState } from "react";
import { loadZonesOnce } from "./redevelopment";
import type { Zone } from "./types";

export interface ZonesState {
  zones: Zone[] | null;
  loading: boolean;
  error: boolean;
}

/**
 * 지도의 정비사업 레이어용 구역 목록. 켜졌을 때만(enabled) 한 번 받아 오고(모듈 캐시), 이후엔 다시 받지 않는다.
 * 파일이 없으면(R2에 아직 없음) 빈 목록 — 오류가 아니다. 실패하면 error, 다시 켜면 재시도한다.
 */
export function useZones(enabled: boolean): ZonesState {
  const [state, setState] = useState<{ zones: Zone[] | null; failed: boolean }>({ zones: null, failed: false });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadZonesOnce()
      .then((zones) => alive && setState({ zones, failed: false }))
      .catch(() => alive && setState((p) => ({ zones: p.zones, failed: true })));
    return () => {
      alive = false;
    };
  }, [enabled]);

  if (!enabled) return { zones: null, loading: false, error: false };
  return { zones: state.zones, loading: state.zones === null && !state.failed, error: state.zones === null && state.failed };
}
