import { afterEach, describe, expect, test, vi } from "vitest";
import { guard, upstreamError } from "@/lib/apiResponse";

afterEach(() => vi.restoreAllMocks());

describe("guard", () => {
  test("던져진 오류를 로그에 남기고, 응답에는 노출하지 않는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("SUPABASE_URL is not set"), { code: "ENV" });
    const res = await guard(async () => {
      throw err;
    });
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain("SUPABASE_URL");
    expect(JSON.parse(body)).toEqual({ error: { code: "upstream", message: "internal error" } });
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0].join(" "))).toContain("SUPABASE_URL is not set");
    expect(String(spy.mock.calls[0].join(" "))).toContain("ENV");
  });
});

describe("upstreamError", () => {
  test("Supabase 오류의 message·code 를 로그에 남기고 일반 메시지로 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = upstreamError("search failed", { message: 'relation "apartments" does not exist', code: "42P01" });
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain("42P01");
    expect(JSON.parse(body)).toEqual({ error: { code: "upstream", message: "search failed" } });
    const logged = spy.mock.calls[0].join(" ");
    expect(logged).toContain("search failed");
    expect(logged).toContain("42P01");
    expect(logged).toContain('relation "apartments" does not exist');
  });
});
