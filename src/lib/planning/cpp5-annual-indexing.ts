/**
 * CPP-5 EXPERIMENTAL annual indexation chain (CPP Act s.45(2) with Regulations s.62).
 * NOT a production calculation. Nothing in the app, the projection engine or
 * `benefits.ts` may import this module.
 *
 * Sources read directly from Justice Laws on 2026-10-30 (Act current to
 * 2026-09-30, Regulations current to 2026-09-30):
 * - Act s.43(2): a Pension Index (PI) never falls below the preceding year's PI.
 * - Act s.45(2): for a benefit payable from a month in year Y0, the amount for a month
 *   in a following year Y is (a) the amount that would have been payable for that month
 *   had no adjustment been made for Y, multiplied by (b) PI(Y) / PI(Y-1). Taking (a)
 *   as the previous year's adjusted amount makes the adjustment a year-by-year chain.
 * - Regs s.62(1)(a), (2): each product is adjusted to the nearest cent, using only the
 *   third decimal digit (5 or more rounds the cent up, otherwise dropped).
 * - Regs s.62(1)(b), (3): determine the first four digits after the decimal
 *   point of the PI quotient; the fourth is the rounding digit for the THIRD.
 *   The final annual adjustment quotient is therefore expressed to THREE decimal
 *   places. This is a required statutory rule, not a caller-selectable policy.
 *
 * Deliberately NOT implemented (fail closed upstream): s.58(3) event rebasing, s.58(1.1)
 * flat-rate indexing, the s.43(1) CPI averaging and s.43(3) rebasing (Reg. s.75 unread).
 * Reg. s.62 governs s.45(2) adjustments only; it does not say how the single s.58(3)
 * ratio product is rounded.
 *
 * All arithmetic is exact (BigInt rationals); no floating point touches money or ratios.
 */

export interface IndexingInput {
  /** Year Y0 in which the benefit first became payable. */
  readonly startYear: number;
  /** Basic monthly amount for Y0, in whole cents. */
  readonly startAmountCents: number;
  /** Published PI by year, as decimal numbers or strings (no exponent notation). */
  readonly pensionIndex: Readonly<Record<number, number | string>>;
  /** Last year to compute (>= startYear). */
  readonly throughYear: number;
}

export interface IndexingStep {
  readonly year: number;
  /** Ratio actually applied, as a decimal string (e.g. "1.025"). */
  readonly ratioApplied: string;
  readonly amountCents: number;
}

export interface IndexingComputed {
  readonly status: "COMPUTED";
  /** Regulation 62(3) rounded the PI quotient to three decimals. */
  readonly basis: "STATUTORY_TEXT";
  readonly steps: readonly IndexingStep[];
  readonly finalAmountCents: number;
}

export interface IndexingFailClosed {
  readonly status: "INVALID_INPUT" | "INSUFFICIENT_DATA";
  readonly reason: string;
  readonly citation: string;
}

export type IndexingResult = IndexingComputed | IndexingFailClosed;

const ACT_43 = "CPP Act s.43(2)";
const ACT_45 = "CPP Act s.45(2); CPP Regulations s.62";

const fail = (
  status: IndexingFailClosed["status"],
  reason: string,
  citation: string,
): IndexingFailClosed => ({ status, reason, citation });

interface Rational {
  readonly n: bigint;
  readonly d: bigint;
}

function parseDecimal(v: number | string): Rational | null {
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  const s = String(v).trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const frac = m[2] ?? "";
  return { n: BigInt(m[1] + frac), d: 10n ** BigInt(frac.length) };
}

/** Round n/d (both positive) half-up to the nearest integer. */
const roundHalfUp = (n: bigint, d: bigint): bigint => (2n * n + d) / (2n * d);

function formatScaled(scaled: bigint, decimals: number): string {
  const s = scaled.toString().padStart(decimals + 1, "0");
  return decimals === 0 ? s : `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
}

export function indexBenefitAnnually(input: IndexingInput): IndexingResult {
  const { startYear, startAmountCents, pensionIndex, throughYear } = input;
  if (!Number.isInteger(startYear) || !Number.isInteger(throughYear) || throughYear < startYear) {
    return fail("INVALID_INPUT", "years must be integers with throughYear >= startYear", ACT_45);
  }
  if (!Number.isSafeInteger(startAmountCents) || startAmountCents < 0) {
    return fail("INVALID_INPUT", "startAmountCents must be a non-negative integer", ACT_45);
  }
  const pi = new Map<number, Rational>();
  for (let y = startYear; y <= throughYear; y++) {
    const raw = pensionIndex[y];
    if (raw === undefined) {
      return fail("INSUFFICIENT_DATA", `missing Pension Index for ${y}`, ACT_45);
    }
    const r = parseDecimal(raw);
    if (r === null || r.n === 0n) {
      return fail("INVALID_INPUT", `Pension Index for ${y} must be a positive decimal`, ACT_45);
    }
    pi.set(y, r);
  }

  // Reg. 62(3): evaluate the fourth decimal as the rounding digit, retain three.
  // BigInt rational arithmetic performs this rounding exactly, including carry.
  const ratios: { year: number; scaledToThree: bigint }[] = [];
  for (let y = startYear + 1; y <= throughYear; y++) {
    const cur = pi.get(y)!;
    const prev = pi.get(y - 1)!;
    const n = cur.n * prev.d;
    const d = cur.d * prev.n;
    if (n < d) {
      return fail(
        "INVALID_INPUT",
        `Pension Index falls from ${y - 1} to ${y}; s.43(2) requires it to be held at the prior year's value`,
        ACT_43,
      );
    }
    ratios.push({ year: y, scaledToThree: roundHalfUp(n * 1000n, d) });
  }

  let cents = BigInt(startAmountCents);
  const steps: IndexingStep[] = [];
  for (const r of ratios) {
    cents = roundHalfUp(cents * r.scaledToThree, 1000n);
    if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
      return fail("INVALID_INPUT", "adjusted benefit exceeds safe integer cents", ACT_45);
    }
    steps.push({
      year: r.year,
      ratioApplied: formatScaled(r.scaledToThree, 3),
      amountCents: Number(cents),
    });
  }
  return {
    status: "COMPUTED",
    basis: "STATUTORY_TEXT",
    steps,
    finalAmountCents: Number(cents),
  };
}
