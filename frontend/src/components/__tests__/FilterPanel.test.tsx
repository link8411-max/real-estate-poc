import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import FilterPanel from "../FilterPanel";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/map",
  useSearchParams: () => search,
}));

/** 마지막 replace 호출의 쿼리 */
const lastQuery = () => {
  const [href, opts] = replace.mock.calls.at(-1)!;
  expect(opts).toEqual({ scroll: false });
  const u = new URL(href, "http://x");
  expect(u.pathname).toBe("/map");
  return Object.fromEntries(u.searchParams);
};

beforeEach(() => {
  replace.mockReset();
  search = new URLSearchParams("lat=37.5&lng=127&level=6");
});

describe("FilterPanel", () => {
  test("전세 선택 시 mode=rent, 기존 쿼리(지도 위치)는 유지", async () => {
    render(<FilterPanel />);
    await userEvent.click(screen.getByRole("radio", { name: "전세" }));
    expect(lastQuery()).toEqual({ lat: "37.5", lng: "127", level: "6", mode: "rent" });
  });

  test("매매로 돌아가면 mode를 지운다", async () => {
    search = new URLSearchParams("mode=rent");
    render(<FilterPanel />);
    expect(screen.getByRole("radio", { name: "전세" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "매매" }));
    expect(lastQuery()).toEqual({});
  });

  test("가격대 최소/최대 선택은 만원으로 반영", () => {
    render(<FilterPanel />);
    fireEvent.change(screen.getByLabelText("최소 가격"), { target: { value: "50000" } });
    expect(lastQuery()).toMatchObject({ minPrice: "50000" });
    fireEvent.change(screen.getByLabelText("최대 가격"), { target: { value: "300000" } });
    expect(lastQuery()).toMatchObject({ maxPrice: "300000" });
    expect(screen.getByLabelText("최대 가격")).toHaveTextContent("30억");
  });

  test("섹션 제목은 매매에서 '가격대 (매매가)', 전세에서 '보증금 (전세)'", () => {
    const { unmount } = render(<FilterPanel />);
    expect(screen.getByText("가격대 (매매가)")).toBeInTheDocument();
    unmount();
    search = new URLSearchParams("mode=rent");
    render(<FilterPanel />);
    expect(screen.getByText("보증금 (전세)")).toBeInTheDocument();
  });

  test("최소보다 낮은 최대 가격 선택지는 비활성화", () => {
    search = new URLSearchParams("minPrice=100000");
    render(<FilterPanel />);
    const max = screen.getByLabelText("최대 가격");
    const opt = (sel: HTMLElement, label: string) =>
      [...sel.querySelectorAll("option")].find((o) => o.textContent === label)!;
    expect(opt(max, "7억")).toBeDisabled();
    expect(opt(max, "10억")).not.toBeDisabled();
    expect(opt(max, "15억")).not.toBeDisabled();
  });

  test("최소를 현재 최대보다 높게 고르면 두 값을 바꾼다", () => {
    search = new URLSearchParams("maxPrice=50000");
    render(<FilterPanel />);
    fireEvent.change(screen.getByLabelText("최소 가격"), { target: { value: "100000" } });
    expect(lastQuery()).toMatchObject({ minPrice: "50000", maxPrice: "100000" });
  });

  test("가격 '전체'를 고르면 해당 파라미터를 지운다", () => {
    search = new URLSearchParams("minPrice=50000");
    render(<FilterPanel />);
    expect(screen.getByLabelText("최소 가격")).toHaveValue("50000");
    fireEvent.change(screen.getByLabelText("최소 가격"), { target: { value: "" } });
    expect(lastQuery()).not.toHaveProperty("minPrice");
  });

  test("평 단위: 30평대 → minArea=99&maxArea=131, ~20평 → maxArea=65만", async () => {
    render(<FilterPanel />);
    await userEvent.click(screen.getByRole("button", { name: "30평대" }));
    expect(lastQuery()).toMatchObject({ minArea: "99", maxArea: "131" });
    await userEvent.click(screen.getByRole("button", { name: "~20평" }));
    const q = lastQuery();
    expect(q.maxArea).toBe("65");
    expect(q).not.toHaveProperty("minArea");
  });

  test("㎡ 단위: 라벨은 ㎡, 보내는 값은 같은 ㎡ 경계", async () => {
    localStorage.setItem("areaUnit", "m2");
    render(<FilterPanel />);
    await userEvent.click(screen.getByRole("button", { name: "132㎡+" }));
    const q = lastQuery();
    expect(q.minArea).toBe("132");
    expect(q).not.toHaveProperty("maxArea");
  });

  test("선택된 평형 프리셋을 다시 누르면 해제", async () => {
    search = new URLSearchParams("minArea=66&maxArea=98");
    render(<FilterPanel />);
    const btn = screen.getByRole("button", { name: "20평대" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(btn);
    const q = lastQuery();
    expect(q).not.toHaveProperty("minArea");
    expect(q).not.toHaveProperty("maxArea");
  });

  test("준공 10년 이내 → builtFrom = 올해 − 10", async () => {
    render(<FilterPanel />);
    await userEvent.click(screen.getByRole("button", { name: "10년 이내" }));
    expect(lastQuery()).toMatchObject({ builtFrom: String(new Date().getFullYear() - 10) });
  });

  test("모바일 시트 바에 활성 필터 수를 보여주고 탭하면 펼친다", async () => {
    search = new URLSearchParams("minPrice=50000&minArea=66&maxArea=98");
    render(<FilterPanel />);
    const bar = screen.getByRole("button", { name: /필터 2/ });
    expect(bar).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "true");
  });

  test("초기화는 필터만 지우고 지도 위치는 유지", async () => {
    search = new URLSearchParams("lat=37.5&mode=rent&minPrice=50000&builtFrom=2016");
    render(<FilterPanel />);
    await userEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(lastQuery()).toEqual({ lat: "37.5" });
  });
});
