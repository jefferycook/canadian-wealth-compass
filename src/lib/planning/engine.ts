/**
 * The public entry point to the planning engine.
 *
 * `runPlan` resolves the "auto" withdrawal strategy the way the original did —
 * by running every ordering and keeping the one with the fewest shortfall
 * years, breaking ties on the highest after-tax estate — and returns the
 * winning projection along with the strategy it chose.
 */

import { projection } from "./projection";
import { FIXED_STRATEGIES } from "./strategy";
import type {
  PlanInputs,
  PlanResult,
  ProjectionOverride,
  ProjectionResult,
  WithdrawalStrategy,
} from "./types";

/**
 * Estate value net of the tax that falls due on death.
 *
 * Registered money is fully taxable in the year of death (approximated at a
 * 38% effective rate), non-registered carries deemed-disposition tax on gains
 * (approximated at 8% of value), and a TFSA passes tax-free.
 */
export function afterTaxEstate(P: ProjectionResult): number {
  const last = P.rows[P.rows.length - 1];
  if (!last) return 0;
  const typeById: Record<string, string> = {};
  for (const a of P.acctMeta) typeById[a.id] = a.type;
  let v = 0;
  for (const [id, bal] of Object.entries(last.balances)) {
    const t = typeById[id];
    if (t === "TFSA") v += bal;
    else if (t === "NONREG") v += bal * 0.92;
    else v += bal * 0.62;
  }
  return v + (last.assetTotal || 0) - (last.liabTotal || 0);
}

/** Number of years the plan cannot fund the spending target. */
export function shortfallYears(P: ProjectionResult): number {
  return P.rows.filter((r) => r.fundingShortfall).length;
}

/**
 * The first age at which after-tax resources cannot fund the spending need.
 * This — not an empty portfolio — is the plan-failure signal.
 */
export function firstShortfallAge(P: ProjectionResult): number | null {
  return P.rows.find((r) => r.fundingShortfall)?.age ?? null;
}

/**
 * The age investable assets that previously existed are drawn to zero.
 * Null when the household never held investments, or still holds some.
 */
export function portfolioExhaustionAge(P: ProjectionResult): number | null {
  return P.rows.find((r) => r.portfolioExhausted)?.age ?? null;
}

/** True when no investable assets exist anywhere in the projection. */
export function noInvestableAssets(P: ProjectionResult): boolean {
  return !P.hadInvestableAssets;
}

/** True when every year of the projection funds its spending need. */
export function planFunded(P: ProjectionResult): boolean {
  return shortfallYears(P) === 0;
}

/**
 * @deprecated Backwards-compatible wrapper. Defined strictly as "the age a
 * previously funded portfolio is exhausted" — it is NOT a funding-failure
 * signal. Use `firstShortfallAge` for plan failure.
 */
export function depletionAge(P: ProjectionResult): number | null {
  return portfolioExhaustionAge(P);
}

/** Total tax paid across the whole projection. */
export function lifetimeTax(P: ProjectionResult): number {
  return P.rows.reduce((s, r) => s + r.tax, 0);
}

export function runPlan(
  inputs: PlanInputs,
  override: ProjectionOverride = {},
): PlanResult {
  const requested: WithdrawalStrategy = override.strategy ?? inputs.strategy;

  if (requested !== "auto") {
    const P = projection(inputs, { ...override, strategy: requested });
    return { ...P, chosenStrategy: requested, autoSelected: false };
  }

  let best: { s: WithdrawalStrategy; P: ProjectionResult; short: number; est: number } | null =
    null;
  for (const s of FIXED_STRATEGIES) {
    const P = projection(inputs, { ...override, strategy: s });
    const short = shortfallYears(P);
    const est = afterTaxEstate(P);
    if (!best || short < best.short || (short === best.short && est > best.est)) {
      best = { s, P, short, est };
    }
  }
  return { ...best!.P, chosenStrategy: best!.s, autoSelected: true };
}
