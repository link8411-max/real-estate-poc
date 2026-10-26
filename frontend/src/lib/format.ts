/** 만원 단위 금액 → "12억 5,000" */
export function formatManwon(n: number): string {
  if (n < 0) return "-" + formatManwon(-n);
  if (n >= 10000) {
    const eok = Math.floor(n / 10000);
    const rest = n % 10000;
    return `${eok}억` + (rest > 0 ? ` ${rest.toLocaleString("en-US")}` : "");
  }
  return n.toLocaleString("en-US");
}

export const areaToPyeong = (m2: number): number => Math.round(m2 / 3.3058);

/** "2026-10-06" → "26.10.06" */
export const formatDeal = (d: string): string => d.slice(2).replaceAll("-", ".");

/** 84 → "84㎡ (25평)" (전용면적 기준 평) */
export const formatArea = (m2: number): string => `${Math.round(m2)}㎡ (${areaToPyeong(m2)}평)`;

/** 문장용: 245000 → "24억 5,000만원", 100000 → "10억원" */
export const formatPrice = (n: number): string =>
  `${formatManwon(n)}${n >= 10000 && n % 10000 === 0 ? "원" : "만원"}`;
