import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ZONE_DISCLAIMER } from "@/lib/redevelopment";
import { SAMPLE_ZONES } from "@/test/zones.fixture";
import ZonePreviewCard from "../ZonePreviewCard";

afterEach(cleanup);
const byId = (id: string) => SAMPLE_ZONES.find((z) => z.zone_id === id)!;

describe("ZonePreviewCard", () => {
  test("이름·유형·단계·세대수·사업시행자·안내 문구", () => {
    render(<ZonePreviewCard zone={byId("z002")} onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "잠실주공5단지" })).toBeTruthy();
    expect(screen.getByText("재건축(공동주택)")).toBeTruthy();
    expect(screen.getByText("재건축 · 관리처분인가")).toBeTruthy();
    expect(screen.getByText("6,491세대")).toBeTruthy();
    expect(screen.getByText("조합")).toBeTruthy();
    expect(screen.getByText(ZONE_DISCLAIMER)).toBeTruthy();
  });

  test("카드 위치는 단지 미리보기 카드와 같은 슬롯", () => {
    render(<ZonePreviewCard zone={byId("z002")} onClose={() => {}} />);
    const cls = screen.getByRole("region").className;
    for (const c of ["absolute", "inset-x-3", "bottom-14", "md:right-4", "md:bottom-8", "md:w-[360px]", "overflow-y-auto"]) expect(cls).toContain(c);
  });

  test("매칭 단지 링크와 목록 링크", () => {
    render(<ZonePreviewCard zone={byId("z002")} onClose={() => {}} />);
    expect(screen.getAllByRole("link", { name: /주공\d단지 보기/ }).map((a) => a.getAttribute("href"))).toEqual(["/apartment/102", "/apartment/103"]);
    expect(screen.getByRole("link", { name: /목록에서 보기/ }).getAttribute("href")).toBe("/redevelopment#zone-z002");
  });

  test("apt_names 가 없는 옛 파일이면 일반 문구로", () => {
    render(<ZonePreviewCard zone={{ ...byId("z002"), apt_names: undefined }} onClose={() => {}} />);
    expect(screen.getByRole("link", { name: "단지 1 보기 ›" })).toBeTruthy();
  });

  test("동 단위 대략 위치면 안내를 보여준다, 정확한 위치면 없다", () => {
    const { unmount } = render(<ZonePreviewCard zone={byId("z004")} onClose={() => {}} />);
    expect(screen.getByText("위치는 동 단위 대략")).toBeTruthy();
    unmount();
    render(<ZonePreviewCard zone={byId("z003")} onClose={() => {}} />);
    expect(screen.queryByText("위치는 동 단위 대략")).toBeNull();
  });

  test("세대수 null 은 -, 사업시행자 없으면 -", () => {
    render(<ZonePreviewCard zone={byId("z004")} onClose={() => {}} />);
    expect(screen.getAllByText("-")).toHaveLength(2);
  });

  test("닫기 버튼·Escape, 높이 보고", () => {
    const onClose = vi.fn();
    const onHeight = vi.fn();
    render(<ZonePreviewCard zone={byId("z003")} onClose={onClose} onHeight={onHeight} />);
    expect(onHeight).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("단정 표현 없음", () => {
    const { container } = render(<ZonePreviewCard zone={byId("z003")} onClose={() => {}} />);
    expect(container.textContent).not.toMatch(/투자 추천|호재/);
  });
});
