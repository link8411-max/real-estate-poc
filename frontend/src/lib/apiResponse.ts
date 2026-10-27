const CACHE = "public, s-maxage=300";

export function ok(body: unknown): Response {
  return Response.json(body, { headers: { "Cache-Control": CACHE } });
}

export function fail(status: 400 | 500, code: "bad_request" | "upstream", message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}
