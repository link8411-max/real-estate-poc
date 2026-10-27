import { applyFilters, parseApartmentFilters, parseBbox, type FilterableQuery } from "@/lib/filters";
import { supabaseServer } from "@/lib/supabase/server";
import { fail, ok } from "@/lib/apiResponse";

const MAP_COLUMNS = "id,name,lat,lng,latest_trade_amount,latest_jeonse_deposit,trade_count,build_year,latest_trade_area";
const MAX_SPAN_DEG = 1.5;
const MAX_ROWS = 500;

interface ModeQuery {
  not(column: string, op: string, value: unknown): ModeQuery;
  limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const parsed = parseBbox(sp);
  if (!parsed.ok) return fail(400, "bad_request", parsed.message);
  const { minLat, minLng, maxLat, maxLng } = parsed.bbox;

  const levelRaw = Number(sp.get("level") ?? "5");
  const level = Number.isFinite(levelRaw) ? levelRaw : 5;
  const mode = sp.get("mode") === "rent" ? "rent" : "trade";
  const db = supabaseServer();

  if (level > 7) {
    const { data, error } = await db
      .from("regions")
      .select("code,name,city,lat,lng,apartment_count,avg_amount")
      .not("lat", "is", null)
      .is("succeeded_by", null)
      .gte("lat", minLat).lte("lat", maxLat)
      .gte("lng", minLng).lte("lng", maxLng);
    if (error) return fail(500, "upstream", "failed to load regions");
    return ok({ type: "regions", items: data ?? [] });
  }

  if (maxLat - minLat > MAX_SPAN_DEG || maxLng - minLng > MAX_SPAN_DEG) {
    return fail(400, "bad_request", `bbox must not span more than ${MAX_SPAN_DEG} degrees at level <= 7`);
  }

  const base = db
    .from("apartments")
    .select(MAP_COLUMNS)
    .gte("lat", minLat).lte("lat", maxLat)
    .gte("lng", minLng).lte("lng", maxLng);
  const filtered = applyFilters(base as unknown as FilterableQuery, { ...parseApartmentFilters(sp), sort: "count_desc" });
  const withMode = filtered as unknown as ModeQuery;
  const modeQ = mode === "rent" ? withMode.not("latest_jeonse_deposit", "is", null) : withMode.not("latest_trade_amount", "is", null);
  // Map markers are always prioritised by trade_count (sort forced above).
  const { data, error } = await modeQ.limit(MAX_ROWS);
  if (error) return fail(500, "upstream", "failed to load apartments");
  return ok({ type: "apartments", items: data ?? [] });
}
