import { describe, expect, test } from "vitest";
import { buildRss } from "@/lib/rss";
import type { CanceledHigh, RecordHigh } from "@/lib/types";

const SITE = "https://zipsise.com";
const NOW = new Date("2026-11-05T00:00:00Z");

const high = (tx_id: number, deal_date: string, over: Partial<RecordHigh> = {}): RecordHigh => ({
  tx_id, apt_id: 10 + tx_id, apt_name: "래미안", region_name: "서울 강남구", city: "서울", lawd_cd: "11680", dong: "역삼동",
  area: 84.9, area_group: 84, floor: 12, amount: 84000, prev_max: 80000, jump: 4000, jump_pct: 5, deal_date, ...over,
});
const cancel = (tx_id: number, cancel_date: string, over: Partial<CanceledHigh> = {}): CanceledHigh => ({
  tx_id, apt_id: 20 + tx_id, apt_name: "자이", region_name: "경기 성남시", city: "경기", area: 59.9, area_group: 59, floor: 3,
  amount: 100000, prev_max: 95000, jump: 5000, deal_date: "2026-10-01", cancel_date, days_to_cancel: 30, ...over,
});

const titles = (xml: string) => [...xml.matchAll(/<item>\s*<title>([^<]*)<\/title>/g)].map((m) => m[1]);

describe("buildRss", () => {
  test("날짜 내림차순으로 합친다", () => {
    const xml = buildRss([high(1, "2026-11-01"), high(2, "2026-11-03")], [cancel(3, "2026-11-02")], SITE, NOW);
    expect(titles(xml).map((t) => t.split(' ')[0])).toEqual(["[신고가]", "[취소]", "[신고가]"]);
    expect(titles(xml)[0]).toBe("[신고가] 래미안 84㎡ 8억 4,000만원");
  });

  test("최대 100개", () => {
    const highs = Array.from({ length: 150 }, (_, i) => high(i + 1, "2026-11-01"));
    expect(titles(buildRss(highs, [], SITE, NOW))).toHaveLength(100);
  });

  test("XML 이스케이프", () => {
    const xml = buildRss([high(1, "2026-11-01", { apt_name: `A&B <"C"> 'D'` })], [], SITE, NOW);
    expect(xml).toContain("A&amp;B &lt;&quot;C&quot;&gt; &apos;D&apos;");
    expect(xml).not.toContain("A&B");
  });

  test("링크·guid·pubDate 형식", () => {
    const xml = buildRss([high(1, "2026-11-01")], [cancel(3, "2026-11-02")], SITE, NOW);
    expect(xml).toContain("<link>https://zipsise.com/apartment/11</link>");
    expect(xml).toContain("<link>https://zipsise.com/canceled/23/3</link>");
    expect(xml).toContain('<guid isPermaLink="false">zipsise-high-1</guid>');
    expect(xml).toContain('<guid isPermaLink="false">zipsise-cancel-3</guid>');
    expect(xml).toContain("<pubDate>Sat, 31 Oct 2026 15:00:00 GMT</pubDate>");
  });

  test("빈 데이터면 항목 없는 정상 피드", () => {
    const xml = buildRss([], [], SITE, NOW);
    expect(xml).toContain("<channel>");
    expect(xml).toContain("<language>ko</language>");
    expect(xml).not.toContain("<item>");
  });
});
