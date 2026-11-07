import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import ShareButton from "../ShareButton";

const meta = { title: "t", description: "d", url: "https://x/highs/1/2", imageUrl: "https://x/api/og/highs/1/2" };

describe("ShareButton", () => {
  test("기본: '공유' 버튼, 이미지 저장 없음", () => {
    render(<ShareButton aptId={1} meta={meta} />);
    expect(screen.getByRole("button", { name: "공유" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "이미지 저장" })).toBeNull();
  });
  test("imageUrl 주면 '이미지 저장' 링크(href·download)", () => {
    render(<ShareButton aptId={1} meta={meta} imageUrl="/api/og/highs/1/2" />);
    const a = screen.getByRole("link", { name: "이미지 저장" });
    expect(a).toHaveAttribute("href", "/api/og/highs/1/2");
    expect(a).toHaveAttribute("download");
  });
  test("compact: 아이콘만, aria-label '이 거래 공유'", () => {
    render(<ShareButton aptId={1} meta={meta} compact />);
    const b = screen.getByRole("button", { name: "이 거래 공유" });
    expect(b.textContent).toBe("");
  });
});
