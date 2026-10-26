import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SearchBox from "../SearchBox";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

beforeEach(() => push.mockReset());

describe("SearchBox", () => {
  test("입력할 때마다 onChange로 현재 검색어를 알린다", async () => {
    const onChange = vi.fn();
    render(<SearchBox onChange={onChange} />);
    await userEvent.type(screen.getByRole("searchbox"), "래미안");
    expect(onChange).toHaveBeenLastCalledWith("래미안");
    expect(screen.getByRole("searchbox")).toHaveValue("래미안");
  });

  test("defaultValue로 시작한다", () => {
    render(<SearchBox defaultValue="ㄹㅁㅇ" onChange={() => {}} />);
    expect(screen.getByRole("searchbox")).toHaveValue("ㄹㅁㅇ");
  });

  test("onChange가 없으면 Enter로 검색 페이지로 이동", async () => {
    render(<SearchBox />);
    await userEvent.type(screen.getByRole("searchbox"), " 잠실 엘스 {Enter}");
    expect(push).toHaveBeenCalledWith(`/search?q=${encodeURIComponent("잠실 엘스")}`);
  });

  test("빈 검색어는 이동하지 않는다", async () => {
    render(<SearchBox />);
    await userEvent.type(screen.getByRole("searchbox"), "   {Enter}");
    expect(push).not.toHaveBeenCalled();
  });

  test("onChange가 있으면 Enter로 이동하지 않는다", async () => {
    render(<SearchBox onChange={() => {}} />);
    await userEvent.type(screen.getByRole("searchbox"), "반포{Enter}");
    expect(push).not.toHaveBeenCalled();
  });
});
