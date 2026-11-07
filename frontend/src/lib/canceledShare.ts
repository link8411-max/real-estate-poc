import { analyzeCanceled } from "./canceled";
import { areaToPyeong, txGroup } from "./format";
import { exactLabel, SUPPLY_ENABLED, supplyText } from "./supply";
import type { AptTrade, SupplyLabel } from "./types";

const DAY_MS = 86_400_000;

export interface ShareTx {
  amount: number;
  /** 전용 평(반올림). 공급평 플래그가 꺼져 있을 때만 화면에 쓴다. */
  pyeong: number;
  /** 전용 ㎡(평형 묶음 grp) */
  m2: number;
  /** 공급평. 공급 정보가 없으면 null */
  supply: SupplyLabel | null;
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
  const m2 = txGroup(tx);
  const pyeong = areaToPyeong(m2);
  const supply = exactLabel(data.apartment.area_types, tx.area);
  const c = analyzeCanceled(data.transactions).canceled.find((x) => x.id === txId);
  if (!c) {
    return { amount: tx.amount, pyeong, m2, supply, dealDate: tx.deal_date, canceled: false, cancelIso: null, days: null, prevMax: null, isHigh: false, jump: null };
  }
  const days = Math.round((Date.parse(c.cancel_iso) - Date.parse(c.deal_date)) / DAY_MS);
  return {
    amount: c.amount,
    pyeong,
    m2,
    supply,
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

/** 공유 제목·OG용 짧은 면적. 플래그 off: "84㎡"(전용평을 공급평으로 오해하지 않게), on: "33평" / 공급 정보 없으면 "84㎡" */
export const shareArea = (tx: ShareTx): string =>
  SUPPLY_ENABLED && tx.supply ? supplyText(tx.supply) : `${tx.m2}㎡`;
