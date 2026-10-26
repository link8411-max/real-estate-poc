import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

test("jsdom + testing-library 동작", () => {
  render(<p>안녕</p>);
  expect(screen.getByText("안녕")).toBeInTheDocument();
});
