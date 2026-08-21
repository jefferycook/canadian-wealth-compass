/**
 * Non-registered return decomposition (canonical spec §6.1, Batch 0D).
 *
 * The defect this module fixes: the engine used to compute a single
 * `growth = bal × rate` and accrue interest and dividends only when that
 * number was positive. A −10% year therefore produced **no taxable
 * distributions at all** — a tax holiday exactly when markets fall, which
 * understates tax in bad years and understates the damage of a market shock.
 *
 * Correct methodology (§6.1): distributions are yields on the balance and
 * accrue regardless of the sign of the price return.
 *
 *   totalReturn = priceReturn + interest + eligDiv + cgDist + roc
 *   taxable now = interest (ordinary) + eligDiv (grossed up) + cgDist × 50%
 *   not taxable = roc (reduces ACB) + priceReturn (unrealized)
 *
 * Reinvested distributions have already been taxed, so they RAISE ACB; return
 * of capital LOWERS it, with a floor at zero — the excess is realized as a
 * capital gain in the year it occurs (§6.3).
 *
 * NOT modelled here: non-eligible (CCPC) dividends. §6.2 rates them a [G]
 * gap requiring per-province non-eligible dividend tax credits that are not
 * yet in the verified rules layer, so the engine does not accept a
 * non-eligible yield rather than taxing one at eligible-dividend rates. The
 * gap stays on the correctness backlog.
 */

import type { ReturnMix } from "./types";

/** Annual distribution yields, as non-negative fractions of the balance. */
export interface YieldVector {
  interest: number;
  eligDiv: number;
  cgDist: number;
  roc: number;
}

export interface YieldInput {
  interest?: number | null;
  eligDiv?: number | null;
  cgDist?: number | null;
  roc?: number | null;
}

const nn = (v: number | null | undefined): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;

/**
 * Resolve the yield vector for an account.
 *
 * An explicit vector wins. Otherwise the legacy `mix` convention is used
 * (backward compatible, §6.1 "simpler" option): the mix is applied to the
 * account's EXPECTED return floored at zero, so a positive-return year
 * produces exactly the distributions it always did, while a loss or shock
 * year keeps the same yields and lets the price component absorb the fall.
 */
export function resolveYields(
  mix: ReturnMix,
  expectedReturn: number,
  explicit?: YieldInput | null,
): YieldVector {
  if (explicit) {
    const v = {
      interest: nn(explicit.interest),
      eligDiv: nn(explicit.eligDiv),
      cgDist: nn(explicit.cgDist),
      roc: nn(explicit.roc),
    };
    if (v.interest || v.eligDiv || v.cgDist || v.roc) return v;
  }
  const base = Math.max(0, expectedReturn);
  return {
    interest: base * mix.int,
    eligDiv: base * mix.div,
    // The capital-gains share of the legacy mix is price appreciation, not a
    // distribution: it stays unrealized until disposition, as it always did.
    cgDist: 0,
    roc: 0,
  };
}

export interface Decomposition {
  /** Total return in dollars: what the balance actually moves by. */
  growth: number;
  /** Price return in dollars — may be negative; unrealized. */
  price: number;
  interest: number;
  eligDiv: number;
  cgDist: number;
  roc: number;
}

/** Decompose one year's total return on a non-registered balance. */
export function decomposeReturn(
  balance: number,
  totalRate: number,
  y: YieldVector,
): Decomposition {
  const bal = Math.max(0, balance);
  const growth = balance * totalRate;
  const interest = bal * y.interest;
  const eligDiv = bal * y.eligDiv;
  const cgDist = bal * y.cgDist;
  const roc = bal * y.roc;
  return {
    growth,
    price: growth - interest - eligDiv - cgDist - roc,
    interest,
    eligDiv,
    cgDist,
    roc,
  };
}

export interface AcbMovement {
  /** New adjusted cost base, never negative. */
  acb: number;
  /** Capital gain realized because ROC drove ACB through zero (§6.3). */
  realizedGain: number;
}

/**
 * Apply one year of distributions to the ACB.
 *
 * Reinvested interest, dividends and capital-gains distributions have been
 * taxed, so they add to ACB. Return of capital subtracts; if that drives the
 * ACB below zero the negative amount is immediately realized as a capital
 * gain and the ACB resets to zero — never negative, never a phantom loss.
 */
export function applyDistributionsToAcb(acb: number, d: Decomposition): AcbMovement {
  const raised = acb + d.interest + d.eligDiv + d.cgDist;
  const after = raised - d.roc;
  if (after < 0) return { acb: 0, realizedGain: -after };
  return { acb: after, realizedGain: 0 };
}
