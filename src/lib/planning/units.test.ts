import { describe, expect, it } from "vitest";

import {
  MONTHS_PER_YEAR,
  annualFromMonthly,
  monthlyDisplay,
  monthlyFromAnnual,
  perMonth,
  perMonthWithYear,
  perYear,
} from "./units";
import { runPlan } from "./engine";
import { regressionFixturePlan } from "./fixtures";
import type { PlanInputs } from "./types";

describe("unit normalization", () => {
  it("converts a monthly UI figure to the annual engine figure", () => {
    expect(annualFromMonthly(5000)).toBe(60000);
    expect(annualFromMonthly(0)).toBe(0);
  });

  it("converts an annual engine figure to a monthly display figure", () => {
    expect(monthlyFromAnnual(60000)).toBe(5000);
    expect(monthlyDisplay(100000)).toBe(8333);
  });

  it("keeps 'unanswered' distinct from zero in both directions", () => {
    expect(annualFromMonthly(null)).toBeNull();
    expect(monthlyFromAnnual(null)).toBeNull();
    expect(annualFromMonthly(0)).toBe(0);
    expect(monthlyFromAnnual(0)).toBe(0);
  });

  it("round-trips a monthly entry without drift", () => {
    for (const m of [1, 100, 2500, 8333.33]) {
      expect(monthlyFromAnnual(annualFromMonthly(m))).toBeCloseTo(m, 2);
    }
  });

  it("uses twelve months a year and nothing else", () => {
    expect(MONTHS_PER_YEAR).toBe(12);
    expect(annualFromMonthly(1)).toBe(MONTHS_PER_YEAR);
  });

  it("formats monthly and annual money with an explicit period", () => {
    expect(perMonth(60000)).toContain("/ month");
    expect(perYear(60000)).toContain("/ year");
    expect(perMonthWithYear(60000)).toBe("$5,000 / month ($60,000 / year)");
  });
});

describe("the engine stays annual", () => {
  /**
   * The regression case behind the reported bug: a monthly spending box that
   * stored the number unconverted would have run the plan at twelve times the
   * intended spend. These two plans must differ by exactly that factor.
   */
  function planSpending(annualSpend: number): PlanInputs {
    return { ...regressionFixturePlan(), spendNeed: annualSpend };
  }

  /** A retired year, so the target is retirement spending rather than today's. */
  const retiredTarget = (spend: number) => {
    const P = runPlan(planSpending(spend));
    return P.rows.find((r) => r.age === 70)!.spendTarget;
  };

  it("treats a monthly entry of $8,333 the same as $100,000 a year", () => {
    expect(Math.round(retiredTarget(annualFromMonthly(8333.333333)!))).toBe(
      Math.round(retiredTarget(100000)),
    );
  });

  it("an unconverted monthly figure would spend twelve times as much", () => {
    expect(retiredTarget(annualFromMonthly(100000)!) / retiredTarget(100000)).toBeCloseTo(
      12,
      6,
    );
  });
});
