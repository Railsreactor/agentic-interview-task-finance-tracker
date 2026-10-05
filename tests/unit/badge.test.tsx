import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, badgeVariants } from "../../src/components/ui/badge";


describe("Badge component", () => {
  it("renders a span element by default", () => {
    render(<Badge>Badge</Badge>);
    expect(screen.getByText("Badge")).toBeInTheDocument();
  });

  it("renders with default variant", () => {
    const { container } = render(<Badge>Default</Badge>);
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "default");
  });

  it("renders with secondary variant", () => {
    const { container } = render(<Badge variant="secondary">Secondary</Badge>);
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "secondary");
  });

  it("renders with destructive variant", () => {
    const { container } = render(<Badge variant="destructive">Error</Badge>);
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "destructive");
  });

  it("renders with outline variant", () => {
    const { container } = render(<Badge variant="outline">Outline</Badge>);
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "outline");
  });

  it("renders with ghost variant", () => {
    const { container } = render(<Badge variant="ghost">Ghost</Badge>);
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "ghost");
  });

  it("renders with link variant", () => {
    const { container } = render(<Badge variant="link">Link</Badge>);
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "link");
  });

  it("applies custom className", () => {
    const { container } = render(<Badge className="custom-badge">Custom</Badge>);
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveClass("custom-badge");
  });

  it("passes through data-slot attribute", () => {
    const { container } = render(<Badge>Slot</Badge>);
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-slot", "badge");
  });

  it("passes through additional props", () => {
    render(<Badge data-testid="my-badge">Tested</Badge>);
    expect(screen.getByTestId("my-badge")).toBeInTheDocument();
  });

  it("renders children correctly", () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText("New")).toBeInTheDocument();
  });
});

describe("badgeVariants", () => {
  it("returns base cva classes", () => {
    const result = badgeVariants({ variant: "default" });
    expect(result).toContain("inline-flex");
    expect(result).toContain("shrink-0");
    expect(result).toContain("rounded-full");
  });

  it("returns default variant classes", () => {
    const result = badgeVariants({ variant: "default" });
    expect(result).toContain("bg-primary");
    expect(result).toContain("text-primary-foreground");
  });

  it("returns destructive variant classes", () => {
    const result = badgeVariants({ variant: "destructive" });
    expect(result).toContain("bg-destructive");
    expect(result).toContain("text-white");
  });

  it("returns outline variant classes", () => {
    const result = badgeVariants({ variant: "outline" });
    expect(result).toContain("border-border");
    expect(result).toContain("text-foreground");
  });

  it("merges custom className with variant classes", () => {
    const result = badgeVariants({ variant: "default", className: "custom" });
    expect(result).toContain("inline-flex");
    expect(result).toContain("custom");
  });
});
