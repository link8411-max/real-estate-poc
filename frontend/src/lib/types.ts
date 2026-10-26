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
