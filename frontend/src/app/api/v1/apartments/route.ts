import { applyFilters, PAGE_SIZE, parseApartmentFilters, type FilterableQuery } from "@/lib/filters";
import { supabaseServer } from "@/lib/supabase/server";
import { guard, ok, upstreamError } from "@/lib/apiResponse";

const COLUMNS =
  "id,name,dong,lawd_cd,build_year,latest_trade_amount,latest_trade_date,trade_count,jeonse_ratio,lat,lng";

export function GET(req: Request) {
  return guard(() => handle(req));
}

async function handle(req: Request) {
  const f = parseApartmentFilters(new URL(req.url).searchParams);
  const from = (f.page - 1) * PAGE_SIZE;
  let q = supabaseServer().from("apartments").select(COLUMNS, { count: "exact" });
  // Cast: the generated builder type is too deep for generic chaining (TS2589).
  q = applyFilters(q as unknown as FilterableQuery, f) as unknown as typeof q;
  const { data, error, count } = await q.range(from, from + PAGE_SIZE - 1);
  if (error) return upstreamError("failed to load apartments", error);
  return ok({ items: data ?? [], page: f.page, total: count ?? 0 });
}
