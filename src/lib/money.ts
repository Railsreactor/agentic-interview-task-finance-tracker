//
// All monetary values in the app are stored and computed as integer minor
// units (grosze/cents). This module owns every conversion between minor units
// and human-readable decimal strings. Nothing outside this module may parse or
// format money, and no monetary value may pass through float arithmetic —
// the only allowed float appearance is the AI/legacy boundary conversion in
// `decimalToMinor`, which rounds explicitly.

/**
 * Parse a user- or CSV-supplied decimal amount string into integer minor
 * units without going through float arithmetic. Strips spaces and common
 * currency symbols; treats "," as the decimal separator when no "." is
 * present (European format). Fractions beyond 2 digits are rounded half-up.
 * Returns null when the input is not a valid amount.
 */
export function parseAmountToMinor(raw: string): number | null {
  const stripped = raw.replace(/\s/g, "").replace(/[A-Za-z$€£zł]/g, "");
  if (!stripped) return null;
  let cleaned = stripped;
  if (!cleaned.includes(".") && cleaned.includes(",")) {
    cleaned = cleaned.replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const match = cleaned.match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
  if (!match) return null;
  const [, sign, intPart, fracPart = ""] = match;
  if (!intPart && !fracPart) return null;
  const frac2 = (fracPart + "00").slice(0, 2);
  let minor = Number(intPart || "0") * 100 + Number(frac2);
  // Round half-up on the third fraction digit.
  if (fracPart.length > 2 && Number(fracPart[2]) >= 5) {
    minor += 1;
  }
  if (!Number.isSafeInteger(minor)) return null;
  return sign === "-" ? -minor : minor;
}

const decimalFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

/**
 * Format integer minor units as a plain decimal string ("12.34", "-0.05").
 * This is byte-identical to the `(amount).toFixed(2)` output the app used
 * when amounts were floats, which keeps import dedup hashes stable.
 */
export function formatMinor(minor: number): string {
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`formatMinor expects a safe integer, got ${minor}`);
  }
  return decimalFormatter.format(minor / 100);
}

/**
 * Format minor units for display together with a currency code,
 * e.g. `formatMoney(1234, "PLN")` → "12.34 PLN".
 */
export function formatMoney(minor: number, currency?: string | null): string {
  const amount = formatMinor(minor);
  return currency ? `${amount} ${currency}` : amount;
}

/**
 * Convert minor units to a decimal number for feeding `<input type="number">`
 * values. Display-only — never use the result in monetary arithmetic; parse
 * the input back with `parseAmountToMinor`.
 */
export function minorToInputValue(minor: number): number {
  return minor / 100;
}

/**
 * Convert a decimal number (from the AI model or legacy stored data) into
 * integer minor units with explicit half-away-from-zero rounding. This is the
 * only sanctioned float→minor conversion; use it exactly at those boundaries.
 */
export function decimalToMinor(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`decimalToMinor expects a finite number, got ${value}`);
  }
  return Math.round(value * 100);
}
