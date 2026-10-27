import { escapeLike, MAX_QUERY_LENGTH } from "@/lib/filters";
import { supabaseServer } from "@/lib/supabase/server";
import { fail, guard, ok } from "@/lib/apiResponse";

export function GET(req: Request) {
  return guard(() => handle(req));
}

async function handle(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const pattern = escapeLike(q);
  if (!pattern) return ok({ items: [] });
  const { data, error } = await supabaseServer()
    .from("apartments")
    .select("id,name,dong,lawd_cd,build_year")
    .ilike("name", `%${pattern}%`)
    .limit(20);
  if (error) return fail(500, "upstream", "search failed");
  return ok({ items: data ?? [] });
}
