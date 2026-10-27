import { areaGroup } from "./format";
import type { AptRent, AptTrade, Metrics, Transaction } from "./types";

/**
 * 시간 창(최근 3개월·마지막 거래 경과일) 지표는 렌더 시점에 계산한다.
 * 조용한 단지의 trade.json/rent.json 은 다시 내보내지지 않으므로, 내보낸 날 기준 값(pipeline/summary.py)은 낡는다.
 * 규칙은 pipeline/summary.py 와 같다: 평형 그룹 = 전용면적 정수부, 최근 = today 포함 90일 전부터.
 */
export const RECENT_DAYS = 90;
export const BARGAIN_MIN_RECENT = 3;

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

/** 한국 날짜 "YYYY-MM-DD". 서버(페이지)에서 불러 prop 으로 내려준다 — 클라이언트 렌더 중에 부르지 않는다. */
export const kstToday = (now: Date = new Date()): string => new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

/** dateISO 부터 today 까지의 일수 (둘 다 "YYYY-MM-DD") */
export const daysSince = (dateISO: string, today: string): number =>
  Math.round((Date.parse(today) - Date.parse(dateISO)) / DAY_MS);

const minusDays = (today: string, days: number): string => new Date(Date.parse(today) - days * DAY_MS).toISOString().slice(0, 10);

interface Dated {
  area: number;
  deal_date: string;
  cancel_date?: string | null;
}

/** 최근 days 일(정확히 days 일 전 포함) 취소 아닌 거래의 평균(반올림)과 건수. area 를 주면 그 평형 그룹만. */
export function recentWindow<T extends Dated, K extends keyof T>(
  items: readonly T[],
  { area, valueKey, days = RECENT_DAYS, today }: { area?: number | null; valueKey: K; days?: number; today: string },
): { avg: number | null; count: number } {
  const cutoff = minusDays(today, days);
  let sum = 0;
  let count = 0;
  for (const it of items) {
    if (it.cancel_date) continue;
    if (area != null && areaGroup(it.area) !== area) continue;
    if (it.deal_date < cutoff) continue;
    sum += Number(it[valueKey]);
    count += 1;
  }
  return { avg: count ? Math.round(sum / count) : null, count };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 최신순(날짜 내림차순, 같은 날이면 id 내림차순) — export_json 의 정렬과 같다 */
const newestFirst = (a: Transaction, b: Transaction) =>
  a.deal_date === b.deal_date ? b.id - a.id : a.deal_date < b.deal_date ? 1 : -1;

/** 최신 거래 평형 그룹 기준 배지 지표. pipeline/summary.py metrics() 와 같은 모양·규칙, 계산할 수 없는 값은 키 없음. */
export function liveMetrics(trade: AptTrade, rent: AptRent | null, today: string): Metrics {
  const live = trade.transactions.filter((t) => !t.cancel_date).sort(newestFirst);
  if (live.length === 0) return {};
  // 그룹별 최신 날짜가 가장 늦은 그룹, 같으면 작은 평형 (summary.py: 면적순 정렬 후 max)
  const latestDate = live[0].deal_date;
  const group = Math.min(...live.filter((t) => t.deal_date === latestDate).map((t) => areaGroup(t.area)));
  const deals = live.filter((t) => areaGroup(t.area) === group);
  const latest = deals[0];

  const out: Metrics = {};
  const recent = recentWindow(deals, { valueKey: "amount", today });
  if (recent.avg && recent.count >= BARGAIN_MIN_RECENT) {
    const bargain = latest.amount - recent.avg;
    out.bargain_amount = bargain;
    out.bargain_percent = round1((bargain / recent.avg) * 100);
  }
  const peak = Math.max(...deals.map((t) => t.amount));
  if (peak) {
    out.recovery_rate = round1((latest.amount / peak) * 100);
    out.peak_date = deals.find((t) => t.amount === peak)!.deal_date; // 동률이면 가장 최근
  }
  out.days_since_last_tx = daysSince(latest.deal_date, today);

  const jeonse = (rent?.rents ?? []).filter((r) => r.monthly_rent === 0);
  const recentJeonse = recentWindow(jeonse, { area: group, valueKey: "deposit", today });
  if (recentJeonse.avg != null && recent.avg) out.jeonse_ratio = round1((recentJeonse.avg / recent.avg) * 100);
  return out;
}
