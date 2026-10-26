import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import AreaLabel from "../AreaLabel";
import AreaUnitToggle from "../AreaUnitToggle";

const ui = () => (
  <>
    <AreaUnitToggle />
    <AreaLabel m2={84.88} />
  </>
);

describe("AreaUnitToggle", () => {
  test("평이 기본 선택된 radiogroup", () => {
    render(<AreaUnitToggle />);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "평" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "㎡" })).toHaveAttribute("aria-checked", "false");
  });

  test("클릭하면 단위가 바뀌고 다른 구독 컴포넌트도 즉시 갱신", async () => {
    render(ui());
    expect(screen.getByText("전용 25평 (84㎡)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "㎡" }));
    expect(screen.getByRole("radio", { name: "㎡" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("84㎡ (전용 25평)")).toBeInTheDocument();
    expect(localStorage.getItem("areaUnit")).toBe("m2");
  });

  test("저장된 ㎡로 SSR 하이드레이션해도 오류 없이 ㎡로 바뀐다", async () => {
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const { act } = await import("react");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const errors: unknown[] = [];
    const spy = (await import("vitest")).vi.spyOn(console, "error").mockImplementation((...a) => void errors.push(a));
    const html = renderToString(<AreaLabel m2={84.88} />); // 서버: 저장소를 모르므로 평
    expect(html).toContain("전용 25평 (84㎡)");
    localStorage.setItem("areaUnit", "m2");
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    await act(async () => {
      hydrateRoot(el, <AreaLabel m2={84.88} />, { onRecoverableError: (e) => errors.push(e) });
    });
    expect(el.textContent).toBe("84㎡ (전용 25평)");
    expect(errors).toEqual([]);
    spy.mockRestore();
    el.remove();
  });
});
