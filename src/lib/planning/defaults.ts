/**
 * The starting point for a brand-new plan.
 *
 * Rule: nothing that varies person to person is pre-filled. No ages, no
 * balances, no contribution room, no incomes, no province, no spending target,
 * no accounts, no assets, no debts. The client enters each of those step by
 * step and the engine responds to what they actually give it.
 *
 * The only values set here are program-wide planning assumptions that are the
 * same for every client until they choose to change them (return assumptions,
 * inflation, projection horizon) plus the statutory figures for the tax year,
 * which come from the rules layer, not from a person.
 *
 * Anything a client has not answered yet is `null`. `null` means "unanswered"
 * and is distinct from `0`, which is a real answer meaning "none".
 */

import type { PlanInputs, PersonInput } from "./types";
import { TAX_YEARS, LATEST_TAX_YEAR } from "./taxYears";

/**
 * Household-level assumptions applied to every new plan. These are modelling
 * defaults, not personal facts, so pre-filling them is safe.
 */
export const PLANNING_ASSUMPTIONS = {
  /** Long-run inflation used to index spending and brackets. */
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

/** A person with nothing filled in yet. */
export function emptyPerson(id: PersonInput["id"]): PersonInput {
  return {
    id,
    firstName: "",
    lastName: "",
    dob: undefined,
    curAge: null,
    retAge: null,
    employ: null,
    deathAge: null,
    cpp: { amt: null, age: null },
    oas: { amt: null, age: null },
    pen: { amt: null, age: null },
    bridge: { amt: null, end: null },
  };
}

/**
 * A blank plan for a client who has just signed up. One unnamed person, no
 * accounts, no expenses, no assets, no liabilities. The intake wizard fills
 * this in; the projection is not meaningful until it has at least an age and
 * a province.
 */
export function newPlanInputs(taxYear: number = LATEST_TAX_YEAR): PlanInputs {
  const year = TAX_YEARS[taxYear] ?? TAX_YEARS[LATEST_TAX_YEAR]!;
  return {
    taxYear,
    planType: "single",
    endAge: PLANNING_ASSUMPTIONS.endAge,
    inflation: PLANNING_ASSUMPTIONS.inflation,
    spendNeed: null,
    eqRet: PLANNING_ASSUMPTIONS.eqRet,
    fiRet: PLANNING_ASSUMPTIONS.fiRet,
    survivorPct: PLANNING_ASSUMPTIONS.survivorPct,
    strategy: "auto",
    tax: {
      // Province is a personal fact — the client picks it in step 1. Until
      // then the credits below are federal-only placeholders from the rules
      // layer and the plan is flagged incomplete.
      provinceKey: null,
      fedBPA: year.federal.bpa,
      provBPA: null,
      oasThresh: year.oas.clawbackThreshold,
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
 * What is still missing before the projection can run. The wizard uses this to
 * decide what to ask next and whether to show results at all.
 */
export function missingRequiredInputs(p: PlanInputs): string[] {
  const gaps: string[] = [];
  if (!p.tax.provinceKey) gaps.push("province of residence");
  for (const person of p.people) {
    const who = person.firstName || (person.id === "A" ? "you" : "your spouse");
    if (person.curAge == null) gaps.push(`current age for ${who}`);
    if (person.retAge == null) gaps.push(`retirement age for ${who}`);
  }
  if (p.spendNeed == null) gaps.push("annual spending target");
  if (p.accounts.length === 0) gaps.push("at least one account");
  return gaps;
}

/** True when the plan has enough answers for the projection to mean anything. */
export function isPlanReady(p: PlanInputs): boolean {
  return missingRequiredInputs(p).length === 0;
}
