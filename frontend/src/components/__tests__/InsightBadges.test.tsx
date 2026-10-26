import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import InsightBadges from "../InsightBadges";

describe("InsightBadges", () => {
  test("지표가 없으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(<InsightBadges metrics={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("기준을 넘지 않는 지표만 있으면 렌더링하지 않는다", () => {
    const { container } = render(
      <InsightBadges metrics={{ bargain_percent: -4.9, recovery_rate: 80, days_since_last_tx: 179 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("네 가지 배지", () => {
    render(
      <InsightBadges
        metrics={{ bargain_percent: -5, recovery_rate: 65.5, days_since_last_tx: 280, jeonse_ratio: 61.4 }}
      />,
    );
    expect(screen.getByText("급매")).toBeInTheDocument();
    expect(screen.getByText("전고점 대비 -35%")).toBeInTheDocument();
    expect(screen.getByText("거래 없음 280일")).toBeInTheDocument();
    expect(screen.getByText("전세가율 61%")).toBeInTheDocument();
  });

  test("전세가율 0도 표시한다", () => {
    render(<InsightBadges metrics={{ jeonse_ratio: 0 }} />);
    expect(screen.getByText("전세가율 0%")).toBeInTheDocument();
  });
});
