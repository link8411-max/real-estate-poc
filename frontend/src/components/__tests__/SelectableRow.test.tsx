import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import SelectableRow from "../SelectableRow";

const setup = (selected = false) => {
  const onSelect = vi.fn();
  render(
    <table>
      <tbody>
        <SelectableRow selected={selected} onSelect={onSelect}>
          <td>행</td>
        </SelectableRow>
      </tbody>
    </table>,
  );
  return { onSelect, row: screen.getByRole("row") };
};

describe("SelectableRow", () => {
  test("클릭하면 onSelect", async () => {
    const { onSelect, row } = setup();
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test("Enter·Space로도 선택", async () => {
    const { onSelect, row } = setup();
    row.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  test("aria-selected 반영", () => {
    expect(setup(true).row).toHaveAttribute("aria-selected", "true");
  });
});
