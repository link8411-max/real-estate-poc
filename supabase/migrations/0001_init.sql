create table if not exists regions (
  code text primary key,
  name text,
  city text,
  succeeded_by text,
  lat float8,
  lng float8,
  apartment_count int,
  avg_amount int,
  updated_at timestamptz default now()
);

create table if not exists apartments (
  id int primary key,
  name text,
  lawd_cd text,
  city text,
  dong text,
  jibun text,
  build_year int,
  apt_seq text,
  lat float8,
  lng float8,
  latest_trade_amount int,
  latest_trade_date date,
  latest_trade_area int,
  latest_jeonse_deposit int,
  latest_jeonse_date date,
  trade_count int,
  rent_count int,
  recent_avg int,
  peak_amount int,
  jeonse_ratio real,
  area_stats jsonb,
  rent_area_stats jsonb,
  metrics jsonb,
  updated_at timestamptz default now()
);

create table if not exists apartment_aliases (
  old_id int primary key,
  canonical_id int
);

create index if not exists idx_apartments_lat_lng on apartments (lat, lng);
create index if not exists idx_apartments_lawd_cd on apartments (lawd_cd);
create index if not exists idx_apartments_latest_trade_amount on apartments (latest_trade_amount);
create index if not exists idx_apartments_build_year on apartments (build_year);

alter table regions enable row level security;
alter table apartments enable row level security;
alter table apartment_aliases enable row level security;

create policy "public read" on regions for select using (true);
create policy "public read" on apartments for select using (true);
create policy "public read" on apartment_aliases for select using (true);

create or replace function apartments_in_bbox(
  min_lat float8, min_lng float8, max_lat float8, max_lng float8, mode text, max_rows int
) returns setof apartments language sql stable as $$
  select * from apartments
  where lat between min_lat and max_lat
    and lng between min_lng and max_lng
    and ((mode = 'rent' and latest_jeonse_deposit is not null)
      or (mode <> 'rent' and latest_trade_amount is not null))
  order by trade_count desc
  limit max_rows
$$;

grant execute on function apartments_in_bbox to anon, authenticated;
