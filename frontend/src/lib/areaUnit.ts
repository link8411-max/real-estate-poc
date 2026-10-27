import { useCallback, useSyncExternalStore } from "react";

export type AreaUnit = "pyeong" | "m2";
export const DEFAULT_AREA_UNIT: AreaUnit = "pyeong";

const KEY = "areaUnit";
const EVENT = "area-unit-change";

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

const isUnit = (v: unknown): v is AreaUnit => v === "pyeong" || v === "m2";

/** 저장소에 쓰지 못할 때(개인 모드 등)를 위한 이번 세션 값. set이 먼저 채운다. */
let memory: AreaUnit | null = null;

/** 저장된 단위. 저장값이 유효하면 그것, 아니면 메모리 값, 그것도 없으면 기본값. */
function read(): AreaUnit {
  try {
    const v = localStorage.getItem(KEY);
    if (isUnit(v)) return v;
  } catch {
    // 저장소 접근 불가
  }
  return memory ?? DEFAULT_AREA_UNIT;
}

const readServer = (): AreaUnit => DEFAULT_AREA_UNIT;

/** 면적 표시 단위(기본 평). 서버 스냅샷은 기본값이라 하이드레이션 후 저장값으로 바뀐다. */
export function useAreaUnit(): [AreaUnit, (u: AreaUnit) => void] {
  const unit = useSyncExternalStore(subscribe, read, readServer);
  const set = useCallback((u: AreaUnit) => {
    try {
      localStorage.setItem(KEY, u);
      memory = null;
    } catch {
      memory = u; // 저장 불가: 이번 세션에서만 메모리 값으로 반영된다
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [unit, set];
}
