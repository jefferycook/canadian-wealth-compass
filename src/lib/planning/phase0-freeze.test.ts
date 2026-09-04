import { describe, expect, it } from "vitest";

import { goalProgress } from "./analysis";
import { lifetimeTax, runPlan } from "./engine";
import {
  frozenAccumulationPlan,
  frozenCouplePlan,
  frozenGoalDivergencePlan,
  frozenLockedInPlan,
  frozenRegressionPlan,
  frozenRetentionLossPlan,
  frozenSurvivorPlan,
} from "./phase0-freeze.fixtures";
import { projection } from "./projection";
import { rrifMinFactor } from "./registered";
import { summarize } from "./summary";

const START_YEAR = 2026;

describe("Phase 0 economic freeze", () => {
  it("F0-1: seven economic anchors remain frozen", () => {
    const single = frozenRegressionPlan();
    const locked = projection(frozenLockedInPlan(), { startYear: START_YEAR });
    const raw = [
      lifetimeTax(runPlan(single, { startYear: START_YEAR })),
      lifetimeTax(runPlan({ ...single, indexationRate: 0 }, { startYear: START_YEAR })),
      lifetimeTax(projection(frozenCouplePlan(), { startYear: START_YEAR })),
      lifetimeTax(projection(frozenAccumulationPlan(), { startYear: START_YEAR })),
      lifetimeTax(locked),
      locked.rows[locked.rows.length - 1]!.totalPortfolio,
      lifetimeTax(projection(frozenSurvivorPlan(), { startYear: START_YEAR })),
    ];

    const expected = [
      202529.63101576085, 281104.7871018497, 406524.2587903573, 1756006.388544313,
      113282.75217087875, 131458.02973093285, 274814.67627053545,
    ];
    raw.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 6));
    expect(raw.map(Math.round)).toEqual([202530, 281105, 406524, 1756006, 113283, 131458, 274815]);
  });

  it("F0-2: E2-1 RRIF transfer retention remains frozen", () => {
    const locked = projection(frozenLockedInPlan(), { startYear: START_YEAR });
    const openingAt65 = locked.rows.find((row) => row.age === 64)!.balances["acc_lira"]!;
    const retainedMinimum = openingAt65 * (rrifMinFactor(65) / 100);
    const transferredToPrrif = openingAt65 - retainedMinimum;
    const defensive = projection(frozenRetentionLossPlan(), { startYear: START_YEAR });
    const transferRetention = defensive.componentStatuses.find(
      ({ component }) => component === "rrif.transferRetention",
    );

    expect(retainedMinimum).toBe(8398.825698224313);
    expect(transferredToPrrif).toBe(201571.8167573835);
    expect(transferRetention?.engaged).toBe(false);
    expect(
      defensive.validityReasons.some(({ code }) => code === "RRIF_TRANSFER_RETENTION_NOT_ENFORCED"),
    ).toBe(false);
  });

  it("F0-3: Goal divergence and blocker remain frozen", () => {
    const plan = frozenGoalDivergencePlan();
    const outer = runPlan(plan, { startYear: START_YEAR });
    const output = summarize(outer);
    const goal = goalProgress(plan, outer);

    expect(output.adviceGate.adviceWithheld).toBe(false);
    expect(goal.adviceGate.adviceWithheld).toBe(true);
    expect(goal.adviceGate.adviceBlockers).toContain("estate.afterTaxHaircut");
    expect(goal.requiredToday).toBe(23776);
    expect(goal.requiredToday - 20000).toBe(3776);
    expect(goal.fundedRatio).toBeCloseTo(0.8411843876177658, 12);
  });

  it("F0-4: whole-year RRIF age basis remains approximate and engaged", () => {
    const result = projection(frozenLockedInPlan(), { startYear: START_YEAR });
    const ageBasis = result.componentStatuses.find(
      ({ component }) => component === "rrif.ageBasisWholeYear",
    );

    expect(ageBasis).toMatchObject({ status: "APPROXIMATE", engaged: true });
    expect(result.validityReasons).toContainEqual(
      expect.objectContaining({ code: "RRIF_AGE_BASIS_WHOLE_YEAR" }),
    );
  });
});
