export interface MonthPoint {
  month: string; // "YYYY-MM"
  avg: number;
  count: number;
}

type Item = { area: number; deal_date: string; cancel_date?: string | null; amount?: number; deposit?: number };

/** 월별 평균가·건수. 취소 거래 제외, area는 반올림 면적(평형 그룹)과 비교, 월 오름차순. */
export function monthlyHistory(
  items: Item[],
  { area, valueKey }: { area?: number | null; valueKey: "amount" | "deposit" },
): MonthPoint[] {
  const acc = new Map<string, { sum: number; count: number }>();
  for (const it of items) {
    if (it.cancel_date) continue;
    if (area != null && Math.round(it.area) !== area) continue;
    const value = it[valueKey];
    if (value == null) continue;
    const month = it.deal_date.slice(0, 7);
    const cur = acc.get(month) ?? { sum: 0, count: 0 };
    cur.sum += value;
    cur.count += 1;
    acc.set(month, cur);
  }
  return [...acc.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, { sum, count }]) => ({ month, avg: Math.round(sum / count), count }));
}
