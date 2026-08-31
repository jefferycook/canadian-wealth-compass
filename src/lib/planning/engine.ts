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
import { automaticSelectionBlockers, engageResultComponent } from "./types";
import type {
  ComponentStatusEntry,
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

/** Caveat shown wherever the auto-selected withdrawal order is displayed. */
export const AUTO_SELECTION_NOTE =
  "Automatic ordering is chosen on fewest shortfall years, then on an approximate after-tax estate (registered taxed at a flat 38%, non-registered at 8%). It is a comparison rule, not a proof of optimality.";

/**
 * Deterministic ordering used when automatic selection is suppressed. This is a
 * COMPUTATIONAL FALLBACK, not a recommendation: it carries no claim of being
 * better than any other ordering. It exists so a projection can still be
 * produced when the engine is not permitted to choose.
 */
export const AUTO_FALLBACK_STRATEGY: WithdrawalStrategy = "nonreg_reg_tfsa";

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
  const candidates = new Map<WithdrawalStrategy, ProjectionResult>();
  const ranking: Array<{ short: number; est: number }> = [];
  for (const s of FIXED_STRATEGIES) {
    const P = projection(inputs, { ...override, strategy: s });
    candidates.set(s, P);
    const short = shortfallYears(P);
    const est = afterTaxEstate(P);
    ranking.push({ short, est });
    if (!best || short < best.short || (short === best.short && est > best.est)) {
      best = { s, P, short, est };
    }
  }

  // The estate approximation participates only when at least two strategies
  // share the best shortfall count and their estate values differ. A unique
  // shortfall winner is decided before the tie-break; equal estate values do
  // not determine an ordering either.
  const shortfallContenders = ranking.filter(({ short }) => short === best!.short);
  const estateTieBreakEngaged = shortfallContenders.some(
    ({ est }) => est !== shortfallContenders[0]!.est,
  );

  // Every candidate contributed to the ranking, so an existing hard blocker on
  // any one of them suppresses automatic selection. VALID-2 coverage statuses
  // still suppress downstream comparisons/recommendations, but do not replace
  // the selected projection and therefore cannot move numerical anchors.
  // Reads componentStatuses, never the display-only aggregate.
  const byComponent = new Map<string, ComponentStatusEntry>();
  for (const P of candidates.values()) {
    for (const b of automaticSelectionBlockers(P.componentStatuses)) {
      if (!byComponent.has(b.component)) byComponent.set(b.component, b);
    }
  }
  const blockers = [...byComponent.values()];

  if (blockers.length > 0) {
    const fallback = candidates.get(AUTO_FALLBACK_STRATEGY) ?? best!.P;
    return {
      ...fallback,
      chosenStrategy: AUTO_FALLBACK_STRATEGY,
      autoSelected: false,
      autoSelectionStatus: "WITHHELD",
      autoSelectionNote:
        "Automatic ordering was not selected. This plan contains figures that are " +
        "not advice-grade, so the engine did not select a withdrawal order from the " +
        "comparison. A fixed default ordering was used to produce the projection and " +
        "is not a recommendation.",
      autoSelectionBlockers: blockers.map((b) => b.component),
    };
  }

  return {
    ...best!.P,
    componentStatuses: estateTieBreakEngaged
      ? engageResultComponent(best!.P.componentStatuses, "estate.afterTaxHaircut")
      : best!.P.componentStatuses,
    chosenStrategy: best!.s,
    autoSelected: true,
    // Batch 0D (§7.8): expose the approximation only when the estate
    // tie-break actually participated in selecting the ordering.
    ...(estateTieBreakEngaged
      ? {
          autoSelectionStatus: "APPROXIMATE" as const,
          autoSelectionNote: AUTO_SELECTION_NOTE,
        }
      : {}),
  };
}
