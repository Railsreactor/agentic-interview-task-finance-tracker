import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button, buttonVariants } from "../../src/components/ui/button";


describe("Button component", () => {
  it("renders a button element by default", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("renders with default variant (default)", () => {
    const { container } = render(<Button>Default</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-variant", "default");
  });

  it("renders with destructive variant", () => {
    const { container } = render(<Button variant="destructive">Delete</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-variant", "destructive");
  });

  it("renders with outline variant", () => {
    const { container } = render(<Button variant="outline">Outline</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-variant", "outline");
  });

  it("renders with secondary variant", () => {
    const { container } = render(<Button variant="secondary">Secondary</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-variant", "secondary");
  });

  it("renders with ghost variant", () => {
    const { container } = render(<Button variant="ghost">Ghost</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-variant", "ghost");
  });

  it("renders with link variant", () => {
    const { container } = render(<Button variant="link">Link</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-variant", "link");
  });

  it("renders with default size", () => {
    const { container } = render(<Button>Default Size</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-size", "default");
  });

  it("renders with xs size", () => {
    const { container } = render(<Button size="xs">XS</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-size", "xs");
  });

  it("renders with sm size", () => {
    const { container } = render(<Button size="sm">Small</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-size", "sm");
  });

  it("renders with lg size", () => {
    const { container } = render(<Button size="lg">Large</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-size", "lg");
  });

  it("renders with icon size", () => {
    const { container } = render(<Button size="icon" aria-label="Icon">+</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-size", "icon");
  });

  it("renders with icon-xs size", () => {
    const { container } = render(<Button size="icon-xs" aria-label="Icon XS">+</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-size", "icon-xs");
  });

  it("renders with icon-sm size", () => {
    const { container } = render(<Button size="icon-sm" aria-label="Icon SM">+</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-size", "icon-sm");
  });

  it("renders with icon-lg size", () => {
    const { container } = render(<Button size="icon-lg" aria-label="Icon LG">+</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-size", "icon-lg");
  });

  it("applies custom className", () => {
    const { container } = render(<Button className="custom-class">Custom</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveClass("custom-class");
  });

  it("passes through data-slot attribute", () => {
    const { container } = render(<Button>Slot</Button>);
    const button = container.querySelector("button");
    expect(button).toHaveAttribute("data-slot", "button");
  });

  it("passes through additional props", () => {
    render(<Button data-testid="my-btn" disabled type="button">Disabled</Button>);
    expect(screen.getByTestId("my-btn")).toBeDisabled();
  });

  it("renders children correctly", () => {
    render(<Button>Submit Form</Button>);
    expect(screen.getByRole("button", { name: /submit form/i })).toBeInTheDocument();
  });
});

describe("buttonVariants", () => {
  it("returns base cva classes", () => {
    const result = buttonVariants({ variant: "default", size: "default" });
    expect(result).toContain("inline-flex");
    expect(result).toContain("items-center");
    expect(result).toContain("justify-center");
  });

  it("returns destructive variant classes", () => {
    const result = buttonVariants({ variant: "destructive" });
    expect(result).toContain("bg-destructive");
    expect(result).toContain("text-white");
  });

  it("returns outline variant classes", () => {
    const result = buttonVariants({ variant: "outline" });
    expect(result).toContain("border");
    expect(result).toContain("bg-background");
  });

  it("returns icon size classes", () => {
    const result = buttonVariants({ size: "icon" });
    expect(result).toContain("size-9");
  });

  it("merges custom className with variant classes", () => {
    const result = buttonVariants({ variant: "default", className: "custom" });
    expect(result).toContain("inline-flex");
    expect(result).toContain("custom");
  });
});
