import { fetchHighsRecent } from "./data";
import type { RecordHigh } from "./types";

/** 계약일 최신순, 같은 날은 상승률 큰 순 */
export const newestFirst = (a: RecordHigh, b: RecordHigh): number =>
  b.deal_date.localeCompare(a.deal_date) || b.jump_pct - a.jump_pct;

/** 지역(시군구 코드) — 동을 주면 그 동 — 의 최근 신고가, 최신순 최대 n건 */
export function recentHighsFor(items: RecordHigh[], lawdCd: string, dong?: string, n = 5): RecordHigh[] {
  return items
    .filter((i) => i.lawd_cd === lawdCd && (dong === undefined || i.dong === dong))
    .sort(newestFirst)
    .slice(0, n);
}

/** 상승률 내림차순 상위 n건 */
export function topByPct(items: RecordHigh[], n = 3): RecordHigh[] {
  return [...items].sort((a, b) => b.jump_pct - a.jump_pct).slice(0, n);
}

/** highs/recent.json 항목. 파일이 없거나(첫 배포 직후) 깨졌거나 요청이 실패하면 빈 배열 */
export async function fetchHighItems(init?: RequestInit): Promise<RecordHigh[]> {
  try {
    const file = await fetchHighsRecent(init);
    return Array.isArray(file?.items) ? file.items : [];
  } catch {
    return [];
  }
}
