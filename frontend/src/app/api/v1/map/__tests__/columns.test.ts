import { describe, expect, test } from "vitest";
import { MAP_COLUMNS } from "../route";

describe("MAP_COLUMNS", () => {
  test("미리보기 카드용 latest_trade_date를 포함한다", () => {
    expect(MAP_COLUMNS.split(",")).toContain("latest_trade_date");
  });
});
