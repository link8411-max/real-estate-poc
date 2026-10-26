const KEY = "compare_ids";
export const MAX_COMPARE = 2;

function write(ids: number[]): number[] {
  localStorage.setItem(KEY, JSON.stringify(ids));
  return ids;
}

/** 비교 목록(최대 2개, 오래된 순). SSR이나 깨진 값이면 빈 배열. */
export function getCompareIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is number => Number.isInteger(v)).slice(-MAX_COMPARE);
  } catch {
    return [];
  }
}

/** 있으면 빼고, 없으면 넣는다. 2개를 넘으면 가장 오래된 것을 뺀다. */
export function toggleCompare(id: number): number[] {
  const ids = getCompareIds();
  if (ids.includes(id)) return write(ids.filter((v) => v !== id));
  return write([...ids, id].slice(-MAX_COMPARE));
}

export function clearCompare(): void {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}
