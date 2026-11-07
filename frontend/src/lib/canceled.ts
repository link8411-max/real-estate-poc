import { txGroup } from "./format";
import type { CanceledHigh, Transaction } from "./types";

const DAY_MS = 86_400_000;

/** "25.07.28" → "2025-07-28". ISO 는 그대로. */
export function toIsoDate(d: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(d);
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : d;
}

export type CanceledTx = Transaction & { cancel_iso: string; prev_max: number | null; is_high: boolean };

/**
 * 취소된 거래 분석. 신고가 정의(파이프라인과 동일): 같은 단지·같은 평형 묶음에서
 * deal_date 가 더 이른 "취소되지 않은" 거래의 최고가보다 amount 가 엄격히 클 때.
 * aboveMaxByArea: 평형 묶음별, 취소 안 된 전체 최고가보다 높은 취소 금액 중 최대값.
 */
export function analyzeCanceled(txs: Transaction[]): { canceled: CanceledTx[]; aboveMaxByArea: Map<number, number> } {
  const live = new Map<number, Transaction[]>();
  for (const t of txs) {
    if (t.cancel_date != null) continue;
    const g = txGroup(t);
    const arr = live.get(g);
    if (arr) arr.push(t);
    else live.set(g, [t]);
  }

  const canceled: CanceledTx[] = [];
  const aboveMaxByArea = new Map<number, number>();
  for (const t of txs) {
    if (t.cancel_date == null) continue;
    const g = txGroup(t);
    const peers = live.get(g) ?? [];
    let prev: number | null = null;
    let liveMax: number | null = null;
    for (const p of peers) {
      if (liveMax === null || p.amount > liveMax) liveMax = p.amount;
      if (p.deal_date < t.deal_date && (prev === null || p.amount > prev)) prev = p.amount;
    }
    canceled.push({ ...t, cancel_iso: toIsoDate(t.cancel_date), prev_max: prev, is_high: prev !== null && t.amount > prev });
    if (liveMax !== null && t.amount > liveMax && t.amount > (aboveMaxByArea.get(g) ?? -Infinity)) {
      aboveMaxByArea.set(g, t.amount);
    }
  }
  canceled.sort((a, b) => (a.cancel_iso < b.cancel_iso ? 1 : a.cancel_iso > b.cancel_iso ? -1 : 0));
  return { canceled, aboveMaxByArea };
}

/** sinceIso(포함) 이후 해제된 건수와 그중 신고가 건수 */
export function countSince(c: CanceledTx[], sinceIso: string): { total: number; highs: number } {
  let total = 0;
  let highs = 0;
  for (const t of c) {
    if (t.cancel_iso >= sinceIso) {
      total++;
      if (t.is_high) highs++;
    }
  }
  return { total, highs };
}

const minusDays = (todayIso: string, days: number): string =>
  new Date(Date.parse(todayIso) - days * DAY_MS).toISOString().slice(0, 10);

const withinDays = (items: CanceledHigh[], todayIso: string, n: number): CanceledHigh[] => {
  const since = minusDays(todayIso, n);
  return items.filter((i) => toIsoDate(i.cancel_date) >= since);
};

/** 7일 건수 ≥3 이면 7일, 아니면 30일. 창은 cancel_date >= todayIso − N일(오늘 포함). */
export function pickHeadline(items: CanceledHigh[], todayIso: string): { days: 7 | 30; items: CanceledHigh[] } {
  const w7 = withinDays(items, todayIso, 7);
  return w7.length >= 3 ? { days: 7, items: w7 } : { days: 30, items: withinDays(items, todayIso, 30) };
}

/** /canceled 첫 문단(본문 문장). pickHeadline 이 고른 기간 기준. */
export function canceledIntro(items: CanceledHigh[], todayIso: string): string {
  const head = pickHeadline(items, todayIso);
  if (head.items.length === 0) return "최근 30일 수도권 아파트 신고가 중 취소된 거래가 없습니다.";
  const n = head.items.length.toLocaleString("en-US");
  const w30 = head.days === 7 ? `(최근 30일 ${withinDays(items, todayIso, 30).length.toLocaleString("en-US")}건)` : "";
  const byCity = ["서울", "경기", "인천"]
    .map((c) => [c, head.items.filter((i) => i.city === c).length] as const)
    .filter(([, k]) => k > 0)
    .map(([c, k]) => `${c} ${k.toLocaleString("en-US")}건`);
  return `최근 ${head.days}일 동안 수도권 아파트 신고가 ${n}건이 신고 후 취소됐습니다${w30}. ${byCity.join(", ")}이며, 거래 해제는 대출 불발·계약 합의 해지 등 여러 이유로 생깁니다.`;
}

/** jump 내림차순 상위 n건 */
export function topJumps(items: CanceledHigh[], n = 3): CanceledHigh[] {
  return [...items].sort((a, b) => b.jump - a.jump).slice(0, n);
}
