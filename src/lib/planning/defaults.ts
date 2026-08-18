/**
 * The starting point for a brand-new plan.
 *
 * Rule: nothing that varies person to person is pre-filled. No ages, no
 * balances, no contribution room, no incomes, no province, no spending target,
 * no accounts, no assets, no debts. The client answers each of those step by
 * step and the engine responds to what they actually give it.
 *
 * The only values set here are program-wide planning assumptions that are the
 * same for every client until they choose to change them (return assumptions,
 * inflation, projection horizon). Statutory figures are never copied here —
 * they come from the rules layer (`taxYears.ts`) at normalization time.
 *
 * Anything a client has not answered yet is `null`. `null` means "unanswered",
 * which is different from `0`, a real answer meaning "none".
 */

import type { PersonKey } from "./types";
import type { PersonDraft, PlanDraft } from "./draft";
import { LATEST_TAX_YEAR } from "./taxYears";

/**
 * Household-level modelling assumptions applied to every new plan. These are
 * not personal facts, so pre-filling them is safe; the client can override any
 * of them later.
 */
export const PLANNING_ASSUMPTIONS = {
  /** Long-run inflation used to index spending. */
  inflation: 0.021,
  /** Expected nominal return on the equity sleeve. */
  eqRet: 0.065,
  /** Expected nominal return on the fixed-income sleeve. */
  fiRet: 0.035,
  /** Share of household spending a surviving spouse still needs. */
  survivorPct: 0.6,
  /** Age the projection runs to. */
  endAge: 95,
} as const;

/**
 * Ready-made return assumptions a client can pick per account. These are
 * planning assumptions, not statutory figures, so they live with the other
 * program-wide defaults.
 */
export const RETURN_PRESETS = [
  { key: "cash", label: "Cash / GIC — 2%", rate: 0.02, eq: 0 },
  { key: "conservative", label: "Conservative — 4.5%", rate: 0.045, eq: 30 },
  { key: "balanced", label: "Balanced — 7%", rate: 0.07, eq: 60 },
  { key: "growth", label: "Growth — 8.5%", rate: 0.085, eq: 80 },
  { key: "aggressive", label: "Aggressive — 10%", rate: 0.1, eq: 100 },
] as const;

export type ReturnPresetKey = (typeof RETURN_PRESETS)[number]["key"] | "custom" | "blend";

/** A person with nothing filled in yet. */
export function emptyPerson(id: PersonKey): PersonDraft {
  return {
    id,
    firstName: "",
    lastName: "",
    dob: null,
    curAge: null,
    retAge: null,
    employ: null,
    deathAge: null,
    cpp: { amt: null, age: null },
    oas: { amt: null, age: null },
    pen: { amt: null, age: null },
    bridge: { amt: null, end: null },
    tfsaRoom: null,
    rrspRoom: null,
  };
}

/**
 * A blank plan for a client who has just signed up: one unnamed person, no
 * province, no accounts, no expenses, no assets, no liabilities. The intake
 * wizard fills this in.
 */
export function newPlanDraft(taxYear: number = LATEST_TAX_YEAR): PlanDraft {
  return {
    taxYear,
    planType: "single",
    endAge: PLANNING_ASSUMPTIONS.endAge,
    inflation: PLANNING_ASSUMPTIONS.inflation,
    eqRet: PLANNING_ASSUMPTIONS.eqRet,
    fiRet: PLANNING_ASSUMPTIONS.fiRet,
    survivorPct: PLANNING_ASSUMPTIONS.survivorPct,
    strategy: "auto",
    spendNeed: null,
    currentSpend: null,
    tax: {
      provinceKey: null,
      fedBPA: null,
      provBPA: null,
      oasThresh: null,
      lifRate: null,
    },
    people: [emptyPerson("A")],
    accounts: [],
    expenses: [],
    otherIncome: [],
    lumpSums: [],
    hardAssets: [],
    liabilities: [],
  };
}

/**
 * What is still missing before the projection can mean anything. The wizard
 * uses this to decide what to ask next and whether to show results at all.
 */
export function missingRequiredInputs(d: PlanDraft): string[] {
  const gaps: string[] = [];
  if (!d.tax.provinceKey) gaps.push("province of residence");
  for (const person of d.people) {
    const who = person.firstName || (person.id === "A" ? "you" : "your spouse");
    if (person.curAge == null) gaps.push(`date of birth for ${who}`);
    if (person.retAge == null) gaps.push(`retirement age for ${who}`);
  }
  if (d.spendNeed == null) gaps.push("annual spending target");
  if (d.accounts.length === 0) gaps.push("at least one account or savings balance");
  return gaps;
}

/** True when the draft has enough answers for the projection to be run. */
export function isPlanReady(d: PlanDraft): boolean {
  return missingRequiredInputs(d).length === 0;
}
