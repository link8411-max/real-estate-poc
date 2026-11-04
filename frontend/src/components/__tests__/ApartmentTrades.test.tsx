import { render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { CanceledTx } from "@/lib/canceled";
import ApartmentTrades from "../ApartmentTrades";
import CanceledDeals from "../CanceledDeals";

const item = (id: number): CanceledTx => ({
  id, amount: 120000, area: 84.9, floor: 12, deal_date: "2026-09-10", cancel_date: "2026-10-20",
  cancel_iso: "2026-10-20", prev_max: 110000, is_high: true,
});

afterEach(() => vi.restoreAllMocks());

test("beforeList 를 넣어도 React key 경고가 없다", () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  // 서버 컴포넌트(ApartmentPage)가 넘긴 요소는 Flight 로 역직렬화되며 _store.validated 가 2(키 필요)로 고정된다.
  // 클라이언트의 jsxs 가 1 로 바꾸지 못하게 무시하는 setter 로 흉내 낸다.
  const local = <CanceledDeals items={[item(1), item(2)]} />;
  const before = { ...local, _store: Object.defineProperty({}, "validated", { get: () => 2, set: () => {}, enumerable: false }) };
  Object.defineProperty(before, "_store", { enumerable: false });
  render(<ApartmentTrades stats={[]} transactions={[]} beforeList={before} />);
  const keyWarnings = err.mock.calls.filter((c) => String(c[0]).includes("unique \"key\""));
  expect(keyWarnings).toEqual([]);
});
