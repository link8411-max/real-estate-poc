import { beforeEach, describe, expect, test, vi } from "vitest";
import { SAMPLE_FILE, SAMPLE_ZONES, zone } from "@/test/zones.fixture";

const fetchZones = vi.fn();
vi.mock("../data", () => ({ fetchZones: (...a: unknown[]) => fetchZones(...a) }));

const r = await import("../redevelopment");

beforeEach(() => fetchZones.mockReset());

describe("fetchZoneItems", () => {
  test("정상 파일", async () => {
    fetchZones.mockResolvedValue(SAMPLE_FILE);
    expect(await r.fetchZoneItems()).toHaveLength(7);
  });
  test("null(R2에 아직 없음)·throw·깨진 JSON 은 빈 배열", async () => {
    fetchZones.mockResolvedValue(null);
    expect(await r.fetchZoneItems()).toEqual([]);
    fetchZones.mockRejectedValue(new Error("boom"));
    expect(await r.fetchZoneItems()).toEqual([]);
    fetchZones.mockResolvedValue({});
    expect(await r.fetchZoneItems()).toEqual([]);
  });
});

describe("loadZonesOnce", () => {
  test("한 번만 받아 캐시하고, 실패하면 다음 호출에서 다시 시도", async () => {
    r.resetZonesCache();
    fetchZones.mockRejectedValueOnce(new Error("net"));
    await expect(r.loadZonesOnce()).rejects.toThrow();
    fetchZones.mockResolvedValue(SAMPLE_FILE);
    expect(await r.loadZonesOnce()).toHaveLength(7);
    expect(await r.loadZonesOnce()).toHaveLength(7);
    expect(fetchZones).toHaveBeenCalledTimes(2);
    r.resetZonesCache();
    fetchZones.mockResolvedValue(null);
    expect(await r.loadZonesOnce()).toEqual([]);
  });
});

describe("요약·조회", () => {
  test("summarize: 유형별·단계별 개수", () => {
    const s = r.summarize(SAMPLE_ZONES);
    expect(s.total).toBe(7);
    expect(s.byGroup).toEqual({ 재건축: 3, 재개발: 3, 주거환경개선: 1 });
    expect(s.byStage["착공"]).toBe(1);
    expect(s.byStage["조합설립인가"]).toBe(1);
    expect(s.byStage["정비구역지정"]).toBe(1);
  });
  test("zonesForRegion: lawd_cd 일치, 진행 단계 높은 순", () => {
    const zs = [zone({ zone_id: "a", stage_order: 3 }), zone({ zone_id: "b", stage_order: 7 }), zone({ zone_id: "c", lawd_cd: "11710" })];
    expect(r.zonesForRegion(zs, "11680").map((z) => z.zone_id)).toEqual(["b", "a"]);
  });
  test("zonesForApartment: apt_ids 에 든 구역만", () => {
    expect(r.zonesForApartment(SAMPLE_ZONES, 102).map((z) => z.zone_id)).toEqual(["z002"]);
    expect(r.zonesForApartment(SAMPLE_ZONES, 999)).toEqual([]);
  });
  test("zoneLabel: 유형 · 단계", () => {
    expect(r.zoneLabel(SAMPLE_ZONES[0])).toBe("재건축 · 조합설립인가");
  });
  test("formatHouseholds: null 은 -, 0 은 0세대", () => {
    expect(r.formatHouseholds(null)).toBe("-");
    expect(r.formatHouseholds(0)).toBe("0세대");
    expect(r.formatHouseholds(5816)).toBe("5,816세대");
  });
});

describe("readZoneFilters / zoneFilterPatch", () => {
  test("기본은 꺼짐·전체", () => {
    expect(r.readZoneFilters(new URLSearchParams())).toEqual({ on: false, types: [], stages: [], hideApts: false });
  });
  test("zones=1, 쉼표 목록, 모르는 값은 버림", () => {
    const sp = new URLSearchParams({ zones: "1", zt: "재건축,재개발,엉뚱", zs: "착공,관리처분인가" });
    expect(r.readZoneFilters(sp)).toEqual({ on: true, types: ["재건축", "재개발"], stages: ["관리처분인가", "착공"], hideApts: false });
  });
  test("apts=0 이면 아파트 시세 숨김", () => {
    expect(r.readZoneFilters(new URLSearchParams("zones=1&apts=0")).hideApts).toBe(true);
    expect(r.readZoneFilters(new URLSearchParams("zones=1&apts=1")).hideApts).toBe(false);
    expect(r.ZONE_KEYS).toContain("apts");
  });
  test("toggleIn: 있으면 빼고 없으면 넣되 정해진 순서 유지", () => {
    expect(r.toggleIn(["재개발"], "재건축", r.TYPE_GROUPS)).toEqual(["재건축", "재개발"]);
    expect(r.toggleIn(["재건축", "재개발"], "재건축", r.TYPE_GROUPS)).toEqual(["재개발"]);
  });
});

describe("mapZones", () => {
  const bounds = { minLat: 37.4, minLng: 126.8, maxLat: 37.6, maxLng: 127.2 };
  const all = { on: true, types: [], stages: [], hideApts: false };
  test("좌표 없는 구역은 지도에서 제외, 범위 밖 제외", () => {
    const ids = r.mapZones(SAMPLE_ZONES, all, bounds).map((z) => z.zone_id);
    expect(ids).toEqual(expect.arrayContaining(["z001", "z002", "z003", "z004"]));
    expect(ids).not.toContain("z005"); // 좌표 없음
    expect(ids).not.toContain("z006"); // 범위 밖(126.7)
  });
  test("bounds 가 없으면 범위 제한 없음", () => {
    expect(r.mapZones(SAMPLE_ZONES, all, null).map((z) => z.zone_id)).toContain("z006");
  });
  test("유형·단계 복수 선택(OR), 비어 있으면 전체", () => {
    const f = (types: string[], stages: string[]) => r.mapZones(SAMPLE_ZONES, { on: true, types, stages, hideApts: false }, null).map((z) => z.zone_id);
    expect(f(["재건축"], [])).toEqual(["z001", "z002"]);
    expect(f(["재건축", "주거환경개선"], [])).toEqual(["z001", "z002", "z006"]);
    expect(f([], ["착공", "정비구역지정"])).toEqual(["z003", "z004"]);
    expect(f(["재개발"], ["착공"])).toEqual(["z003"]);
  });
});

describe("zoneColor: 유형은 색상, 단계가 진행될수록 진하다", () => {
  const sat = (c: string) => Number(/hsl\(\d+ (\d+)%/.exec(c)![1]);
  test("유형마다 다른 색상(hue)", () => {
    const hue = (g: string) => /hsl\((\d+)/.exec(r.zoneColor(g, 4).fill)![1];
    expect(new Set([hue("재건축"), hue("재개발"), hue("주거환경개선")]).size).toBe(3);
  });
  test("stage_order 가 클수록 채도가 높다", () => {
    const s = [2, 3, 4, 4.5, 5, 6, 7].map((o) => sat(r.zoneColor("재건축", o).fill));
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
  });
  test("null 단계도 색을 돌려준다", () => {
    expect(r.zoneColor("재개발", null).fill).toMatch(/^hsl/);
  });
});

describe("zoneLabelWidth", () => {
  test("긴 라벨일수록 넓다", () => {
    expect(r.zoneLabelWidth("재개발 · 사업시행자지정")).toBeGreaterThan(r.zoneLabelWidth("재건축 · 착공"));
  });
});
