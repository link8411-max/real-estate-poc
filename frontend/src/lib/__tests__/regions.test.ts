import { describe, expect, test } from "vitest";
import { browseHref, districtLabel } from "../regions";

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

describe("browseHref", () => {
  test("한글 도시명 인코딩", () => {
    expect(browseHref("인천", "28177")).toBe(`/browse?city=${encodeURIComponent("인천")}&region=28177`);
  });
});
