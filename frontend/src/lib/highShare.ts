import { formatManwon, txGroup } from "./format";
import { kstToday } from "./metrics";
import { exactLabel, SUPPLY_ENABLED, supplyText } from "./supply";
import type { AptTrade, SupplyLabel } from "./types";

/**
 * 신고가 공유 버튼 공개 플래그. 취소 Backfill 완료·판정 보강 확인 뒤 사람이 켠다.
 * 공유 페이지·OG 카드는 플래그와 상관없이 열린다(noindex).
 */
export let SHARE_HIGHS_ENABLED: boolean = process.env.NEXT_PUBLIC_SHARE_HIGHS === "1";

/** 테스트에서 플래그를 바꾼다. */
export function setShareHighsEnabledForTest(v: boolean): void {
  SHARE_HIGHS_ENABLED = v;
}

/** 공유 대상 창(일). 파이프라인 pipeline/share.py SHARE_DAYS 와 같다. */
export const SHARE_DAYS = 30;
const DAY_MS = 86_400_000;

export interface HighShareTx {
  amount: number;
  /** 평형 묶음(grp) ㎡ */
  m2: number;
  supply: SupplyLabel | null;
  floor: number | null;
  dealDate: string;
  direct: boolean;
  badge: "high" | "up" | null;
  /** 신고가면 이전 최고가, 상승이면 직전 거래 */
  base: number | null;
  diff: number | null;
  canceled: boolean;
  shareable: boolean;
  /** 같은 평형 묶음·정상 거래, 이 거래 계약일 1년 전부터 (계약일 오름차순, 그래프용) */
  series: Array<{ date: string; amount: number }>;
}

const minusDays = (iso: string, days: number): string => new Date(Date.parse(iso) - days * DAY_MS).toISOString().slice(0, 10);

/**
 * 거래 id 로 신고가 공유 카드 값을 만든다. 배지·비교값은 파이프라인(share)이 계산한 값을 그대로 쓴다.
 * 취소되면 배지·비교값을 숨기고, 계약일이 오늘(KST) 기준 30일을 넘으면 공유 불가(옛 링크는 열림).
 */
export function highShareTx(data: AptTrade, txId: number, today: Date = new Date()): HighShareTx | null {
  const tx = data.transactions.find((t) => t.id === txId);
  if (!tx) return null;
  const m2 = txGroup(tx);
  const canceled = tx.cancel_date != null;
  const share = canceled ? undefined : tx.share;
  const fresh = tx.deal_date >= minusDays(kstToday(today), SHARE_DAYS);
  const from = minusDays(tx.deal_date, 365);
  const series = data.transactions
    .filter((t) => t.cancel_date == null && txGroup(t) === m2 && t.deal_date >= from)
    .sort((a, b) => (a.deal_date === b.deal_date ? a.id - b.id : a.deal_date < b.deal_date ? -1 : 1))
    .map((t) => ({ date: t.deal_date, amount: t.amount }));
  return {
    amount: tx.amount,
    m2,
    supply: exactLabel(data.apartment.area_types, tx.area),
    floor: tx.floor,
    dealDate: tx.deal_date,
    direct: tx.direct === true,
    badge: share?.badge ?? null,
    base: share?.base ?? null,
    diff: share?.diff ?? null,
    canceled,
    shareable: !!share?.shareable && fresh,
    series,
  };
}

/** 카드·제목용 금액: 10000 → "1억", 7000 → "7,000만", 125000 → "12억 5,000만" */
export const shareAmount = (n: number): string => `${formatManwon(n)}${n >= 10000 && n % 10000 === 0 ? "" : "만"}`;

/** 공유 제목·OG용 짧은 면적. 공급평 플래그 on 이고 정보 있으면 "33평", 아니면 "84㎡"(전용평 금지). */
export const highShareArea = (tx: HighShareTx): string => (SUPPLY_ENABLED && tx.supply ? supplyText(tx.supply) : `${tx.m2}㎡`);

export const BADGE_TEXT = { high: "신고가", up: "상승" } as const;

/** "래미안 33평 12억 5,000만 신고가" / "… 신고 후 취소" / 배지 없으면 접미사 없음 */
export function highShareTitle(name: string, tx: HighShareTx): string {
  const suffix = tx.canceled ? " 신고 후 취소" : tx.badge ? ` ${BADGE_TEXT[tx.badge]}` : "";
  return `${name} ${highShareArea(tx)} ${shareAmount(tx.amount)}${suffix}`;
}

/** "이전 최고보다 +1억" / "직전 거래보다 +3,000만". 배지 없거나 취소면 null */
export function highShareDiffText(tx: HighShareTx): string | null {
  if (tx.canceled || !tx.badge || tx.diff == null) return null;
  return `${tx.badge === "high" ? "이전 최고보다" : "직전 거래보다"} +${shareAmount(tx.diff)}`;
}

/** 카드 하단 띠: "국토교통부 실거래가 · 계약 2026.11.01 · 신고 기준 · zipsise.com" */
export const highShareFooter = (tx: HighShareTx): string =>
  `국토교통부 실거래가 · 계약 ${tx.dealDate.replaceAll("-", ".")} · 신고 기준 · zipsise.com`;
