import { describe, expect, it } from "vitest";
import { cn } from "../../src/lib/utils";


describe("cn utility", () => {
  it("merges class names using clsx and tailwind-merge", () => {
    expect(cn("px-2", "py-3")).toBe("px-2 py-3");
  });

  it("handles conditional class values — truthy", () => {
    const condition = true;
    expect(cn("base", condition && "active")).toBe("base active");
  });

  it("handles conditional class values — falsy", () => {
    const condition = false;
    expect(cn("base", condition && "active")).toBe("base");
  });

  it("resolves conflicts — later class wins for same tailwind utility", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("resolves conflicts — tailwind-merge handles shorthands", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  it("handles arrays of class inputs", () => {
    expect(cn(["px-2", "py-3"], "bg-red-500")).toBe("px-2 py-3 bg-red-500");
  });

  it("handles mixed inputs — strings, arrays, and objects", () => {
    expect(
      cn("base", ["conditional"], { "bg-blue-500": true, "bg-red-500": false }),
    ).toBe("base conditional bg-blue-500");
  });

  it("handles empty inputs gracefully", () => {
    expect(cn()).toBe("");
    expect(cn("", null, undefined, false)).toBe("");
  });

  it("preserves non-conflicting classes", () => {
    expect(cn("flex", "items-center", "justify-between")).toBe(
      "flex items-center justify-between",
    );
  });

  it("handles tailwind merge groups correctly", () => {
    // text-red-500 and text-lg are in different merge groups, both should be kept
    expect(cn("text-red-500", "text-lg")).toBe("text-red-500 text-lg");
  });

  it("overrides with data attributes and aria classes", () => {
    expect(cn("focus:ring-2", "focus:ring-4")).toBe("focus:ring-4");
  });

  it("handles dark mode variants", () => {
    expect(cn("bg-white", "dark:bg-black")).toBe("bg-white dark:bg-black");
  });

  it("handles responsive variants", () => {
    expect(cn("text-sm", "md:text-base", "lg:text-lg")).toBe(
      "text-sm md:text-base lg:text-lg",
    );
  });
});
