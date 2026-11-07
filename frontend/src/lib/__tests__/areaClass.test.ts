import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { areaClassMap } from "@/lib/areaClass";

type Case = { name: string; areas: Array<[number, number]>; expect: Record<string, number> };
const CASES: Case[] = JSON.parse(
  readFileSync(join(__dirname, "../../../../tests/fixtures/area_class_cases.json"), "utf-8"),
);

describe("areaClassMap", () => {
  test("matches shared fixture", () => {
    for (const c of CASES) {
      const got = areaClassMap(c.areas);
      const expected = new Map(Object.entries(c.expect).map(([k, v]) => [Number(k), v] as [number, number]));
      expect(got, c.name).toEqual(expected);
    }
  });
});
