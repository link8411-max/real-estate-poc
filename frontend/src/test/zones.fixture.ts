import type { Zone, ZonesFile } from "@/lib/types";

/** 테스트용 정비구역 표본. R2 의 v1/redevelopment/zones.json 과 같은 모양(파이프라인 build_zones_json 출력). */
export const zone = (over: Partial<Zone> = {}): Zone => ({
  zone_id: "z000",
  sido: "서울특별시",
  sigungu: "강남구",
  lawd_cd: "11680",
  name: "은마구역",
  stage: "조합설립인가",
  stage_order: 4,
  type: "재건축(공동주택)",
  type_group: "재건축",
  operator: "조합",
  households: 5000,
  apt_ids: [],
  apt_names: [],
  lat: null,
  lng: null,
  geo: null,
  match: null,
  ...over,
});

export const SAMPLE_ZONES: Zone[] = [
  zone({ zone_id: "z001", name: "은마구역", lat: 37.4985, lng: 127.0665, geo: "apt", match: "exact", apt_ids: [101], apt_names: ["은마"], stage: "조합설립인가", stage_order: 4 }),
  zone({ zone_id: "z002", name: "잠실주공5단지", stage: "관리처분인가", stage_order: 6, households: 6491, lat: 37.5, lng: 127.09, geo: "apt", match: "contains", apt_ids: [102, 103], apt_names: ["잠실주공5단지", "잠실주공4단지"], sigungu: "송파구", lawd_cd: "11710" }),
  zone({ zone_id: "z003", name: "한남3구역", sigungu: "용산구", lawd_cd: "11170", type: "재개발(주택정비)", type_group: "재개발", stage: "착공", stage_order: 7, operator: "조합", households: 5816, lat: 37.5345, lng: 127.0, geo: "kakao_keyword" }),
  zone({ zone_id: "z004", name: "신길1구역", sigungu: "영등포구", lawd_cd: "11560", type: "재개발(도시정비)", type_group: "재개발", stage: "정비구역지정", stage_order: 2, operator: null, households: null, lat: 37.51, lng: 126.91, geo: "dong_approx" }),
  zone({ zone_id: "z005", name: "수원 영통3구역", sido: "경기도", sigungu: "수원영통구", lawd_cd: "41117", stage: "추진위구성", stage_order: 3, households: 1333 }),
  zone({ zone_id: "z006", name: "산곡동 주거환경개선", sido: "인천광역시", sigungu: "부평구", lawd_cd: "28237", type: "주거환경개선", type_group: "주거환경개선", stage: "사업시행자지정", stage_order: 4.5, operator: "LH", households: 300, lat: 37.49, lng: 126.7, geo: "kakao_keyword" }),
  zone({ zone_id: "z007", name: "옛 시군구 구역", sido: "인천광역시", sigungu: "남구", lawd_cd: null, type: "재개발(주택정비)", type_group: "재개발", stage: "사업시행인가", stage_order: 5, households: 0 }),
];

export const SAMPLE_FILE: ZonesFile = {
  source: "국토교통부 전국 도시정비사업 통합 데이터",
  as_of: "2026-05-18",
  generated_at: "2026-11-04T00:00:00+00:00",
  zones: SAMPLE_ZONES,
};
