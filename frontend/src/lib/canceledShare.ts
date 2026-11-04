import { analyzeCanceled } from "./canceled";
import { areaGroup, areaToPyeong } from "./format";
import type { AptTrade } from "./types";

const DAY_MS = 86_400_000;

export interface ShareTx {
  amount: number;
  pyeong: number;
  dealDate: string;
  canceled: boolean;
  cancelIso: string | null;
  days: number | null;
  prevMax: number | null;
  isHigh: boolean;
  jump: number | null;
}

/** 거래 id 로 공유 카드에 필요한 값을 만든다. 거래가 없으면 null. */
export function shareTx(data: AptTrade, txId: number): ShareTx | null {
  const tx = data.transactions.find((t) => t.id === txId);
  if (!tx) return null;
  const pyeong = areaToPyeong(areaGroup(tx.area));
  const c = analyzeCanceled(data.transactions).canceled.find((x) => x.id === txId);
  if (!c) {
    return { amount: tx.amount, pyeong, dealDate: tx.deal_date, canceled: false, cancelIso: null, days: null, prevMax: null, isHigh: false, jump: null };
  }
  const days = Math.round((Date.parse(c.cancel_iso) - Date.parse(c.deal_date)) / DAY_MS);
  return {
    amount: c.amount,
    pyeong,
    dealDate: c.deal_date,
    canceled: true,
    cancelIso: c.cancel_iso,
    days,
    prevMax: c.prev_max,
    isHigh: c.is_high,
    jump: c.is_high && c.prev_max != null ? c.amount - c.prev_max : null,
  };
}

export const parseId = (s: string): number | null => {
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
