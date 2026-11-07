import { describe, expect, test } from "vitest";
import {
  aptCrumbs,
  aptDescription,
  aptIntro,
  pickNearby,
  latestJeonse,
  aptJsonLd,
  aptTitle,
  breadcrumbJsonLd,
  dongCrumbs,
  dongDescription,
  dongFromParam,
  dongHref,
  dongIntro,
  dongTitle,
  jsonLdHtml,
  regionDescription,
  regionIntro,
  regionTitle,
  shortPrice,
  SITE_URL,
  MAX_APT_TITLE,
  shortDistrict,
  websiteJsonLd,
} from "../seo";
import type { Apartment, AreaStat, RegionApartment, Rent, Transaction } from "../types";

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

describe("shortDistrict", () => {
  test("시군구 이름의 마지막 단어", () => {
    expect(shortDistrict("용인시 기흥구")).toBe("기흥구");
    expect(shortDistrict("송파구")).toBe("송파구");
    expect(shortDistrict("성남시 분당구")).toBe("분당구");
    expect(shortDistrict("광명시")).toBe("광명시");
    expect(shortDistrict("")).toBe("");
  });
});

describe("aptTitle", () => {
  const giheung: Apartment = { ...apt, name: "기흥역더퍼스트푸르지오", dong: "구갈동", lawd_cd: "41463", region_name: "경기 용인기흥", city: "경기" };
  test("가격 먼저, 지역은 짧게", () => {
    expect(aptTitle(giheung, tx(103000, "2025-10-30"))).toBe("기흥역더퍼스트푸르지오 실거래가 10.3억 · 기흥구 구갈동");
    expect(aptTitle(apt, tx(350000, "2025-10-30"))).toBe("역삼래미안 실거래가 35억 · 강남구 역삼동");
  });
  test("최근 거래가 없으면 가격 생략", () => {
    expect(aptTitle(apt)).toBe("역삼래미안 실거래가 · 강남구 역삼동");
  });
  test("모르는 코드는 region_name에서 시도를 뺀 값으로", () => {
    expect(aptTitle({ ...apt, lawd_cd: "99999", region_name: "서울 어딘구" }, tx(350000, "2025-10-30"))).toBe("역삼래미안 실거래가 35억 · 어딘구 역삼동");
  });
  test("길면 동 → 지역 → 가격 순으로 뺀다", () => {
    const t = (name: string) => aptTitle({ ...apt, name }, tx(350000, "2025-10-30"));
    expect(t("가".repeat(17))).toBe(`${"가".repeat(17)} 실거래가 35억 · 강남구`);
    expect(t("가".repeat(20))).toBe(`${"가".repeat(20)} 실거래가 35억`);
    expect(t("가".repeat(40))).toBe(`${"가".repeat(40)} 실거래가`);
    expect(t("가".repeat(17)).length).toBeLessThanOrEqual(MAX_APT_TITLE);
  });
  test("브랜드 접미사는 붙이지 않는다", () => {
    expect(aptTitle(apt, tx(350000, "2025-10-30"))).not.toContain("집시세");
  });
});

describe("websiteJsonLd", () => {
  test("이름·대체 이름·검색 액션", () => {
    const ld = websiteJsonLd() as { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(ld["@type"]).toBe("WebSite");
    expect(ld.name).toBe("집시세");
    expect(ld.alternateName).toBe("zipsise");
    expect(ld.url).toBe(`${SITE_URL}/`);
    expect(ld.potentialAction.target.urlTemplate).toBe(`${SITE_URL}/search?q={search_term_string}`);
  });
});

describe("aptDescription 지역 표기", () => {
  test("regions 약칭(경기 용인기흥) 대신 정식 시군구 이름", () => {
    const g: Apartment = { ...apt, name: "기흥역더퍼스트푸르지오", dong: "구갈동", lawd_cd: "41463", region_name: "경기 용인기흥", city: "경기" };
    const d = aptDescription(g, []);
    expect(d).toContain("경기 용인시 기흥구 구갈동 기흥역더퍼스트푸르지오");
    expect(d).not.toContain("용인기흥");
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

describe("aptDescription 전세", () => {
  const stats = [stat(59, 699, 280000, "2025-11-08"), stat(80, 229, 350000, "2025-10-30"), stat(84, 500, 330000, "2025-09-01")];
  test("전세 데이터가 있으면 전세가·전세가율을 거래 요약 앞에 넣는다", () => {
    const d = aptDescription(apt, stats, { deposit: 190000, ratio: 61.4 });
    expect(d).toContain("최근 전세 19억, 전세가율 61%.");
    expect(d.indexOf("최근 전세")).toBeLessThan(d.indexOf("최근 거래"));
    expect(d.length).toBeLessThanOrEqual(160);
  });
  test("전세가율이 없으면 전세가만", () => {
    const d = aptDescription(apt, stats, { deposit: 190000 });
    expect(d).toContain("최근 전세 19억.");
    expect(d).not.toContain("전세가율");
  });
  test("전세 정보 없으면 기존과 같다", () => {
    expect(aptDescription(apt, stats, null)).toBe(aptDescription(apt, stats));
  });
  test("공간이 모자라면 평형 요약을 먼저 줄이고 전세는 남긴다", () => {
    const long = { ...apt, name: "가".repeat(75) };
    const d = aptDescription(long, stats, { deposit: 190000, ratio: 61.4 });
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d).toContain("최근 전세 19억, 전세가율 61%.");
    expect(d).not.toContain("84㎡");
  });
  test("아주 길면 전세도 빼고 160자로 자른다", () => {
    const huge = aptDescription({ ...apt, name: "가".repeat(200) }, stats, { deposit: 190000, ratio: 61.4 });
    expect(huge.length).toBe(160);
  });
});

describe("latestJeonse", () => {
  const rent = (deposit: number, monthly: number, date: string): Rent => ({
    id: 1, deposit, monthly_rent: monthly, area: 84, floor: 3, deal_date: date,
    contract_type: null, use_rr_right: null, pre_deposit: null, pre_monthly_rent: null,
  });
  test("월세 없는 가장 최근 거래의 보증금 + 매매 지표의 전세가율", () => {
    const rents = [rent(150000, 0, "2025-09-01"), rent(30000, 100, "2025-11-01"), rent(160000, 0, "2025-10-01")];
    expect(latestJeonse(rents, { jeonse_ratio: 55.5 })).toEqual({ deposit: 160000, ratio: 55.5 });
  });
  test("전세 거래가 없으면 null", () => {
    expect(latestJeonse([rent(30000, 100, "2025-11-01")], {})).toBeNull();
    expect(latestJeonse([], {})).toBeNull();
  });
  test("전세가율 지표가 없으면 ratio 생략", () => {
    expect(latestJeonse([rent(150000, 0, "2025-09-01")], {})).toEqual({ deposit: 150000 });
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

describe("aptIntro", () => {
  const a = { ...apt, name: "용진2", lawd_cd: "28710", region_name: "인천 강화군", city: "인천", dong: "갑곳리", build_year: 1990 };
  const label = "전용 59㎡·18평";

  test("완결된 한 문장 묶음: 지역·준공·최근 매매·평형 수", () => {
    expect(aptIntro(a, tx(5100, "2026-11-05", 59.9), 3, label)).toBe(
      "인천 강화군 갑곳리에 있는 용진2는 1990년 준공 아파트로, 최근 매매는 전용 59㎡·18평 5,100만원(2026-11-05)입니다. 3개 평형의 실거래가와 전세·월세 내역을 볼 수 있습니다.",
    );
  });
  test("준공연도 없으면 준공 구절 생략", () => {
    expect(aptIntro({ ...a, build_year: null }, tx(5100, "2026-11-05"), 1, label)).toContain("용진2는 아파트로, 최근 매매는");
  });
  test("거래 없으면 거래 없음 문장, 평형 0이면 평형 수 생략", () => {
    const t = aptIntro(a, undefined, 0, null);
    expect(t).toContain("최근 매매 거래는 아직 없습니다.");
    expect(t).toContain("실거래가와 전세·월세 내역을 볼 수 있습니다.");
    expect(t).not.toContain("개 평형");
  });
  test("조사는 받침 유무로: 받침 있으면 은, 없으면 는, 숫자·영문 끝은 는", () => {
    expect(aptIntro({ ...a, name: "래미안" }, undefined, 1, null)).toContain("래미안은 ");
    expect(aptIntro({ ...a, name: "푸르지오" }, undefined, 1, null)).toContain("푸르지오는 ");
    expect(aptIntro({ ...a, name: "용진2" }, undefined, 1, null)).toContain("용진2는 ");
    expect(aptIntro({ ...a, name: "e편한세상A" }, undefined, 1, null)).toContain("e편한세상A는 ");
  });
});

describe("pickNearby", () => {
  const ra = (id: number, dong: string, trade_count = 1, latest_trade_date: string | null = null): RegionApartment => ({
    id, name: `n${id}`, dong, build_year: null, trade_count, latest_trade_amount: null, latest_trade_date,
    latest_jeonse_deposit: null, lat: null, lng: null,
  });
  test("같은 동 3개 이상: 자기 제외, 최근 거래일순, 최대 12개", () => {
    const all = [ra(1, "d"), ra(2, "d", 1, "2026-01-01"), ra(3, "d", 1, "2026-02-01"), ra(4, "d"), ra(5, "x", 99)];
    const r = pickNearby(all, { id: 1, dong: "d" });
    expect(r.sameDong).toBe(true);
    expect(r.apartments.map((x) => x.id)).toEqual([3, 2, 4]);
  });
  test("같은 동 3개 미만: 다른 동을 거래 많은 순으로 채움", () => {
    const all = [ra(1, "d"), ra(2, "d"), ra(3, "x", 5), ra(4, "y", 9)];
    const r = pickNearby(all, { id: 1, dong: "d" });
    expect(r.sameDong).toBe(false);
    expect(r.apartments.map((x) => x.id)).toEqual([2, 4, 3]);
  });
});

describe("dongIntro / regionIntro", () => {
  const gu = { code: "11680", name: "강남구", city: "서울" };
  const ra = (id: number, name: string, o: Partial<RegionApartment> = {}): RegionApartment => ({
    id, name, dong: "삼성동", build_year: 2000, trade_count: 3, latest_trade_amount: 100000, latest_trade_date: "2026-10-01",
    latest_jeonse_deposit: null, lat: null, lng: null, ...o,
  });
  test("동: 단지 수 + 가장 최근 매매 단지(동률이면 거래 많은 쪽)", () => {
    const s = dongIntro(gu, "삼성동", [
      ra(1, "오래된", { latest_trade_date: "2026-08-01" }),
      ra(2, "적게", { latest_trade_date: "2026-11-05", latest_trade_amount: 280000, trade_count: 1 }),
      ra(3, "많이", { latest_trade_date: "2026-11-05", latest_trade_amount: 245000, trade_count: 9 }),
    ]);
    expect(s).toBe(
      "서울 강남구 삼성동에는 아파트 3개 단지가 있습니다. 가장 최근 매매는 많이 24억 5,000만원(2026-11-05)입니다. 단지별 실거래가·전세·최근 신고가를 최근 거래순으로 볼 수 있습니다.",
    );
  });
  test("동: 거래 단지가 없으면 최근 매매 문장 생략, 경기 구는 정식 이름", () => {
    const s = dongIntro({ code: "41135", name: "성남분당", city: "경기" }, "정자동", [ra(1, "a", { latest_trade_amount: null, latest_trade_date: null })]);
    expect(s).toBe("경기 성남시 분당구 정자동에는 아파트 1개 단지가 있습니다. 단지별 실거래가·전세·최근 신고가를 최근 거래순으로 볼 수 있습니다.");
  });
  test("지역: 단지 수·평균가·거래량·전년 대비", () => {
    const s = regionIntro(gu, 1234, { code: "11680", name: "강남구", city: "서울", avg_amount: 285000, tx_count_12m: 3456, yoy_change: 5 });
    expect(s).toBe(
      "서울 강남구 아파트 1,234개 단지의 실거래가입니다. 최근 12개월 평균 매매가는 28억 5,000만원, 거래는 3,456건이며 전년 대비 +5%입니다. 동별·단지별 실거래가와 최근 신고가, 재건축·재개발 현황을 볼 수 있습니다.",
    );
  });
  test("지역: 통계 없음/평균 없음/전년 대비 없음/음수", () => {
    expect(regionIntro(gu, 3)).toBe("서울 강남구 아파트 3개 단지의 실거래가입니다. 동별·단지별 실거래가와 최근 신고가, 재건축·재개발 현황을 볼 수 있습니다.");
    const base = { code: "11680", name: "강남구", city: "서울", avg_amount: null, tx_count_12m: 0, yoy_change: null };
    expect(regionIntro(gu, 3, base)).not.toContain("평균");
    expect(regionIntro(gu, 3, { ...base, avg_amount: 90000, tx_count_12m: 10 })).toContain("최근 12개월 평균 매매가는 9억원, 거래는 10건입니다.");
    expect(regionIntro(gu, 3, { ...base, avg_amount: 90000, tx_count_12m: 10, yoy_change: -2.5 })).toContain("전년 대비 -2.5%");
  });
});
