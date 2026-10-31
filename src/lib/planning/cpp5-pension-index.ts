/**
 * CPP-5 EXPERIMENTAL Pension Index (PI) from monthly CPI (CPP Act s.43; Regulations s.75).
 * NOT a production calculation. Nothing in the app, the projection engine or
 * `benefits.ts` may import this module.
 *
 * Sources read directly from Justice Laws on 2026-10-31 (fetch tool quotes in segments):
 * - Act s.43(1): subject to (2), the PI for a year is calculated "in prescribed manner" as
 *   the average CPI over the twelve months ending October 31 of the preceding year.
 * - Act s.43(2): if that is below the preceding year's PI, the PI is the preceding year's.
 * - Act s.43(3): when the CPI is adjusted to a new time or content basis, a corresponding
 *   percentage adjustment is made to all existing PI values at the next calculation.
 * - Regs s.75(1): sum of the monthly CPI for the 12 months ending October 31 of the
 *   preceding year, divided by 12, adjusted to one decimal under s.75(2).
 * - Regs s.75(2): express the quotient to two decimals; drop the second digit if < 5,
 *   otherwise raise the first digit by one and drop the second. Only the second digit
 *   decides, which is the same as half-up rounding to one decimal.
 *
 * Caveat: the Regs s.75(1) text opens "For the purposes of subsection 43(2) of the Act";
 * this module reads that as the prescribed manner of s.43(1). Unverified drafting reading.
 *
 * Fail closed: missing months, malformed CPI, or observations on more than one CPI basis
 * in the window (s.43(3) rebasing is not implemented). All arithmetic is exact BigInt.
 */

export interface PensionIndexInput {
  /** Calendar year whose Pension Index is wanted. */
  readonly year: number;
  /** Monthly CPI keyed "YYYY-MM" (decimal strings or numbers, no exponent notation). */
  readonly cpi: Readonly<Record<string, number | string>>;
  /** CPI basis label per "YYYY-MM"; omitted means all observations share one basis. */
  readonly cpiBasis?: Readonly<Record<string, string>>;
  /** Preceding year's PI (one decimal), for the s.43(2) floor. */
  readonly precedingPensionIndex?: number | string;
}

export interface PensionIndexComputed {
  readonly status: "COMPUTED";
  /** PI as a one-decimal string, e.g. "130.4". */
  readonly pensionIndex: string;
  /** The s.43(1)/Regs 75 value before the s.43(2) floor. */
  readonly calculatedPensionIndex: string;
  /** True when s.43(2) replaced the calculated value with the preceding year's PI. */
  readonly heldAtPrecedingYear: boolean;
  /** Months used, "YYYY-MM", oldest first. */
  readonly window: readonly string[];
}

export interface PensionIndexFailClosed {
  readonly status: "INVALID_INPUT" | "INSUFFICIENT_DATA" | "UNVERIFIED_RULE";
  readonly reason: string;
  readonly citation: string;
}

export type PensionIndexResult = PensionIndexComputed | PensionIndexFailClosed;

const CITE = "CPP Act s.43(1)-(3); CPP Regulations s.75";

const fail = (
  status: PensionIndexFailClosed["status"],
  reason: string,
  citation = CITE,
): PensionIndexFailClosed => ({ status, reason, citation });

/** Decimal as tenths-of-tenths: returns value scaled by 10^scale, or null if not a decimal. */
function parseDecimal(v: number | string): { n: bigint; scale: number } | null {
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(v).trim());
  if (!m) return null;
  const frac = m[2] ?? "";
  return { n: BigInt(m[1] + frac), scale: frac.length };
}

function formatTenths(tenths: bigint): string {
  const s = tenths.toString().padStart(2, "0");
  return `${s.slice(0, -1)}.${s.slice(-1)}`;
}

export function pensionIndexFromCpi(input: PensionIndexInput): PensionIndexResult {
  const { year, cpi, cpiBasis, precedingPensionIndex } = input;
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    return fail("INVALID_INPUT", "year must be a four-digit integer");
  }
  // Twelve months ending October 31 of the preceding year: Nov (year-2) .. Oct (year-1).
  const window: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m0 = 10 + i; // 0-based month index counted from Nov (year-2)
    const y = year - 2 + Math.floor(m0 / 12);
    const mo = (m0 % 12) + 1;
    window.push(`${y}-${String(mo).padStart(2, "0")}`);
  }

  const SCALE = 6; // finer than any published CPI precision; inputs beyond it are rejected
  let sum = 0n;
  const bases = new Set<string>();
  for (const key of window) {
    const raw = cpi[key];
    if (raw === undefined) return fail("INSUFFICIENT_DATA", `missing CPI for ${key}`);
    const p = parseDecimal(raw);
    if (p === null || p.n === 0n) {
      return fail("INVALID_INPUT", `CPI for ${key} must be a positive decimal`);
    }
    if (p.scale > SCALE) return fail("INVALID_INPUT", `CPI for ${key} has too many decimals`);
    sum += p.n * 10n ** BigInt(SCALE - p.scale);
    bases.add(cpiBasis?.[key] ?? "");
  }
  if (bases.size > 1) {
    return fail(
      "UNVERIFIED_RULE",
      "CPI window mixes more than one CPI basis; s.43(3) rebasing is not implemented",
      "CPP Act s.43(3)",
    );
  }

  // quotient = sum / (12 * 10^SCALE). Truncate to two decimals, then s.75(2) on 2nd digit.
  const hundredths = (sum * 100n) / (12n * 10n ** BigInt(SCALE));
  let tenths = hundredths / 10n;
  if (hundredths % 10n >= 5n) tenths += 1n;

  let finalTenths = tenths;
  let held = false;
  if (precedingPensionIndex !== undefined) {
    const prev = parseDecimal(precedingPensionIndex);
    if (prev === null || prev.n === 0n || prev.scale > 1) {
      return fail("INVALID_INPUT", "precedingPensionIndex must be a positive one-decimal value");
    }
    const prevTenths = prev.scale === 0 ? prev.n * 10n : prev.n;
    if (tenths < prevTenths) {
      finalTenths = prevTenths;
      held = true;
    }
  }
  return {
    status: "COMPUTED",
    pensionIndex: formatTenths(finalTenths),
    calculatedPensionIndex: formatTenths(tenths),
    heldAtPrecedingYear: held,
    window,
  };
}
