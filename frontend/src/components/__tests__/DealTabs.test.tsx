import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import DealTabs from "../DealTabs";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const setSearch = (q: string) => window.history.replaceState(null, "", q ? `/?${q}` : "/");

beforeEach(() => {
  replace.mockReset();
  setSearch("");
});

const panels = { trade: <p>매매 내용</p>, jeonse: <p>전세 내용</p>, wolse: <p>월세 내용</p> };
const empty = { jeonse: false, wolse: false };

describe("DealTabs", () => {
  test("기본은 매매 탭", () => {
    render(<DealTabs panels={panels} empty={empty} />);
    expect(screen.getByRole("tab", { name: "매매" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("매매 내용")).toBeInTheDocument();
    expect(screen.queryByText("전세 내용")).not.toBeInTheDocument();
  });

  test("전세 클릭 시 ?tab=jeonse로 replace(스크롤 유지)하고 전세를 보여준다", async () => {
    render(<DealTabs panels={panels} empty={empty} />);
    await userEvent.click(screen.getByRole("tab", { name: "전세" }));
    expect(replace).toHaveBeenCalledWith("?tab=jeonse", { scroll: false });
    expect(screen.getByText("전세 내용")).toBeInTheDocument();
  });

  test("서버 렌더는 URL과 관계없이 매매 패널을 HTML에 담는다(ISR)", () => {
    setSearch("tab=wolse");
    const html = renderToString(<DealTabs panels={panels} empty={empty} />);
    expect(html).toContain("매매 내용");
    expect(html).not.toContain("월세 내용");
  });

  test("URL의 tab 값을 따른다", () => {
    setSearch("tab=wolse");
    render(<DealTabs panels={panels} empty={empty} />);
    expect(screen.getByText("월세 내용")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "월세" })).toHaveAttribute("aria-selected", "true");
  });

  test("알 수 없는 tab 값은 매매", () => {
    setSearch("tab=bogus");
    render(<DealTabs panels={panels} empty={empty} />);
    expect(screen.getByText("매매 내용")).toBeInTheDocument();
  });

  test("데이터가 없는 탭은 비활성(보이되 '거래 없음')이고 눌러도 이동하지 않는다", async () => {
    render(<DealTabs panels={panels} empty={{ ...empty, wolse: true }} />);
    const tab = screen.getByRole("tab", { name: "월세" });
    expect(tab).toBeDisabled();
    expect(tab).toHaveAttribute("title", "거래 없음");
    await userEvent.click(tab);
    expect(replace).not.toHaveBeenCalled();
  });

  test("비어 있는 탭을 URL로 직접 열면 매매로 되돌린다", () => {
    setSearch("tab=jeonse");
    render(<DealTabs panels={panels} empty={{ ...empty, jeonse: true }} />);
    expect(screen.getByText("매매 내용")).toBeInTheDocument();
  });
});
