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

/** 저장된 단위. 없거나 깨진 값, 저장소 접근 불가면 기본값. */
function read(): AreaUnit {
  try {
    const v = localStorage.getItem(KEY);
    return v === "pyeong" || v === "m2" ? v : DEFAULT_AREA_UNIT;
  } catch {
    return DEFAULT_AREA_UNIT;
  }
}

const readServer = (): AreaUnit => DEFAULT_AREA_UNIT;

/** 면적 표시 단위(기본 평). 서버 스냅샷은 기본값이라 하이드레이션 후 저장값으로 바뀐다. */
export function useAreaUnit(): [AreaUnit, (u: AreaUnit) => void] {
  const unit = useSyncExternalStore(subscribe, read, readServer);
  const set = useCallback((u: AreaUnit) => {
    try {
      localStorage.setItem(KEY, u);
    } catch {
      // 저장 불가: 저장은 건너뛰지만 구독자에게는 알린다(읽기도 기본값이라 변화는 없다)
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [unit, set];
}
