/**
 * Engine Batch E1 — PR-1 (deterministic startYear), VALID-1 (component status,
 * row validity, advice gates), CPP-1 Defect A (the s.58 own-pension argument)
 * and the survivor golden fixture.
 *
 * Every test here is new. No existing test was modified for this batch.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { buildRecommendations, compareStrategies, goalProgress } from "./analysis";
import { cppFactor, cppSurvivorBenefit } from "./benefits";
import { AUTO_FALLBACK_STRATEGY, lifetimeTax, runPlan } from "./engine";
import {
  coupleGoldenFixturePlan,
  regressionFixturePlan,
  survivorGoldenFixturePlan,
} from "./fixtures";
import { projection } from "./projection";
import { recordStatus } from "./registered";
import { FIXED_STRATEGIES } from "./strategy";
import { getTaxYear } from "./taxYears";
import {
  adviceBlockers,
  automaticSelectionBlockers,
  isAdviceGrade,
  validityFromComponents,
  worstValidity,
  type ComponentStatusEntry,
  type PlanInputs,
} from "./types";

const SRC = (f: string) => readFileSync(`src/lib/planning/${f}`, "utf8");

/* ------------------------------------------------------------------ */
/* PR-1                                                                */
/* ------------------------------------------------------------------ */

describe("PR-1 — deterministic startYear", () => {
  const plan = regressionFixturePlan();

  it("PR1-1: same inputs and same explicit startYear run twice are equal", () => {
    const a = projection(plan, { startYear: 2030 });
    const b = projection(plan, { startYear: 2030 });
    expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows));
  });

  it("PR1-2: two runs differing only in startYear differ in a year-derived field", () => {
    const a = projection(plan, { startYear: 2030 });
    const b = projection(plan, { startYear: 2040 });
    expect(a.rows[0]!.yr).toBe(2030);
    expect(b.rows[0]!.yr).toBe(2040);
    expect(lifetimeTax(a)).not.toBe(lifetimeTax(b));
  });

  it("PR1-3: omitting startYear leaves every pre-existing field unchanged", () => {
    const omitted = projection(plan, {});
    const explicit = projection(plan, { startYear: new Date().getFullYear() });
    expect(omitted.rows.length).toBe(explicit.rows.length);
    for (let i = 0; i < omitted.rows.length; i++) {
      const o = omitted.rows[i]! as unknown as Record<string, unknown>;
      const e = explicit.rows[i]! as unknown as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        // VALID-1 adds validity/validityReasons; compare the pre-existing shape.
        if (k === "validity" || k === "validityReasons") continue;
        expect(JSON.stringify(o[k])).toBe(JSON.stringify(e[k]));
      }
    }
    expect(lifetimeTax(omitted)).toBe(lifetimeTax(explicit));
  });

  it("PR1-4: an explicit startYear is immune to the system clock", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2031-06-01T00:00:00Z"));
      const a = projection(plan, { startYear: 2033 });
      vi.setSystemTime(new Date("2044-02-02T00:00:00Z"));
      const b = projection(plan, { startYear: 2033 });
      expect(a.rows[0]!.yr).toBe(2033);
      expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows));
    } finally {
      vi.useRealTimers();
    }
  });

  it("PR1-5: with startYear omitted the projection follows the mocked clock", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2031-06-01T00:00:00Z"));
      expect(projection(plan, {}).rows[0]!.yr).toBe(2031);
      vi.setSystemTime(new Date("2044-02-02T00:00:00Z"));
      expect(projection(plan, {}).rows[0]!.yr).toBe(2044);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Shared survivor plans                                               */
/* ------------------------------------------------------------------ */

/** A couple where A is already deceased, so the survivor branch fires at once. */
function survivorProbePlan(opts: {
  survAge: number;
  survCppAge: number;
  survCppAmt?: number;
  decCppAge?: number;
  inflation?: number;
  endAgeOffset?: number;
}): PlanInputs {
  const base = coupleGoldenFixturePlan();
  return {
    ...base,
    planType: "married",
    inflation: opts.inflation ?? 0,
    indexationRate: 0,
    endAge: 80 + (opts.endAgeOffset ?? 1),
    spendNeed: 30000,
    strategy: "nonreg_reg_tfsa",
    people: [
      {
        ...base.people[0]!,
        curAge: 80,
        retAge: 999,
        employ: 0,
        deathAge: 80,
        cpp: { amt: 14000, age: opts.decCppAge ?? 65 },
        oas: { amt: 0, age: 65 },
        pen: { amt: 0, age: 65 },
        bridge: { amt: 0, end: 65 },
      },
      {
        ...base.people[1]!,
        curAge: opts.survAge,
        retAge: 999,
        employ: 0,
        deathAge: 0,
        cpp: { amt: opts.survCppAmt ?? 11000, age: opts.survCppAge },
        oas: { amt: 0, age: 65 },
        pen: { amt: 0, age: 65 },
        bridge: { amt: 0, end: 65 },
      },
    ],
    accounts: [
      {
        ...base.accounts[3]!,
        id: "probe-nonreg",
        owner: "B",
        bal: 300000,
        acb: 300000,
      },
    ],
    expenses: [],
    otherIncome: [],
    lumpSums: [],
    hardAssets: [],
    liabilities: [],
  };
}

/** The survivor's own CPP as actually received (unchanged by E1). */
function ownCppReceived(amt: number, cppAge: number, age: number, infl: number) {
  return age >= cppAge ? amt * cppFactor(cppAge) * Math.pow(1 + infl, age - cppAge) : 0;
}

/** Survivor benefit extracted end-to-end from a projection row. */
function survivorBenefitAt(
  plan: PlanInputs,
  off: number,
): { benefit: number; own: number } {
  const P = projection(plan, { startYear: 2026 });
  const row = P.rows[off]!;
  const b = plan.people[1]!;
  const own = ownCppReceived(b.cpp.amt, b.cpp.age, b.curAge + off, plan.inflation);
  return { benefit: row.cpp - own, own };
}

const survivorPlan = survivorProbePlan({ survAge: 75, survCppAge: 65 });

/* ------------------------------------------------------------------ */
/* VALID-1                                                             */
/* ------------------------------------------------------------------ */

describe("VALID-1 — validity model", () => {
  it("V1: a plan with no non-VERIFIED engaged component is OK everywhere", () => {
    const base = regressionFixturePlan();
    const P = projection(
      {
        ...base,
        endAge: 60,
        accounts: [base.accounts.find((account) => account.type === "TFSA")!],
      },
      { startYear: 2026 },
    );
    expect(P.validity).toBe("OK");
    expect(P.validityReasons).toEqual([]);
    expect(P.rows.every((r) => r.validity === "OK")).toBe(true);
  });

  it("V2: validity propagates forward once a row is APPROXIMATE", () => {
    const P = projection(survivorGoldenFixturePlan(), { startYear: 2026 });
    const first = P.rows.findIndex((r) => r.validity !== "OK");
    expect(first).toBe(1);
    expect(P.rows[first]!.validityReasons.map((r) => r.code)).toContain(
      "TAX_YEAR_DERIVED",
    );
    expect(P.rows.slice(first).every((r) => r.validity === "APPROXIMATE")).toBe(true);
  });

  it("V3: result validity is the worst row with reasons deduplicated by code", () => {
    const P = projection(survivorGoldenFixturePlan(), { startYear: 2026 });
    const worst = P.rows.reduce<"OK" | "APPROXIMATE" | "WITHHELD">(
      (w, r) => worstValidity(w, r.validity),
      "OK",
    );
    expect(P.validity).toBe(worst);
    expect(P.validityReasons.map((r) => r.code)).toEqual([
      "TAX_YEAR_DERIVED",
      "CPP_SURVIVOR_REDUCTION_APPROXIMATE",
    ]);
  });

  it("V4: ProjectionResult.validity appears in no engine conditional", () => {
    for (const f of ["projection.ts", "engine.ts", "analysis.ts"]) {
      const lines = SRC(f).split("\n");
      for (const line of lines) {
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        expect(/if\s*\([^)]*validity/.test(line)).toBe(false);
        expect(/validity[^\n]*\?[^?:]*:/.test(line.replace(/\?:/g, ""))).toBe(false);
      }
    }
    // engine.ts and analysis.ts must not read the aggregate at all.
    expect(/\.validity\b/.test(SRC("engine.ts"))).toBe(false);
    expect(/\.validity\b/.test(SRC("analysis.ts"))).toBe(false);
  });

  it("V5: an SK unlock refusal does not make the plan WITHHELD", () => {
    const base = regressionFixturePlan();
    const plan: PlanInputs = {
      ...base,
      accounts: [
        { ...base.accounts[1]!, id: "sk_lira", type: "LIRA", juris: "SK", unlock: 100 },
        base.accounts[2]!,
      ],
    };
    const P = projection(plan, { startYear: 2026 });
    expect(P.lockedInDisclosures.length).toBeGreaterThan(0);
    expect(P.validity).toBe("APPROXIMATE");
    expect(P.validityReasons.map((r) => r.code)).toContain(
      "LOCKED_IN_UNLOCK_ENTITLEMENT_NOT_VERIFIED",
    );
  });

  it("V6: underlying figures stay populated on a non-OK row", () => {
    const P = projection(survivorGoldenFixturePlan(), { startYear: 2026 });
    const row = P.rows[10]!;
    expect(row.validity).toBe("APPROXIMATE");
    expect(row.cpp).toBeGreaterThan(0);
    expect(row.totalPortfolio).toBeGreaterThan(0);
    expect(Number.isFinite(row.tax)).toBe(true);
  });

  it("V7: reasons are asserted by code, and the code is stable", () => {
    const P = projection(survivorGoldenFixturePlan(), { startYear: 2026 });
    const reason = P.rows[8]!.validityReasons.find(
      (entry) => entry.code === "CPP_SURVIVOR_REDUCTION_APPROXIMATE",
    );
    expect(reason?.code).toBe("CPP_SURVIVOR_REDUCTION_APPROXIMATE");
    expect(reason!.detail.length).toBeGreaterThan(0);
  });

  it("V8: isAdviceGrade is true only for VERIFIED", () => {
    expect(isAdviceGrade("VERIFIED")).toBe(true);
    expect(isAdviceGrade("APPROXIMATE")).toBe(false);
    expect(isAdviceGrade("UNSUPPORTED")).toBe(false);
  });

  it("V9: engaged UNSUPPORTED and substitutive maps to WITHHELD", () => {
    const e: ComponentStatusEntry[] = [
      {
        component: "rrif.transferRetention",
        status: "UNSUPPORTED",
        engaged: true,
        substitutive: true,
      },
    ];
    expect(validityFromComponents(e)).toBe("WITHHELD");
  });

  it("V10: engaged UNSUPPORTED and non-substitutive maps to APPROXIMATE", () => {
    const e: ComponentStatusEntry[] = [
      {
        component: "payroll.employeePremiums",
        status: "UNSUPPORTED",
        engaged: true,
        substitutive: false,
      },
    ];
    expect(validityFromComponents(e)).toBe("APPROXIMATE");
  });

  it("V11: a non-engaged non-VERIFIED component affects nothing", () => {
    const e: ComponentStatusEntry[] = [
      {
        component: "rrif.transferRetention",
        status: "UNSUPPORTED",
        engaged: false,
        substitutive: true,
      },
      {
        component: "taxYear.derived",
        status: "APPROXIMATE",
        engaged: false,
        substitutive: false,
      },
    ];
    expect(validityFromComponents(e)).toBe("OK");
    expect(adviceBlockers(e)).toEqual([]);
  });

  it("V12: recordStatus is not called from the CPP path and is unchanged", () => {
    expect(/recordStatus/.test(SRC("projection.ts"))).toBe(false);
    expect(recordStatus("ON")).toBe("VERIFIED");
    expect(recordStatus("MB")).toBe("APPROXIMATE");
    expect(recordStatus("SK")).toBe("UNSUPPORTED");
  });

  it("V13: exactly one definition of RuleStatus exists, in types.ts", () => {
    const files = [
      "types.ts",
      "registered.ts",
      "projection.ts",
      "engine.ts",
      "analysis.ts",
      "tax.ts",
      "room.ts",
      "nonreg.ts",
      "benefits.ts",
      "taxYears.ts",
      "strategy.ts",
      "scenario.ts",
    ];
    const defs = files.filter((f) => /(export )?type RuleStatus\s*=/.test(SRC(f)));
    expect(defs).toEqual(["types.ts"]);
    expect(/from "\.\/registered"/.test(SRC("types.ts"))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The advice gates                                                    */
/* ------------------------------------------------------------------ */

describe("VALID-1 — advice gates", () => {
  it("A1: auto selection is suppressed on a survivor plan", () => {
    const R = runPlan({ ...survivorPlan, strategy: "auto" }, { startYear: 2026 });
    expect(R.autoSelected).toBe(false);
    expect(R.autoSelectionStatus).toBe("WITHHELD");
    expect(R.chosenStrategy).toBe(AUTO_FALLBACK_STRATEGY);
    expect(R.autoSelectionBlockers).toContain("cpp.survivorReduction");
    expect(R.autoSelectionBlockers).toContain("cpp.survivorBaseCap");
  });

  it("A2: a plan with no death still auto-selects and ranks as before", () => {
    const R = runPlan({ ...coupleGoldenFixturePlan(), strategy: "auto" }, { startYear: 2026 });
    expect(R.autoSelected).toBe(true);
    expect(R.autoSelectionStatus).toBeUndefined();
    expect(R.autoSelectionNote).toBeUndefined();
    expect(R.autoSelectionBlockers).toBeUndefined();
  });

  it("A3: the non-auto branch is unaffected on a survivor plan", () => {
    const R = runPlan({ ...survivorPlan, strategy: "reg_nonreg_tfsa" }, { startYear: 2026 });
    expect(R.chosenStrategy).toBe("reg_nonreg_tfsa");
    expect(R.autoSelected).toBe(false);
    expect(R.autoSelectionStatus).toBeUndefined();
  });

  it("A4: AUTO_FALLBACK_STRATEGY is a member of FIXED_STRATEGIES", () => {
    expect(FIXED_STRATEGIES).toContain(AUTO_FALLBACK_STRATEGY);
  });

  it("A5: runPlan does not read ProjectionResult.validity", () => {
    expect(/\.validity\b/.test(SRC("engine.ts"))).toBe(false);
  });

  it("A6: blockers are the deduplicated union across every candidate", () => {
    const union = new Set<string>();
    for (const s of FIXED_STRATEGIES) {
      const P = projection(survivorPlan, { startYear: 2026, strategy: s });
      for (const b of automaticSelectionBlockers(P.componentStatuses)) union.add(b.component);
    }
    const R = runPlan({ ...survivorPlan, strategy: "auto" }, { startYear: 2026 });
    expect([...(R.autoSelectionBlockers ?? [])].sort()).toEqual([...union].sort());
    expect(new Set(R.autoSelectionBlockers).size).toBe(R.autoSelectionBlockers!.length);
  });

  it("A7: strategy comparison is unranked and delta-free on a survivor plan", () => {
    const rows = compareStrategies(survivorPlan, "nonreg_reg_tfsa");
    expect(rows.map((r) => r.key)).toEqual([...FIXED_STRATEGIES]);
    expect(rows.every((r) => r.comparisonWithheld === true)).toBe(true);
    expect(rows.every((r) => r.estateDelta === 0)).toBe(true);
  });

  it("A8: VALID-2 statuses suppress comparison advice on a no-death plan", () => {
    const rows = compareStrategies(coupleGoldenFixturePlan(), "nonreg_reg_tfsa");
    expect(rows.map((r) => r.key)).toEqual([...FIXED_STRATEGIES]);
    expect(rows.every((r) => r.comparisonWithheld === true)).toBe(true);
    expect(rows.every((r) => r.estateDelta === 0)).toBe(true);
  });

  it("A9: no projection-derived recommendation survives on a survivor plan", () => {
    const P = runPlan(survivorPlan, { startYear: 2026 });
    const strategies = compareStrategies(survivorPlan, P.chosenStrategy);
    const goal = goalProgress(survivorPlan, P);
    const recs = buildRecommendations(survivorPlan, P, strategies, goal);
    const ids = recs.map((r) => r.id);
    for (const banned of [
      "strategy",
      "shortfall",
      "funded",
      "portfolio-exhausted",
      "oas",
      "bracket",
      "split",
    ]) {
      expect(ids).not.toContain(banned);
    }
    expect(ids.some((id) => id.startsWith("cpp-"))).toBe(false);
  });

  it("A10: input-only recommendations survive, alongside the withheld notice", () => {
    const base = survivorPlan;
    const plan: PlanInputs = {
      ...base,
      people: [base.people[0]!, { ...base.people[1]!, tfsaRoom: 50000 }],
      liabilities: [{ id: "l1", name: "Line of credit", bal: 50000, rate: 0.09, pay: 6000 }],
    };
    const P = runPlan(plan, { startYear: 2026 });
    const strategies = compareStrategies(plan, P.chosenStrategy);
    const goal = goalProgress(plan, P);
    const ids = buildRecommendations(plan, P, strategies, goal).map((r) => r.id);
    expect(ids).toContain("tfsa");
    expect(ids).toContain("debt");
    expect(ids).toContain("recommendations-withheld");
  });

  it("A11: VALID-2 statuses suppress derived recommendations without a death", () => {
    const plan = coupleGoldenFixturePlan();
    const P = runPlan(plan, { startYear: 2026 });
    const strategies = compareStrategies(plan, P.chosenStrategy);
    const goal = goalProgress(plan, P);
    const ids = buildRecommendations(plan, P, strategies, goal).map((r) => r.id);
    expect(ids).toContain("recommendations-withheld");
    expect(ids.some((id) => ["funded", "shortfall"].includes(id))).toBe(false);
  });

  it("A12: a withheld strategy comparison suppresses projection recommendations", () => {
    const plan = coupleGoldenFixturePlan();
    const P = runPlan(plan, { startYear: 2026 });
    const strategies = compareStrategies(plan, P.chosenStrategy).map((r, i) =>
      i === 0 ? { ...r, comparisonWithheld: true } : r,
    );
    const ids = buildRecommendations(plan, P, strategies, goalProgress(plan, P)).map((r) => r.id);
    expect(ids).toContain("recommendations-withheld");
    for (const banned of ["strategy", "shortfall", "funded", "portfolio-exhausted", "oas", "bracket", "split"]) {
      expect(ids).not.toContain(banned);
    }
  });
});

/* ------------------------------------------------------------------ */
/* CPP-1 Defect A                                                      */
/* ------------------------------------------------------------------ */

describe("CPP-1 Defect A — the s.58 own-pension argument", () => {
  it("C1: at survivor age 75 the benefit is identical at commencement 60/65/70", () => {
    const vals = [60, 65, 70].map(
      (a) => survivorBenefitAt(survivorProbePlan({ survAge: 75, survCppAge: a }), 0).benefit,
    );
    expect(vals[1]).toBeCloseTo(vals[0]!, 6);
    expect(vals[2]).toBeCloseTo(vals[0]!, 6);
    expect(vals[0]!).toBeGreaterThan(0);
  });

  it("C1b: at survivor age 67, 60 and 65 match and 70 differs (not yet payable)", () => {
    const at = (a: number) =>
      survivorBenefitAt(survivorProbePlan({ survAge: 67, survCppAge: a }), 0).benefit;
    expect(at(65)).toBeCloseTo(at(60), 6);
    expect(Math.abs(at(70) - at(65))).toBeGreaterThan(1);
  });

  it("C2: a zero CPP entitlement is not treated as an own pension", () => {
    const plan = survivorProbePlan({ survAge: 75, survCppAge: 65, survCppAmt: 0 });
    const { benefit } = survivorBenefitAt(plan, 0);
    const ty = getTaxYear(2026, 0);
    expect(benefit).toBeCloseTo(
      cppSurvivorBenefit(plan.people[0]!.cpp.amt, 75, 0, 1, ty),
      6,
    );
  });

  it("C3: the deceased's commencement age does not change the benefit", () => {
    const a = survivorBenefitAt(
      survivorProbePlan({ survAge: 75, survCppAge: 65, decCppAge: 60 }),
      0,
    ).benefit;
    const b = survivorBenefitAt(
      survivorProbePlan({ survAge: 75, survCppAge: 65, decCppAge: 70 }),
      0,
    ).benefit;
    expect(a).toBeCloseTo(b, 6);
  });

  it("C4: the s.58 argument indexes by infFac, not by years since commencement", () => {
    const infl = 0.021;
    const plan = survivorProbePlan({
      survAge: 75,
      survCppAge: 60,
      inflation: infl,
      endAgeOffset: 4,
    });
    const off = 3;
    const { benefit } = survivorBenefitAt(plan, off);
    const infFac = Math.pow(1 + infl, off);
    const ty = getTaxYear(2026 + off, undefined);
    const amt = plan.people[1]!.cpp.amt;
    const expected = cppSurvivorBenefit(
      plan.people[0]!.cpp.amt * infFac,
      75 + off,
      amt * infFac,
      infFac,
      ty,
    );
    const commencementBasis = cppSurvivorBenefit(
      plan.people[0]!.cpp.amt * infFac,
      75 + off,
      amt * Math.pow(1 + infl, 75 + off - 60),
      infFac,
      ty,
    );
    expect(benefit).toBeCloseTo(expected, 4);
    expect(Math.abs(expected - commencementBasis)).toBeGreaterThan(1);
  });

  it("C5: rawCpp — the survivor's own pension as received — is unchanged", () => {
    const infl = 0.021;
    const plan = survivorProbePlan({
      survAge: 75,
      survCppAge: 60,
      inflation: infl,
      endAgeOffset: 3,
    });
    const off = 2;
    const { benefit, own } = survivorBenefitAt(plan, off);
    const b = plan.people[1]!;
    // Own pension keeps cppFactor() and its commencement-relative index basis.
    expect(own).toBeCloseTo(
      b.cpp.amt * cppFactor(60) * Math.pow(1 + infl, 75 + off - 60),
      6,
    );
    expect(benefit).toBeGreaterThan(0);
  });

  it("C6: the reason code is raised on the survivor rows and no earlier row", () => {
    const P = projection(survivorGoldenFixturePlan(), { startYear: 2026 });
    P.rows.forEach((r, i) => {
      const has = r.validityReasons.some(
        (x) => x.code === "CPP_SURVIVOR_REDUCTION_APPROXIMATE",
      );
      expect(has).toBe(i >= 8);
    });
  });

  it("C8: a survivor benefit clamped to exactly zero still engages the components", () => {
    const ty = getTaxYear(2026, 0);
    // Own CPP large enough that max(0, cppCombinedMax - own) is nil.
    const plan = survivorProbePlan({
      survAge: 75,
      survCppAge: 65,
      survCppAmt: ty.cppCombinedMax + 5000,
    });
    // Pin the case: the s.58 result is exactly zero, with base65 > 0.
    expect(
      cppSurvivorBenefit(plan.people[0]!.cpp.amt, 75, ty.cppCombinedMax + 5000, 1, ty),
    ).toBe(0);
    expect(plan.people[0]!.cpp.amt).toBeGreaterThan(0);

    const P = projection(plan, { startYear: 2026 });
    const row = P.rows[0]!;
    expect(row.validity).toBe("APPROXIMATE");
    expect(row.validityReasons.some((r) => r.code === "CPP_SURVIVOR_REDUCTION_APPROXIMATE")).toBe(
      true,
    );
    for (const c of ["cpp.survivorReduction", "cpp.survivorBaseCap"]) {
      const entry = P.componentStatuses.find((e) => e.component === c);
      expect(entry).toBeDefined();
      expect(entry!.engaged).toBe(true);
    }

    const R = runPlan({ ...plan, strategy: "auto" }, { startYear: 2026 });
    expect(R.autoSelected).toBe(false);
    expect(R.autoSelectionStatus).toBe("WITHHELD");

    const strategies = compareStrategies(plan, R.chosenStrategy);
    expect(strategies.every((r) => r.comparisonWithheld === true)).toBe(true);

    const base = runPlan(plan, { startYear: 2026 });
    const ids = buildRecommendations(
      plan,
      base,
      strategies,
      goalProgress(plan, base),
    ).map((r) => r.id);
    for (const banned of ["strategy", "shortfall", "funded", "portfolio-exhausted", "oas", "bracket", "split"]) {
      expect(ids).not.toContain(banned);
    }
    expect(ids).toContain("recommendations-withheld");
  });

  it("C7: no test in this suite asserts the survivor reduction structure", () => {
    const self = readFileSync("src/lib/planning/e1.test.ts", "utf8");
    // Built at runtime so this assertion does not match itself.
    expect(self.includes(["Max", "Base"].join(""))).toBe(false);
    expect(self.includes(["MP", "EA"].join(""))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Survivor golden fixture                                             */
/* ------------------------------------------------------------------ */

describe("Survivor golden fixture", () => {
  it("F1: 26 rows, funded in every one", () => {
    const P = projection(survivorGoldenFixturePlan(), { startYear: 2026 });
    expect(P.rows.length).toBe(26);
    expect(P.rows.some((r) => r.fundingShortfall)).toBe(false);
  });

  it("F2: the survivor reason appears on exactly 18 rows, off 8..25", () => {
    const P = projection(survivorGoldenFixturePlan(), { startYear: 2026 });
    const flagged = P.rows.filter((r) =>
      r.validityReasons.some((x) => x.code === "CPP_SURVIVOR_REDUCTION_APPROXIMATE"),
    );
    expect(flagged.length).toBe(18);
    expect(flagged[0]!.off).toBe(8);
    expect(flagged[flagged.length - 1]!.off).toBe(25);
  });

  it("F3: the fixture contains no registered account", () => {
    const types = survivorGoldenFixturePlan().accounts.map((a) => a.type);
    expect(types).toEqual(["NONREG"]);
  });

  it("survivor golden lifetime tax anchor", () => {
    const P = projection(survivorGoldenFixturePlan(), { startYear: 2026 });
    expect(Math.round(lifetimeTax(P))).toBe(SURVIVOR_GOLDEN_LIFETIME_TAX);
  });
});

/**
 * Pinned on the first green E1 run. Do not adjust without tracing the cause.
 */
const SURVIVOR_GOLDEN_LIFETIME_TAX = 274815;
