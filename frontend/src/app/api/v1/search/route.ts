import { escapeLike } from "@/lib/filters";
import { supabaseServer } from "@/lib/supabase/server";
import { fail, ok } from "@/lib/apiResponse";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return ok({ items: [] });
  const { data, error } = await supabaseServer()
    .from("apartments")
    .select("id,name,dong,lawd_cd,build_year")
    .ilike("name", `%${escapeLike(q)}%`)
    .limit(20);
  if (error) return fail(500, "upstream", "search failed");
  return ok({ items: data ?? [] });
}
