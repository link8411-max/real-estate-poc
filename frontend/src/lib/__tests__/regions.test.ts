import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { REGION_NAMES } from "../regionNames";
import { browseHref, districtFullName, districtLabel, regionHref, RETIRED_SUCCESSORS, resolveRegionCode } from "../regions";

describe("districtLabel", () => {
  test("현행 코드 → 시도 + 짧은 이름", () => {
    expect(districtLabel("11680")).toBe("서울 강남구");
    expect(districtLabel("41135")).toBe("경기 성남분당");
    expect(districtLabel("28290")).toBe("인천 검단구");
  });
  test("폐지 코드도 옛 이름으로", () => {
    expect(districtLabel("28260")).toBe("인천 서구");
    expect(districtLabel("41590")).toBe("경기 화성");
  });
  test("모르는 코드는 빈 문자열", () => {
    expect(districtLabel("99999")).toBe("");
  });
});

describe("districtFullName", () => {
  test.each([
    ["11680", "강남구"],
    ["41135", "성남시 분당구"],
    ["41285", "고양시 일산동구"],
    ["41597", "화성시 동탄구"],
    ["41150", "의정부시"],
    ["41610", "광주시"],
    ["41800", "연천군"],
    ["28177", "미추홀구"],
    ["28710", "강화군"],
    ["41590", "화성시"],
    ["28260", "서구"],
  ])("%s → %s", (code, name) => {
    expect(districtFullName(code)).toBe(name);
  });
  test("모든 현행 코드가 구·시·군으로 끝난다", () => {
    for (const code of Object.keys(REGION_NAMES)) expect(districtFullName(code)).toMatch(/[구시군]$/);
  });
  test("모르는 코드는 빈 문자열", () => {
    expect(districtFullName("99999")).toBe("");
  });
});

describe("resolveRegionCode", () => {
  test("현행 코드는 그대로", () => {
    expect(resolveRegionCode("11680")).toEqual({ kind: "ok", code: "11680" });
  });
  test("폐지 코드는 첫 후속 코드로 리다이렉트", () => {
    expect(resolveRegionCode("28260")).toEqual({ kind: "redirect", code: "28275" });
    expect(resolveRegionCode("41590")).toEqual({ kind: "redirect", code: "41591" });
  });
  test("모르는 코드·형식 오류는 notFound", () => {
    expect(resolveRegionCode("99999")).toEqual({ kind: "notFound" });
    expect(resolveRegionCode("../x")).toEqual({ kind: "notFound" });
    expect(resolveRegionCode("")).toEqual({ kind: "notFound" });
  });
  test("후속 코드 표가 pipeline/regions.py SUCCEEDED_BY와 같다", () => {
    const py = readFileSync(fileURLToPath(new URL("../../../../pipeline/regions.py", import.meta.url)), "utf-8");
    const block = py.slice(py.indexOf("SUCCEEDED_BY"), py.indexOf("PREDECESSORS"));
    const parsed = Object.fromEntries(
      [...block.matchAll(/"(\d{5})":\s*\[([^\]]*)\]/g)].map(([, k, v]) => [k, [...v.matchAll(/"(\d{5})"/g)].map((m) => m[1])]),
    );
    expect(parsed).toEqual(RETIRED_SUCCESSORS);
  });
});

describe("links", () => {
  test("browseHref: 한글 도시명 인코딩", () => {
    expect(browseHref("인천")).toBe(`/browse?city=${encodeURIComponent("인천")}`);
  });
  test("regionHref", () => {
    expect(regionHref("28177")).toBe("/region/28177");
  });
});
