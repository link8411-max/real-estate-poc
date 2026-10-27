export const PAGE_SIZE = 50;

export const SORTS = ["latest", "price_desc", "price_asc", "count_desc", "yoy_desc"] as const;
export type ApartmentSort = (typeof SORTS)[number];

export interface ApartmentFilters {
  /** "rent"이면 가격 범위를 전세 보증금(latest_jeonse_deposit)에 적용한다. 생략 = 매매. */
  mode?: "rent";
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
  or(filters: string): FilterableQuery;
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
  if (sp.get("mode") === "rent") f.mode = "rent";

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

/** PostgREST 필터 문자열에 넣기 전 마지막 방어: 정수가 아니면 던진다. */
function intOnly(n: number): string {
  if (!Number.isSafeInteger(n)) throw new Error(`non-integer filter value: ${n}`);
  return String(n);
}

export function applyFilters<Q extends FilterableQuery>(query: Q, f: ApartmentFilters, now: Date = new Date()): Q {
  let q: FilterableQuery = query;
  if (f.lawd?.length) q = q.in("lawd_cd", f.lawd);
  if (f.city) q = q.eq("city", f.city);
  const priceColumn = f.mode === "rent" ? "latest_jeonse_deposit" : "latest_trade_amount";
  if (f.minPrice !== undefined) q = q.gte(priceColumn, f.minPrice);
  if (f.maxPrice !== undefined) q = q.lte(priceColumn, f.maxPrice);
  if (f.mode === "rent") {
    // 전월세만 있는 단지는 latest_trade_area 가 null — 면적 조건으로 빠지지 않게 null 도 남긴다.
    // or() 문자열은 parseApartmentFilters 가 검증한 정수로만 만든다(사용자 문자열은 절대 넣지 않는다).
    const bounds = [
      f.minArea !== undefined ? `latest_trade_area.gte.${intOnly(f.minArea)}` : null,
      f.maxArea !== undefined ? `latest_trade_area.lte.${intOnly(f.maxArea)}` : null,
    ].filter((b): b is string => b != null);
    if (bounds.length === 1) q = q.or(`latest_trade_area.is.null,${bounds[0]}`);
    if (bounds.length === 2) q = q.or(`latest_trade_area.is.null,and(${bounds.join(",")})`);
  } else {
    if (f.minArea !== undefined) q = q.gte("latest_trade_area", f.minArea);
    if (f.maxArea !== undefined) q = q.lte("latest_trade_area", f.maxArea);
  }
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
