-- 최신 거래 전용면적의 공급평(건축물대장·청약홈 기반). 운영 적용은 SUPABASE_SUPPLY_COLUMNS=1 과 함께.
alter table apartments add column if not exists latest_supply_min int;
alter table apartments add column if not exists latest_supply_max int;
alter table apartments add column if not exists latest_supply_approx boolean;
