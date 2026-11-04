import { describe, expect, test } from "vitest";
import {
  aptCrumbs,
  aptDescription,
  aptJsonLd,
  aptTitle,
  breadcrumbJsonLd,
  dongCrumbs,
  dongDescription,
  dongFromParam,
  dongHref,
  dongTitle,
  jsonLdHtml,
  regionDescription,
  regionTitle,
  shortPrice,
  SITE_URL,
} from "../seo";
import type { Apartment, AreaStat, Transaction } from "../types";

const apt: Apartment = {
  id: 764,
  name: "역삼래미안",
  dong: "역삼동",
  lawd_cd: "11680",
  region_name: "서울 강남구",
  city: "서울",
  jibun: "757",
  build_year: 2005,
  apt_seq: "11680-3621",
  lat: 37.4975,
  lng: 127.05,
};

const tx = (amount: number, deal_date: string, area = 84.9): Transaction => ({
  id: 1,
  amount,
  area,
  floor: 5,
  deal_date,
  cancel_date: null,
});

const stat = (area: number, count: number, latest_amount: number, latest_date: string): AreaStat => ({
  area,
  count,
  max_amount: latest_amount,
  min_amount: latest_amount,
  avg_amount: latest_amount,
  latest_amount,
  latest_date,
  recent_avg: null,
  recent_count: 0,
  peak_date: latest_date,
});

describe("shortPrice", () => {
  test("억 단위는 소수 한 자리까지, 0은 생략", () => {
    expect(shortPrice(350000)).toBe("35억");
    expect(shortPrice(285000)).toBe("28.5억");
    expect(shortPrice(281234)).toBe("28.1억");
    expect(shortPrice(10000)).toBe("1억");
  });
  test("1억 미만은 만", () => {
    expect(shortPrice(8500)).toBe("8,500만");
  });
});

describe("aptTitle", () => {
  test("최근 거래가 있으면 가격·연월까지", () => {
    expect(aptTitle(apt, tx(350000, "2025-10-30"))).toBe("역삼래미안 실거래가 | 서울 강남구 역삼동 · 최근 35억(25.10)");
  });
  test("최근 거래가 없으면 뒷부분 생략", () => {
    expect(aptTitle(apt)).toBe("역삼래미안 실거래가 | 서울 강남구 역삼동");
  });
  test("60자를 넘으면 동을 먼저 뺀다", () => {
    const name = "가".repeat(30);
    const t = aptTitle({ ...apt, name }, tx(350000, "2025-10-30"));
    expect(t).toBe(`${name} 실거래가 | 서울 강남구 · 최근 35억(25.10)`);
    expect(t.length).toBeLessThanOrEqual(60);
  });
  test("그래도 넘으면 가격 부분을 뺀다", () => {
    const name = "가".repeat(38);
    const t = aptTitle({ ...apt, name }, tx(350000, "2025-10-30"));
    expect(t).toBe(`${name} 실거래가 | 서울 강남구`);
    expect(t.length).toBeLessThanOrEqual(60);
  });
  test("이름만으로 넘으면 지역도 뺀다", () => {
    const name = "가".repeat(60);
    expect(aptTitle({ ...apt, name }, tx(350000, "2025-10-30"))).toBe(`${name} 실거래가`);
  });
});

describe("aptDescription", () => {
  const stats = [
    stat(59, 699, 280000, "2025-11-08"),
    stat(80, 229, 350000, "2025-10-30"),
    stat(84, 500, 330000, "2025-09-01"),
    stat(114, 10, 450000, "2024-01-01"),
  ];
  test("거래 많은 평형 3개를 면적순으로 요약", () => {
    const d = aptDescription(apt, stats);
    expect(d).toContain("서울 강남구 역삼동 역삼래미안");
    expect(d).toContain("2005년 준공");
    expect(d).toContain("59㎡ 28억(25.11), 80㎡ 35억(25.10), 84㎡ 33억(25.09)");
    expect(d).not.toContain("114㎡");
    expect(d.length).toBeLessThanOrEqual(160);
  });
  test("평형 통계가 없으면 가격 문장 없이", () => {
    const d = aptDescription({ ...apt, build_year: null }, []);
    expect(d).not.toContain("최근 거래");
    expect(d).not.toContain("준공");
    expect(d).toContain("역삼래미안");
  });
  test("길면 평형 수를 줄이고, 그래도 길면 160자로 자른다", () => {
    const long = { ...apt, name: "가".repeat(90) };
    const d = aptDescription(long, stats);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d).toContain("59㎡ 28억(25.11)");
    expect(d).not.toContain("84㎡");
    const huge = aptDescription({ ...apt, name: "가".repeat(200) }, stats);
    expect(huge.length).toBe(160);
    expect(huge.endsWith("…")).toBe(true);
  });
});

describe("regionTitle / regionDescription", () => {
  test("구 이름 + 시도", () => {
    expect(regionTitle({ code: "11680", name: "강남구", city: "서울" })).toBe("강남구 아파트 실거래가 | 서울");
  });
  test("경기 시·구는 정식 이름", () => {
    expect(regionTitle({ code: "41135", name: "성남분당", city: "경기" })).toBe("성남시 분당구 아파트 실거래가 | 경기");
  });
  test("설명: 단지 수·평균가·거래량, 160자 이내", () => {
    const d = regionDescription({ code: "11680", name: "강남구", city: "서울" }, 512, {
      code: "11680",
      name: "강남구",
      city: "서울",
      avg_amount: 285000,
      tx_count_12m: 1234,
      yoy_change: 3.1,
    });
    expect(d).toContain("512개 단지");
    expect(d).toContain("28.5억");
    expect(d).toContain("1,234건");
    expect(d.length).toBeLessThanOrEqual(160);
  });
  test("통계가 없으면 단지 수만", () => {
    const d = regionDescription({ code: "11680", name: "강남구", city: "서울" }, 3);
    expect(d).toContain("3개 단지");
    expect(d).not.toContain("평균");
  });
});

describe("aptJsonLd", () => {
  test("ApartmentComplex + 주소 + 좌표 + url", () => {
    const j = aptJsonLd(apt) as Record<string, unknown>;
    expect(j).toEqual({
      "@context": "https://schema.org",
      "@type": "ApartmentComplex",
      name: "역삼래미안",
      url: `${SITE_URL}/apartment/764`,
      address: {
        "@type": "PostalAddress",
        addressCountry: "KR",
        addressRegion: "서울특별시",
        addressLocality: "강남구",
        streetAddress: "역삼동 757",
      },
      geo: { "@type": "GeoCoordinates", latitude: 37.4975, longitude: 127.05 },
    });
  });
  test("좌표·지번이 없으면 geo 생략, 주소는 동만", () => {
    const j = aptJsonLd({ ...apt, lat: null, lng: null, jibun: null, lawd_cd: "41135", city: "경기", region_name: "경기 성남분당" }) as {
      geo?: unknown;
      address: Record<string, string>;
    };
    expect(j.geo).toBeUndefined();
    expect(j.address.streetAddress).toBe("역삼동");
    expect(j.address.addressRegion).toBe("경기도");
    expect(j.address.addressLocality).toBe("성남시 분당구");
  });
  test("가격(Offer)은 넣지 않는다", () => {
    expect(JSON.stringify(aptJsonLd(apt))).not.toMatch(/offer|price/i);
  });
});

describe("breadcrumbJsonLd", () => {
  test("순서대로 position, 상대 경로는 절대 URL로", () => {
    const j = breadcrumbJsonLd([
      { name: "홈", url: "/" },
      { name: "서울", url: "/browse?city=서울" },
      { name: "강남구", url: "/region/11680" },
      { name: "역삼래미안", url: "/apartment/764" },
    ]) as { "@type": string; itemListElement: { position: number; name: string; item: string }[] };
    expect(j["@type"]).toBe("BreadcrumbList");
    expect(j.itemListElement.map((i) => [i.position, i.name])).toEqual([
      [1, "홈"],
      [2, "서울"],
      [3, "강남구"],
      [4, "역삼래미안"],
    ]);
    expect(j.itemListElement[0].item).toBe(`${SITE_URL}/`);
    expect(j.itemListElement[3].item).toBe(`${SITE_URL}/apartment/764`);
  });
});

describe("aptCrumbs", () => {
  test("홈 › 시도 › 구 › 단지", () => {
    expect(aptCrumbs(apt)).toEqual([
      { name: "홈", url: "/" },
      { name: "서울", url: `/browse?city=${encodeURIComponent("서울")}` },
      { name: "강남구", url: "/region/11680" },
      { name: "역삼동", url: "/region/11680/%EC%97%AD%EC%82%BC%EB%8F%99" },
      { name: "역삼래미안", url: "/apartment/764" },
    ]);
  });
  test("폐지 코드 단지는 첫 후속 구로", () => {
    const crumbs = aptCrumbs({ ...apt, lawd_cd: "28260", city: "인천" });
    expect(crumbs[2]).toEqual({ name: "서해구", url: "/region/28275" });
    expect(crumbs.map((c) => c.name)).not.toContain("역삼동"); // 후속 구에 같은 동이 있다는 보장이 없어 동 단계는 뺀다
  });
  test("모르는 코드면 구 단계 생략", () => {
    expect(aptCrumbs({ ...apt, lawd_cd: "99999" }).map((c) => c.name)).toEqual(["홈", "서울", "역삼래미안"]);
  });
});

describe("jsonLdHtml", () => {
  test("< 를 이스케이프해 </script> 탈출을 막는다", () => {
    const html = jsonLdHtml({ name: "</script><script>alert(1)</script>" });
    expect(html).not.toContain("<");
    expect(html).toContain("\\u003c/script>");
    expect(JSON.parse(html)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});

const ra = (id: number, name: string, amount: number | null, date: string | null) => ({
  id, name, dong: "역삼동", build_year: 2005, trade_count: 5,
  latest_trade_amount: amount, latest_trade_date: date, latest_jeonse_deposit: null, lat: null, lng: null,
});
const region = { code: "11680", name: "강남", city: "서울" };

describe("동 페이지 헬퍼", () => {
  test("dongHref 인코딩 ↔ dongFromParam 디코딩 왕복(괄호·숫자·공백)", () => {
    for (const d of ["역삼동", "상계1동", "중앙동(1)", "신 사동", "가락본동"]) {
      const href = dongHref("11680", d);
      expect(href.startsWith("/region/11680/")).toBe(true);
      expect(href).not.toMatch(/[ 가-힣]/); // 공백·한글은 인코딩(괄호는 URL에서 유효)
      expect(dongFromParam(href.split("/")[3])).toBe(d);
      expect(dongFromParam(d)).toBe(d); // 이미 디코딩된 값이 와도 같다
    }
    expect(dongFromParam("%E0%A4%A")).toBe("%E0%A4%A"); // 깨진 인코딩은 그대로(500 방지)
  });

  test("dongTitle: 형식 그대로, 길면 줄인다", () => {
    expect(dongTitle(region, "역삼동")).toBe("역삼동 아파트 실거래가 · 시세 | 강남구");
    const long = dongTitle({ code: "41135", name: "성남분당", city: "경기" }, "가".repeat(40));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.startsWith("가")).toBe(true);
  });

  test("dongDescription: 시군구 동 N개 단지 + 최근 거래 대표 단지 2~3개", () => {
    const apts = [ra(1, "A아파트", 100000, "2026-10-01"), ra(2, "B아파트", 285000, "2026-10-20"), ra(3, "C", 90000, "2026-09-01"), ra(4, "D", 80000, "2026-08-01"), ra(5, "신축", null, null)];
    const d = dongDescription(region, "역삼동", apts);
    expect(d).toBe("강남구 역삼동 아파트 5개 단지 실거래가. 최근 매매 B아파트 28.5억, A아파트 10억, C 9억.");
    expect(d.length).toBeLessThanOrEqual(160);
  });

  test("dongDescription: 거래 있는 단지가 없으면 문장 생략, 아주 길면 160자", () => {
    expect(dongDescription(region, "역삼동", [ra(1, "신축", null, null)])).toBe("강남구 역삼동 아파트 1개 단지 실거래가.");
    const apts = [1, 2, 3].map((i) => ra(i, "가".repeat(40), 100000, `2026-10-0${i}`));
    expect(dongDescription(region, "역삼동", apts).length).toBeLessThanOrEqual(160);
  });

  test("dongCrumbs: 홈 › 시도 › 구 › 동", () => {
    expect(dongCrumbs(region, "역삼동")).toEqual([
      { name: "홈", url: "/" },
      { name: "서울", url: `/browse?city=${encodeURIComponent("서울")}` },
      { name: "강남구", url: "/region/11680" },
      { name: "역삼동", url: dongHref("11680", "역삼동") },
    ]);
  });
});
