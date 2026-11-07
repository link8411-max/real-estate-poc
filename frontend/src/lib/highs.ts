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

/** /highs 첫 문단(본문 문장). 0건인 도시는 나열에서 뺀다. */
export function highsIntro(items: RecordHigh[]): string {
  if (items.length === 0) return "최근 30일 수도권 아파트 신고가가 없습니다.";
  const byCity = ["서울", "경기", "인천"]
    .map((c) => [c, items.filter((i) => i.city === c).length] as const)
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${c} ${n.toLocaleString("en-US")}건`);
  const top = topByPct(items, 1)[0];
  return `최근 30일 수도권 아파트 신고가는 ${items.length.toLocaleString("en-US")}건으로 ${byCity.join(", ")}입니다. 신고가는 같은 단지·같은 평형의 이전 최고가를 넘은 계약이며, 가장 큰 상승은 ${top.apt_name} +${top.jump_pct}%입니다.`;
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
