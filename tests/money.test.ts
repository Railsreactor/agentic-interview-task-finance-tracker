import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decimalToMinor,
  formatMinor,
  formatMoney,
  minorToInputValue,
  parseAmountToMinor,
} from "#/lib/money";
import { normalizeAmountMinor, rowHash } from "#/server/imports.functions";

describe("money", () => {
  it("parseAmountToMinor parses decimal strings to minor units", () => {
    expect(parseAmountToMinor("12.34")).toBe(1234);
    expect(parseAmountToMinor("12")).toBe(1200);
    expect(parseAmountToMinor("12.3")).toBe(1230);
    expect(parseAmountToMinor("-12.34")).toBe(-1234);
    expect(parseAmountToMinor("+12.34")).toBe(1234);
    expect(parseAmountToMinor("0.05")).toBe(5);
    expect(parseAmountToMinor(".5")).toBe(50);
  });

  it("parseAmountToMinor handles European formats and currency symbols", () => {
    expect(parseAmountToMinor("12,34")).toBe(1234);
    expect(parseAmountToMinor("-1 234,56")).toBe(-123456);
    expect(parseAmountToMinor("1,234.56")).toBe(123456);
    expect(parseAmountToMinor("12.34 zł")).toBe(1234);
    expect(parseAmountToMinor("$12.34")).toBe(1234);
    expect(parseAmountToMinor("12.34 PLN")).toBe(1234);
  });

  it("parseAmountToMinor rejects invalid input and rounds extra digits", () => {
    expect(parseAmountToMinor("")).toBeNull();
    expect(parseAmountToMinor("abc")).toBeNull();
    expect(parseAmountToMinor("1.2.3")).toBeNull();
    expect(parseAmountToMinor("--5")).toBeNull();
    // half-up rounding on the 3rd fraction digit
    expect(parseAmountToMinor("1.005")).toBe(101);
    expect(parseAmountToMinor("1.004")).toBe(100);
    // the classic float trap: 0.1 + 0.2 style values parse exactly
    expect(parseAmountToMinor("0.29")).toBe(29);
    expect(parseAmountToMinor("19.99")).toBe(1999);
  });

  it("formatMinor matches legacy toFixed(2) output", () => {
    expect(formatMinor(1234)).toBe("12.34");
    expect(formatMinor(-1234)).toBe("-12.34");
    expect(formatMinor(0)).toBe("0.00");
    expect(formatMinor(5)).toBe("0.05");
    expect(formatMinor(-5)).toBe("-0.05");
    expect(formatMinor(100000000)).toBe("1000000.00");
    expect(() => formatMinor(12.5)).toThrow();
  });

  it("formatMoney appends the currency code", () => {
    expect(formatMoney(1234, "PLN")).toBe("12.34 PLN");
    expect(formatMoney(1234)).toBe("12.34");
    expect(formatMoney(1234, null)).toBe("12.34");
  });

  it("decimalToMinor converts decimals with explicit rounding", () => {
    expect(decimalToMinor(12.34)).toBe(1234);
    expect(decimalToMinor(0.1 + 0.2)).toBe(30);
    expect(decimalToMinor(19.99)).toBe(1999);
    expect(decimalToMinor(0)).toBe(0);
    expect(() => decimalToMinor(Number.NaN)).toThrow();
  });

  it("minorToInputValue is the display-only inverse of parseAmountToMinor", () => {
    expect(minorToInputValue(1234)).toBe(12.34);
    expect(parseAmountToMinor(String(minorToInputValue(1999)))).toBe(1999);
  });

  it("rowHash output is unchanged from the float era (dedup stability)", () => {
    // The float implementation hashed `${date}|${amount.toFixed(2)}|${desc}`.
    // These golden values were computed with the float-era formula; if they
    // change, previously imported rows stop deduplicating against re-imports.
    expect(rowHash("2025-01-15T00:00:00", 1999, "COFFEE")).toBe(
      "92bc35b48378e885",
    );
    expect(rowHash("2025-01-15T00:00:00", -123450, "BIEDRONKA 123")).toBe(
      "ec22105f1a6c54a2",
    );
    // Differs when any component differs
    expect(rowHash("2025-01-15T00:00:00", 2000, "COFFEE")).not.toBe(
      "92bc35b48378e885",
    );
  });

  it("normalizeAmountMinor delegates to the shared parser", () => {
    expect(normalizeAmountMinor("-1 234,56")).toBe(-123456);
    expect(normalizeAmountMinor("")).toBeNull();
  });

  it("grep gate: no float money columns or float formatting in app code", () => {
    const schema = readFileSync("src/db/schema.ts", "utf8");
    // Money columns must never be declared as real (IEEE float).
    expect(schema).not.toMatch(
      /real\(\s*"(amount|unit_price|total_price|total)/,
    );

    // No route may format or parse money with float APIs; all money
    // formatting goes through src/lib/money.ts.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(dir, entry.name))
          : [join(dir, entry.name)],
      );
    for (const file of walk("src/routes")) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      const content = readFileSync(file, "utf8");
      expect
        .soft(content, `${file} must not use toFixed on money`)
        .not.toMatch(/\.toFixed\(/);
      expect
        .soft(content, `${file} must not parse money with parseFloat`)
        .not.toMatch(/parseFloat\(/);
    }
  });
});
