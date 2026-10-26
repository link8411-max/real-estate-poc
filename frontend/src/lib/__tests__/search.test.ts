import { describe, expect, test } from "vitest";
import { searchIndex, toChosung } from "@/lib/search";
import type { SearchIndexRow } from "@/lib/types";

const rows: SearchIndexRow[] = [
  [1, "래미안대치팰리스", "대치동", "11680", 2015],
  [2, "대치 아이파크", "대치동", "11680", null],
  [3, "은마", "대치동", "11680", 1979],
  [4, "대치1단지", "도곡동", "11680", 2000],
  [5, "래미안", "역삼동", "11680", 2010],
  [6, "래미안", "개포동", "11680", 2011],
];
const names = (r: SearchIndexRow[]) => r.map((x) => x[1]);

describe("toChosung", () => {
  test("한글 음절은 초성으로, 나머지는 그대로", () => {
    expect(toChosung("래미안")).toBe("ㄹㅁㅇ");
    expect(toChosung("e편한세상 1단지")).toBe("eㅍㅎㅅㅅ 1ㄷㅈ");
    expect(toChosung("A1-동")).toBe("A1-ㄷ");
    expect(toChosung("까")).toBe("ㄲ");
  });
});

describe("searchIndex", () => {
  test("초성 검색", () => {
    expect(names(searchIndex(rows, "ㄹㅁㅇ"))).toContain("래미안대치팰리스");
  });
  test("빈 질의 → []", () => {
    expect(searchIndex(rows, "")).toEqual([]);
    expect(searchIndex(rows, "   ")).toEqual([]);
  });
  test("공백 제거 후 매칭", () => {
    expect(names(searchIndex(rows, "대치 아이파크"))).toEqual(["대치 아이파크"]);
    expect(names(searchIndex(rows, "대치아이"))).toEqual(["대치 아이파크"]);
  });
  test("이름 시작 > 이름 포함 > 동 포함", () => {
    const r = searchIndex(rows, "대치");
    // 이름 startsWith: 대치 아이파크(len 6 공백제거 시 6), 대치1단지(5) → 짧은 순
    // 이름 includes: 래미안대치팰리스, 동 includes: 은마
    expect(names(r)).toEqual(["대치1단지", "대치 아이파크", "래미안대치팰리스", "은마"]);
  });
  test("동률은 이름 길이 → id 오름차순", () => {
    expect(searchIndex(rows, "래미안").map((x) => x[0])).toEqual([5, 6, 1]);
  });
  test("중복 없음 (이름·동·초성 동시 일치)", () => {
    const r = searchIndex([[1, "ㄱㄴ", "ㄱ동", "1", null]], "ㄱ");
    expect(r).toHaveLength(1);
  });
  test("초성 질의가 아니면 초성 매칭 안 함", () => {
    expect(searchIndex(rows, "ㄹㅁa")).toEqual([]);
  });
  test("limit", () => {
    expect(searchIndex(rows, "동", 2)).toHaveLength(2);
    expect(searchIndex(rows, "대치")).toHaveLength(4);
  });
});
