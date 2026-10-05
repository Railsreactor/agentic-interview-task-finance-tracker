import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  Select,
  SelectGroup,
  SelectItem,
} from "../../src/components/ui/select";


describe("Select component", () => {
  it("exposes the combobox role", () => {
    render(
      <Select aria-label="Account">
        <SelectItem value="a">A</SelectItem>
      </Select>,
    );
    expect(screen.getByRole("combobox", { name: "Account" })).toBeInTheDocument();
  });

  it("renders its items as selectable options", () => {
    render(
      <Select aria-label="Account">
        <SelectItem value="a">Main</SelectItem>
        <SelectItem value="b">Savings</SelectItem>
      </Select>,
    );
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("option", { name: "Main" })).toHaveValue("a");
  });

  it("reports the chosen value to onChange", () => {
    let selected = "";
    render(
      <Select
        aria-label="Account"
        value=""
        onChange={(e) => {
          selected = e.target.value;
        }}
      >
        <SelectItem value="">None</SelectItem>
        <SelectItem value="b">Savings</SelectItem>
      </Select>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    expect(selected).toBe("b");
  });

  it("honours the disabled prop", () => {
    render(
      <Select aria-label="Account" disabled>
        <SelectItem value="a">A</SelectItem>
      </Select>,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("groups items under a labelled optgroup", () => {
    render(
      <Select aria-label="Category">
        <SelectGroup label="Groceries">
          <SelectItem value="veg">Vegetables</SelectItem>
        </SelectGroup>
      </Select>,
    );
    expect(screen.getByRole("group", { name: "Groceries" })).toBeInTheDocument();
  });

  it("applies custom className alongside the shared styling", () => {
    const { container } = render(
      <Select className="w-40" aria-label="Account">
        <SelectItem value="a">A</SelectItem>
      </Select>,
    );
    const select = container.querySelector("select");
    expect(select).toHaveClass("w-40");
    expect(select).toHaveAttribute("data-slot", "select");
  });
});
