const CACHE = "public, s-maxage=300";

export function ok(body: unknown): Response {
  return Response.json(body, { headers: { "Cache-Control": CACHE } });
}

export function fail(status: 400 | 500, code: "bad_request" | "upstream", message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

/** 서버 로그용 요약: message + code (Supabase PostgrestError, Error, 그 외). 응답에는 넣지 않는다. */
function describe(err: unknown): string {
  if (err && typeof err === "object") {
    const { message, code } = err as { message?: unknown; code?: unknown };
    return `${String(message ?? err)}${code != null ? ` (code=${String(code)})` : ""}`;
  }
  return String(err);
}

/** Supabase 오류 등 upstream 실패: 원인은 console.error 로만 남기고 일반 메시지로 500. */
export function upstreamError(message: string, err: unknown): Response {
  console.error(`[api] ${message}:`, describe(err));
  return fail(500, "upstream", message);
}

/** Runs a handler; any thrown error (e.g. missing env) is logged and becomes the standard 500 upstream shape. */
export async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    console.error("[api] unhandled error:", describe(e));
    return fail(500, "upstream", "internal error");
  }
}
