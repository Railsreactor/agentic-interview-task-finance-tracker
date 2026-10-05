import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Input } from "../../src/components/ui/input";
import { Label } from "../../src/components/ui/label";


describe("Input component", () => {
  it("renders an input element", () => {
    render(<Input data-testid="test-input" />);
    expect(screen.getByTestId("test-input")).toBeInTheDocument();
  });

  it("renders with type email", () => {
    const { container } = render(<Input type="email" />);
    const input = container.querySelector("input");
    expect(input).toHaveAttribute("type", "email");
  });

  it("passes through placeholder prop", () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });

  it("passes through value prop", () => {
    render(<Input value="hello" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("hello");
  });

  it("applies custom className", () => {
    const { container } = render(<Input className="custom-input" />);
    const input = container.querySelector("input");
    expect(input).toHaveClass("custom-input");
  });

  it("passes through data-slot attribute", () => {
    const { container } = render(<Input />);
    const input = container.querySelector("input");
    expect(input).toHaveAttribute("data-slot", "input");
  });

  it("passes through disabled prop", () => {
    render(<Input disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("passes through additional props", () => {
    render(<Input data-testid="my-input" name="username" autoComplete="off" />);
    const input = screen.getByTestId("my-input");
    expect(input).toHaveAttribute("name", "username");
    expect(input).toHaveAttribute("autocomplete", "off");
  });

  it("renders with id prop", () => {
    render(<Input id="email-input" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("id", "email-input");
  });
});

describe("Label component", () => {
  it("renders a label element", () => {
    render(<Label htmlFor="my-input">My Label</Label>);
    expect(screen.getByText("My Label")).toBeInTheDocument();
  });

  it("passes through htmlFor prop", () => {
    render(<Label htmlFor="email">Email</Label>);
    const label = screen.getByText("Email");
    expect(label).toHaveAttribute("for", "email");
  });

  it("applies custom className", () => {
    const { container } = render(<Label className="custom-label">Custom</Label>);
    const label = container.querySelector("[data-slot='label']");
    expect(label).toHaveClass("custom-label");
  });

  it("passes through data-slot attribute", () => {
    const { container } = render(<Label>Slot</Label>);
    const label = container.querySelector("[data-slot='label']");
    expect(label).toHaveAttribute("data-slot", "label");
  });

  it("passes through additional props", () => {
    render(<Label data-testid="my-label">Tested</Label>);
    expect(screen.getByTestId("my-label")).toBeInTheDocument();
  });
});

