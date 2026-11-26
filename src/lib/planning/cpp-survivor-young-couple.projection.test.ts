/**
 * Full-projection regression: post-2018 CPP survivor eligibility for a
 * survivor UNDER 35 (issue #78, item 3).
 *
 * The engine projects from base year 2026 forward (DEFAULT_BASE_YEAR,
 * taxYear: 2026), so every payable year here is after 2018 and falls under
 * CPP Act s.44(1)(d)(ii) (no age condition on eligibility) and s.58(1)(a.1)
 * (flat rate + 37.5%, no 1/120 taper). The pre-2019 rule cannot be reached by
 * a 2026-forward projection; its boundary is pinned in `benefits.test.ts`.
 *
 * Existing fixtures only contain people aged 43 and up, so this file builds a
 * young married couple: A is 30, B is 31 and dies at 33, leaving A a survivor
 * aged 32 in the death year. The obsolete pre-2019 rule returned 0 for a
 * survivor under 35 and tapered ages 35-44, so a positive, untapered
 * survivor pension here proves the corrected rule flows through `runPlan`.
 *
 * Synthetic data only. Expected survivor amounts are reconstructed from the
 * statutory structure (flat rate x inflation + 37.5% of the deceased's
 * inflated age-65 pension, capped at the under-65 maximum) using the
 * engine's 2026 parameter table; absolute CPP dollars are NOT certified here.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_BASE_YEAR, regressionFixturePlan } from "./fixtures";
import { runPlan } from "./engine";
import { TAX_2026 } from "./taxYears";
import type { PlanInputs, ProjectionRow } from "./types";

const A_EMPLOY = 72_000;
const B_EMPLOY = 64_000;
const B_CPP_AT_65 = 9_000; // deceased's entered age-65 CPP entitlement
const B_DEATH_AGE = 33;

/** Young married couple; B dies in-plan while A is 32. Synthetic data. */
function youngCoupleFixturePlan(bDeathAge: number): PlanInputs {
  const base = regressionFixturePlan();
  const plan: PlanInputs = {
    ...base,
    taxYear: 2026,
    planType: "married",
    endAge: 70,
    spendNeed: 70_000,
    expenses: [],
    otherIncome: [],
    lumpSums: [],
    hardAssets: [],
    liabilities: [],
    people: [
      {
        id: "A",
        firstName: "",
        lastName: "",
        curAge: 30,
        retAge: 65,
        employ: A_EMPLOY,
        deathAge: 0,
        cpp: { amt: 8_000, age: 65 },
        oas: { amt: 9_024, age: 65 },
        pen: { amt: 0, age: 65 },
        bridge: { amt: 0, end: 65 },
      },
      {
        id: "B",
        firstName: "",
        lastName: "",
        curAge: 31,
        retAge: 65,
        employ: B_EMPLOY,
        deathAge: bDeathAge,
        cpp: { amt: B_CPP_AT_65, age: 65 },
        oas: { amt: 9_024, age: 65 },
        pen: { amt: 0, age: 65 },
        bridge: { amt: 0, end: 65 },
      },
    ],
    accounts: base.accounts
      .filter((a) => a.type === "TFSA" || a.type === "NONREG")
      .map((a) => ({ ...a, bal: 25_000, acb: 25_000 })),
  };
  return plan;
}

const rowAtAgeA = (rows: ProjectionRow[], age: number): ProjectionRow => {
  const r = rows.find((x) => x.ages[0] === age);
  if (!r) throw new Error(`no row for A at ${age}`);
  return r;
};

/** Untapered under-65 survivor pension (s.58(1)(a.1)) with no own CPP. */
function expectedUnder65Survivor(infFac: number): number {
  const uncapped = TAX_2026.cppSurvFlat * infFac + 0.375 * B_CPP_AT_65 * infFac;
  return Math.min(uncapped, TAX_2026.cppSurvMaxU65 * infFac, TAX_2026.cppCombinedMax * infFac);
}

describe("full projection — post-2018 CPP survivor pension for a survivor under 35", () => {
  const withDeath = runPlan(youngCoupleFixturePlan(B_DEATH_AGE));
  const noDeath = runPlan(youngCoupleFixturePlan(0));

  it("projects on the engine's 2026-forward domain", () => {
    expect(DEFAULT_BASE_YEAR).toBe(2026);
    expect(withDeath.rows[0]!.yr).toBe(2026);
    expect(withDeath.couple).toBe(true);
  });

  it("leaves every row before the death year identical to the no-death plan", () => {
    const deathOff = B_DEATH_AGE - 31; // B is 31 at offset 0
    expect(deathOff).toBe(2);
    expect(withDeath.rows.slice(0, deathOff)).toEqual(noDeath.rows.slice(0, deathOff));
    expect(withDeath.rows[deathOff]!.anyDeceased).toBe(true);
    expect(withDeath.rows[deathOff - 1]!.anyDeceased).toBe(false);
  });

  it("pays a survivor aged 32 a positive, untapered survivor pension in the death year", () => {
    const r = rowAtAgeA(withDeath.rows, 32);
    expect(r.ages[1]).toBe(B_DEATH_AGE);
    expect(r.perPerson[1]!.alive).toBe(false);
    // No own CPP before 65, so household CPP is the survivor pension alone.
    // The obsolete pre-2019 rule would have produced exactly 0 here.
    expect(r.cpp).toBeGreaterThan(0);
    expect(r.cpp).toBeCloseTo(expectedUnder65Survivor(r.infFac), 6);
  });

  it.each([32, 34, 35, 40, 44, 45, 50, 64])(
    "keeps paying the untapered survivor pension with A aged %i",
    (age) => {
      const r = rowAtAgeA(withDeath.rows, age);
      expect(r.cpp).toBeCloseTo(expectedUnder65Survivor(r.infFac), 6);
    },
  );

  it("does not disturb the survivor's own employment, OAS or DB pension streams", () => {
    // Up to 63: at A=64 B would be 65 in the no-death plan (retired, own CPP).
    for (const age of [32, 40, 50, 63]) {
      const d = rowAtAgeA(withDeath.rows, age);
      expect(d.employ).toBeCloseTo(A_EMPLOY * d.infFac, 6);
      expect(d.oas).toBe(0);
      expect(d.pen).toBe(0);
      // Same years in the no-death plan carry both salaries and no CPP.
      const n = rowAtAgeA(noDeath.rows, age);
      expect(n.employ).toBeCloseTo((A_EMPLOY + B_EMPLOY) * n.infFac, 6);
      expect(n.cpp).toBe(0);
    }
  });
});
