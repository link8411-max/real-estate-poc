/** 단지 주택형: 전용·공급면적(㎡). approx는 추정값 여부. */
export type AreaType = { excl: number; supply: number; approx: boolean };

/** 화면에 쓰는 공급평 (평 단위 정수 범위). */
export type SupplyLabel = { min: number; max: number; approx: boolean };

export interface Apartment {
  id: number;
  name: string;
  dong: string;
  lawd_cd: string;
  region_name: string;
  city: string;
  jibun: string | null;
  build_year: number | null;
  apt_seq: string | null;
  lat: number | null;
  lng: number | null;
  area_types?: AreaType[];
}

export interface AreaStat {
  area: number;
  count: number;
  max_amount: number;
  min_amount: number;
  avg_amount: number;
  latest_amount: number;
  latest_date: string;
  recent_avg: number | null;
  recent_count: number;
  peak_date: string;
}

export interface RentAreaStat {
  area: number;
  jeonse_count: number;
  wolse_count: number;
  latest_deposit: number;
  latest_monthly_rent: number;
  latest_date: string;
  recent_jeonse_avg: number | null;
}

export interface Metrics {
  bargain_amount?: number;
  bargain_percent?: number;
  recovery_rate?: number;
  peak_date?: string;
  days_since_last_tx?: number;
  jeonse_ratio?: number;
}

export interface Transaction {
  id: number;
  amount: number;
  area: number;
  floor: number | null;
  deal_date: string;
  cancel_date: string | null;
}

export interface Rent {
  id: number;
  deposit: number;
  monthly_rent: number;
  area: number;
  floor: number | null;
  deal_date: string;
  contract_type: string | null;
  use_rr_right: boolean | number | null;
  pre_deposit: number | null;
  pre_monthly_rent: number | null;
}

/** 다른 단지에 합쳐져 사라진 단지의 trade.json / rent.json 내용. */
export type Moved = { moved_to: number };

export function isMoved(x: unknown): x is Moved {
  return typeof x === "object" && x !== null && Number.isSafeInteger((x as Moved).moved_to) && (x as Moved).moved_to > 0;
}

export interface AptTrade {
  apartment: Apartment;
  area_stats: AreaStat[];
  metrics: Metrics;
  transactions: Transaction[];
}

export interface AptRent {
  apartment: Apartment;
  rent_area_stats: RentAreaStat[];
  rents: Rent[];
}

export interface RegionApartment {
  id: number;
  name: string;
  dong: string;
  build_year: number | null;
  trade_count: number;
  latest_trade_amount: number | null;
  latest_trade_date: string | null;
  latest_jeonse_deposit: number | null;
  lat: number | null;
  lng: number | null;
}

export interface RegionFile {
  code: string;
  name: string;
  city: string;
  succeeded_by: string | null;
  apartments: RegionApartment[];
}

export interface RegionStat {
  code: string;
  name: string;
  city: string;
  avg_amount: number | null;
  tx_count_12m: number;
  yoy_change: number | null;
}

export interface RecentTrade {
  apt_id: number;
  name: string;
  region_name: string;
  amount: number;
  area: number;
  deal_date: string;
}

export interface DataRange {
  min_date: string | null;
  max_date: string | null;
}

export interface StatsFile {
  data_updated_at: string;
  data_range: DataRange;
  total_apartments: number;
  recent_transactions_30d: number;
  regions: RegionStat[];
  top_up: RegionStat[];
  top_down: RegionStat[];
  recent: RecentTrade[];
}

/** [id, name, dong, lawd_cd, build_year] */
export type SearchIndexRow = [number, string, string, string, number | null];

export interface MetaFile {
  data_updated_at: string;
  data_range: DataRange;
  apartment_count: number;
  trade_count: number;
  rent_count: number;
}

export interface CanceledHigh {
  tx_id: number;
  apt_id: number;
  apt_name: string;
  region_name: string;
  city: "서울" | "경기" | "인천";
  area: number;
  area_group: number;
  floor: number | null;
  amount: number;
  prev_max: number;
  jump: number;
  deal_date: string;
  cancel_date: string;
  days_to_cancel: number;
  /** 공급평(없으면 null, 구버전 JSON에는 키가 없다) */
  supply?: SupplyLabel | null;
}

export interface CanceledRecentFile {
  generated_at: string;
  since: string;
  items: CanceledHigh[];
}

export interface RecordHigh {
  tx_id: number;
  apt_id: number;
  apt_name: string;
  region_name: string;
  city: "서울" | "경기" | "인천";
  lawd_cd: string;
  dong: string;
  area: number;
  area_group: number;
  floor: number | null;
  amount: number;
  prev_max: number;
  jump: number;
  jump_pct: number;
  deal_date: string;
  supply?: SupplyLabel | null;
}

export interface HighsRecentFile {
  generated_at: string;
  since: string;
  items: RecordHigh[];
}

/** 정비구역(v1/redevelopment/zones.json). 필드 의미는 pipeline/redevelopment.py 참고 */
export interface Zone {
  zone_id: string;
  sido: string;
  sigungu: string;
  /** regions 에 없는 시군구(폐지·통합)면 null — 목록에는 남는다 */
  lawd_cd: string | null;
  name: string;
  stage: string;
  stage_order: number | null;
  type: string;
  type_group: string;
  operator: string | null;
  /** '해당없음'·공백은 null (0 과 구분) */
  households: number | null;
  apt_ids: number[];
  /** apt_ids 와 같은 순서의 단지 이름(이전 버전 파일에는 없을 수 있다) */
  apt_names?: string[];
  lat: number | null;
  lng: number | null;
  /** "apt" | "kakao_*" | "dong_approx"(동 단위 대략) | null(좌표 없음) */
  geo: string | null;
  match: string | null;
}

export interface ZonesFile {
  source: string;
  as_of: string;
  generated_at: string;
  zones: Zone[];
}
