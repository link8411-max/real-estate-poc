import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { SearchIndexRow } from "@/lib/types";
import SearchPanel from "../SearchPanel";

const rows: SearchIndexRow[] = [
  [10, "삼성래미안", "역삼동", "11680", 2000],
  [11, "삼성래미안", "사당동", "11590", 1998],
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("q=삼성래미안"),
}));
vi.mock("@/lib/data", () => ({ fetchSearchIndex: () => Promise.resolve(rows) }));

describe("SearchPanel", () => {
  test("같은 이름 단지를 시군구로 구분해 보여준다", async () => {
    render(<SearchPanel />);
    const links = await screen.findAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent("서울 강남구 · 역삼동 · 2000년");
    expect(links[1]).toHaveTextContent("서울 동작구 · 사당동 · 1998년");
    expect(links[0]).toHaveAttribute("href", "/apartment/10");
  });
});
