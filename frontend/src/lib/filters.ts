export const PAGE_SIZE = 50;

export const SORTS = ["latest", "price_desc", "price_asc", "count_desc", "yoy_desc"] as const;
export type ApartmentSort = (typeof SORTS)[number];

export interface ApartmentFilters {
  lawd?: string[];
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  builtFrom?: number;
  builtTo?: number;
  activeMonths?: number;
  sort: ApartmentSort;
  page: number;
}

/** Minimal chainable surface of a Supabase query builder used by applyFilters. */
export interface FilterableQuery {
  eq(column: string, value: unknown): FilterableQuery;
  in(column: string, values: unknown[]): FilterableQuery;
  gte(column: string, value: unknown): FilterableQuery;
  lte(column: string, value: unknown): FilterableQuery;
  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): FilterableQuery;
}

export function parseNumber(sp: URLSearchParams, key: string): number | undefined {
  return num(sp, key);
}

function num(sp: URLSearchParams, key: string): number | undefined {
  const raw = sp.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function parseApartmentFilters(sp: URLSearchParams): ApartmentFilters {
  const f: ApartmentFilters = { sort: "latest", page: 1 };

  const lawd = (sp.get("lawd") ?? "").split(",").filter((c) => /^\d{5}$/.test(c));
  if (lawd.length) f.lawd = lawd;
  const city = sp.get("city")?.trim();
  if (city) f.city = city;

  // Out-of-range / non-integer values are ignored so Postgres never sees them.
  const bounded = {
    minPrice: [0, 10_000_000], maxPrice: [0, 10_000_000],
    minArea: [0, 1000], maxArea: [0, 1000],
    builtFrom: [1900, 2100], builtTo: [1900, 2100],
    activeMonths: [1, 240],
  } as const;
  for (const k of Object.keys(bounded) as (keyof typeof bounded)[]) {
    const n = num(sp, k);
    const [lo, hi] = bounded[k];
    if (n !== undefined && Number.isInteger(n) && n >= lo && n <= hi) f[k] = n;
  }

  const sort = sp.get("sort");
  if (sort && (SORTS as readonly string[]).includes(sort)) f.sort = sort as ApartmentSort;

  const page = num(sp, "page");
  if (page !== undefined && Number.isSafeInteger(page) && page >= 1 && page <= 10000) f.page = page;
  return f;
}

/** YYYY-MM-DD (KST, UTC+9) of `months` months before `now`; day clamped to the target month's last day. */
export function monthsAgoISO(months: number, now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(y, m, Math.min(kst.getUTCDate(), lastDay)));
  return d.toISOString().slice(0, 10);
}

export function applyFilters<Q extends FilterableQuery>(query: Q, f: ApartmentFilters, now: Date = new Date()): Q {
  let q: FilterableQuery = query;
  if (f.lawd?.length) q = q.in("lawd_cd", f.lawd);
  if (f.city) q = q.eq("city", f.city);
  if (f.minPrice !== undefined) q = q.gte("latest_trade_amount", f.minPrice);
  if (f.maxPrice !== undefined) q = q.lte("latest_trade_amount", f.maxPrice);
  if (f.minArea !== undefined) q = q.gte("latest_trade_area", f.minArea);
  if (f.maxArea !== undefined) q = q.lte("latest_trade_area", f.maxArea);
  if (f.builtFrom !== undefined) q = q.gte("build_year", f.builtFrom);
  if (f.builtTo !== undefined) q = q.lte("build_year", f.builtTo);
  if (f.activeMonths !== undefined) q = q.gte("latest_trade_date", monthsAgoISO(f.activeMonths, now));

  // yoy_desc is not available in the table yet: falls back to latest.
  switch (f.sort) {
    case "price_desc":
      q = q.order("latest_trade_amount", { ascending: false, nullsFirst: false });
      break;
    case "price_asc":
      q = q.order("latest_trade_amount", { ascending: true, nullsFirst: false });
      break;
    case "count_desc":
      q = q.order("trade_count", { ascending: false, nullsFirst: false });
      break;
    default:
      q = q.order("latest_trade_date", { ascending: false, nullsFirst: false });
  }
  // Unique tiebreaker so range() paging is stable.
  q = q.order("id", { ascending: true });
  return q as Q;
}

/** Escape LIKE/ILIKE wildcards so user input matches literally. */
export const MAX_QUERY_LENGTH = 100;

export function escapeLike(s: string): string {
  return s.replace(/\*/g, "").replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface Bbox { minLat: number; minLng: number; maxLat: number; maxLng: number }

export function parseBbox(sp: URLSearchParams): { ok: true; bbox: Bbox } | { ok: false; message: string } {
  const out: Partial<Bbox> = {};
  for (const k of ["minLat", "minLng", "maxLat", "maxLng"] as const) {
    const n = num(sp, k);
    if (n === undefined) return { ok: false, message: `${k} is required and must be a number` };
    out[k] = n;
  }
  const b = out as Bbox;
  if (b.minLat > b.maxLat || b.minLng > b.maxLng) return { ok: false, message: "min must not exceed max" };
  return { ok: true, bbox: b };
}
