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
 * - Regs s.62(1)(b), (3): the PI quotient is expressed as a decimal. The text says to
 *   write four digits after the point and then round on the fourth digit into the
 *   third, which literally leaves THREE decimals. Whether three or four was intended
 *   is unresolved, so the ratio is only used without a caller-supplied policy when
 *   both readings give the same ratio.
 *
 * Deliberately NOT implemented (fail closed upstream): s.58(3) event rebasing, s.58(1.1)
 * flat-rate indexing, the s.43(1) CPI averaging and s.43(3) rebasing (Reg. s.75 unread).
 * Reg. s.62 governs s.45(2) adjustments only; it does not say how the single s.58(3)
 * ratio product is rounded.
 *
 * All arithmetic is exact (BigInt rationals); no floating point touches money or ratios.
 */

export type RatioPolicy = "THREE_DECIMALS_LITERAL_REG62_3" | "FOUR_DECIMALS_ALTERNATIVE_READING";

export interface IndexingInput {
  /** Year Y0 in which the benefit first became payable. */
  readonly startYear: number;
  /** Basic monthly amount for Y0, in whole cents. */
  readonly startAmountCents: number;
  /** Published PI by year, as decimal numbers or strings (no exponent notation). */
  readonly pensionIndex: Readonly<Record<number, number | string>>;
  /** Last year to compute (>= startYear). */
  readonly throughYear: number;
  /** Only needed when some year's ratio is not exact to three decimals. */
  readonly ratioPolicy?: RatioPolicy;
}

export interface IndexingStep {
  readonly year: number;
  /** Ratio actually applied, as a decimal string (e.g. "1.025"). */
  readonly ratioApplied: string;
  readonly amountCents: number;
}

export interface IndexingComputed {
  readonly status: "COMPUTED";
  /** "STATUTORY_TEXT" when every ratio is exact to 3 decimals; otherwise policy-dependent. */
  readonly basis: "STATUTORY_TEXT" | "ASSUMED_RATIO_POLICY_NOT_VERIFIED";
  readonly steps: readonly IndexingStep[];
  readonly finalAmountCents: number;
}

export interface IndexingFailClosed {
  readonly status: "INVALID_INPUT" | "INSUFFICIENT_DATA" | "UNVERIFIED_RULE";
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
  const { startYear, startAmountCents, pensionIndex, throughYear, ratioPolicy } = input;
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

  // Exact ratios and the readings of Reg. s.62(3).
  const ratios: {
    year: number;
    n: bigint;
    d: bigint;
    three: bigint;
    four: bigint;
    exact3: boolean;
  }[] = [];
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
    const three = roundHalfUp(n * 1000n, d);
    const four = roundHalfUp(n * 10000n, d);
    ratios.push({ year: y, n, d, three, four, exact3: (n * 1000n) % d === 0n });
  }

  const needsPolicy = ratios.some((r) => !r.exact3);
  if (needsPolicy && ratioPolicy === undefined) {
    const first = ratios.find((r) => !r.exact3)!;
    return fail(
      "UNVERIFIED_RULE",
      `PI ratio for ${first.year} is not exact to three decimals; Reg. s.62(3) is ambiguous between 3 and 4 decimals`,
      "CPP Regulations s.62(1)(b), (3)",
    );
  }

  let cents = BigInt(startAmountCents);
  const steps: IndexingStep[] = [];
  for (const r of ratios) {
    const useFour = needsPolicy && ratioPolicy === "FOUR_DECIMALS_ALTERNATIVE_READING";
    const scale = useFour ? 10000n : 1000n;
    const scaled = useFour ? r.four : r.three;
    cents = roundHalfUp(cents * scaled, scale);
    steps.push({
      year: r.year,
      ratioApplied: formatScaled(scaled, useFour ? 4 : 3),
      amountCents: Number(cents),
    });
  }
  return {
    status: "COMPUTED",
    basis: needsPolicy ? "ASSUMED_RATIO_POLICY_NOT_VERIFIED" : "STATUTORY_TEXT",
    steps,
    finalAmountCents: Number(cents),
  };
}
