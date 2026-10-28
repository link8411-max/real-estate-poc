import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import ShareButton from "../ShareButton";

vi.mock("@/lib/kakao", async (orig) => ({ ...(await orig<typeof import("@/lib/kakao")>()), shareKakao: vi.fn(async () => false) }));

const meta = { title: "잠실엘스 실거래가", description: "최근 매매 33억", url: "https://x/apartment/1554", imageUrl: "https://x/api/og/1554" };

describe("ShareButton", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("기기 공유창이 있으면 그걸 쓴다", async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    render(<ShareButton aptId={1554} meta={meta} />);
    await userEvent.click(screen.getByRole("button", { name: "공유" }));
    expect(share).toHaveBeenCalledWith({ title: meta.title, text: meta.description, url: meta.url });
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });

  test("공유창·카카오가 모두 안 되면 링크를 복사하고 알려준다", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<ShareButton aptId={1554} meta={meta} />);
    await user.click(screen.getByRole("button", { name: "공유" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(meta.url));
    expect(await screen.findByRole("button", { name: "링크 복사됨" })).toBeInTheDocument();
  });
});
