import { formatPrice } from "./format";
import type { CanceledHigh, RecordHigh } from "./types";

export const RSS_MAX_ITEMS = 100;

/** XML 텍스트용 이스케이프 */
export const xmlEscape = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

/** "2026-11-04" → KST 00:00 의 RFC 822 */
const pubDate = (iso: string): string => new Date(`${iso}T00:00:00+09:00`).toUTCString();

interface Item {
  date: string;
  title: string;
  description: string;
  link: string;
  guid: string;
}

/** 신고가·취소된 신고가를 날짜 내림차순 최대 100건의 RSS 2.0 피드로 만든다. */
export function buildRss(highs: RecordHigh[], canceled: CanceledHigh[], siteUrl: string, now: Date): string {
  const items: Item[] = [
    ...highs.map((h) => ({
      date: h.deal_date,
      title: `[신고가] ${h.apt_name} ${h.area_group}㎡ ${formatPrice(h.amount)}`,
      description: `${h.region_name} ${h.dong} · ${h.floor ?? "-"}층 · ${h.deal_date} 거래 · 이전 최고 ${formatPrice(h.prev_max)}`,
      link: `${siteUrl}/apartment/${h.apt_id}`,
      guid: `zipsise-high-${h.tx_id}`,
    })),
    ...canceled.map((c) => ({
      date: c.cancel_date,
      title: `[취소] ${c.apt_name} ${c.area_group}㎡ ${formatPrice(c.amount)} 신고가 거래 취소`,
      description: `${c.region_name} · ${c.deal_date} 거래 → ${c.cancel_date} 취소(${c.days_to_cancel}일 뒤)`,
      link: `${siteUrl}/canceled/${c.apt_id}/${c.tx_id}`,
      guid: `zipsise-cancel-${c.tx_id}`,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RSS_MAX_ITEMS);

  const body = items
    .map(
      (i) =>
        `    <item>
      <title>${xmlEscape(i.title)}</title>
      <link>${xmlEscape(i.link)}</link>
      <description>${xmlEscape(i.description)}</description>
      <guid isPermaLink="false">${xmlEscape(i.guid)}</guid>
      <pubDate>${pubDate(i.date)}</pubDate>
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>집시세 - 수도권 아파트 신고가·취소 소식</title>
    <link>${xmlEscape(siteUrl)}</link>
    <description>국토부 실거래가 기준 수도권 아파트 최근 신고가와 취소된 신고가</description>
    <language>ko</language>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
${body}
  </channel>
</rss>
`;
}
