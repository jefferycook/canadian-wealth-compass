import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GoalPanel } from "@/components/plan/PlanInsights";
import { opportunitiesVisibleForGate } from "@/components/plan/PlanOpportunities";
import { PlanResults } from "@/components/plan/PlanResults";
import {
  AdviceGateDisclosure,
  AutoSelectionDisclosure,
  ProjectionValidityDisclosure,
} from "@/components/plan/ProjectionValidityDisclosure";
import { ComparisonTable } from "@/components/plan/scenario-ui";
import { buildRecommendations, compareStrategies, goalProgress } from "./analysis";
import { draftFromInputs } from "./draft";
import { AUTO_FALLBACK_STRATEGY, lifetimeTax, runPlan } from "./engine";
import {
  accumulationGoldenFixturePlan,
  coupleGoldenFixturePlan,
  lockedInGoldenFixturePlan,
  regressionFixturePlan,
  survivorGoldenFixturePlan,
} from "./fixtures";
import { buildOpportunities } from "./opportunities";
import { projection } from "./projection";
import { rrifMinFactor } from "./registered";
import {
  adviceGateForComparison,
  runScenario,
  runScenarioSet,
  runStrategyComparison,
} from "./scenario";
import { summarize } from "./summary";
import type { AccountInput, PlanInputs, WithdrawalStrategy } from "./types";

function minimalPlan(strategy: WithdrawalStrategy = "nonreg_reg_tfsa"): PlanInputs {
  const base = regressionFixturePlan();
  return {
    ...base,
    planType: "single",
    endAge: 60,
    spendNeed: 30000,
    currentSpend: 30000,
    strategy,
    people: [
      {
        ...base.people[0]!,
        curAge: 60,
        retAge: 60,
        employ: 0,
        cpp: { amt: 0, age: 65 },
        oas: { amt: 0, age: 65 },
        pen: { amt: 0, age: 65 },
        bridge: { amt: 0, end: 65 },
      },
    ],
    accounts: [
      {
        id: "tfsa",
        name: "TFSA",
        type: "TFSA",
        owner: "A",
        bal: 100000,
        acb: 100000,
        eq: 50,
        mix: { int: 0.5, div: 0.25, cg: 0.25 },
        juris: "ON",
        conv: 0,
        unlock: 0,
        contrib: 0,
        contribEnd: 0,
        wd: 0,
        wdStart: 0,
        wdEnd: 0,
      },
    ],
    expenses: [],
    otherIncome: [],
    lumpSums: [],
    hardAssets: [],
    liabilities: [],
  };
}

function estateTiePlan(strategy: WithdrawalStrategy = "auto"): PlanInputs {
  const base = minimalPlan(strategy);
  return {
    ...base,
    accounts: [
      base.accounts[0]!,
      {
        ...base.accounts[0]!,
        id: "rrsp",
        name: "RRSP",
        type: "RRSP",
        bal: 100000,
        acb: 0,
      },
    ],
  };
}

function payrollPlan(): PlanInputs {
  const base = minimalPlan();
  return {
    ...base,
    people: [{ ...base.people[0]!, retAge: 65, employ: 80000 }],
  };
}

function goalSolverDivergencePlan(): PlanInputs {
  const base = regressionFixturePlan();
  const accountBase = base.accounts[0]!;
  return {
    ...base,
    planType: "single",
    endAge: 60,
    spendNeed: 25000,
    currentSpend: 25000,
    strategy: "auto",
    people: [
      {
        ...base.people[0]!,
        curAge: 60,
        retAge: 60,
        employ: 0,
        deathAge: 0,
        cpp: { amt: 0, age: 65 },
        oas: { amt: 0, age: 65 },
        pen: { amt: 0, age: 65 },
        bridge: { amt: 0, end: 65 },
      },
    ],
    accounts: [
      {
        ...accountBase,
        id: "tfsa",
        name: "TFSA",
        type: "TFSA",
        owner: "A",
        bal: 10000,
        acb: 10000,
        juris: "ON",
        conv: 0,
        unlock: 0,
        contrib: 0,
        contribEnd: 0,
        wd: 0,
        wdStart: 0,
        wdEnd: 0,
      },
      {
        ...accountBase,
        id: "rrsp",
        name: "RRSP",
        type: "RRSP",
        owner: "A",
        bal: 10000,
        acb: 0,
        juris: "ON",
        conv: 0,
        unlock: 0,
        contrib: 0,
        contribEnd: 0,
        wd: 0,
        wdStart: 0,
        wdEnd: 0,
      },
    ],
    expenses: [],
    otherIncome: [],
    lumpSums: [],
    hardAssets: [],
    liabilities: [],
  };
}

function retentionLossPlan(): PlanInputs {
  const base = regressionFixturePlan();
  const account: AccountInput = {
    id: "lif",
    name: "lif",
    type: "LIF",
    owner: "A",
    bal: 400000,
    acb: 0,
    eq: 0,
    mix: { int: 1, div: 0, cg: 0 },
    juris: "MB",
    conv: 55,
    unlock: 100,
    contrib: 0,
    contribEnd: 0,
    wd: 0,
    wdStart: 0,
    wdEnd: 0,
  };
  return {
    ...base,
    planType: "single",
    inflation: 0,
    indexationRate: 0,
    eqRet: -0.5,
    fiRet: -0.5,
    spendNeed: 0,
    currentSpend: 0,
    strategy: "nonreg_reg_tfsa",
    endAge: 68,
    people: [
      {
        ...base.people[0]!,
        curAge: 66,
        retAge: 66,
        employ: 0,
        cpp: { amt: 0, age: 65 },
        oas: { amt: 0, age: 65 },
        pen: { amt: 0, age: 65 },
        bridge: { amt: 0, end: 65 },
      },
    ],
    accounts: [account],
    expenses: [],
    otherIncome: [],
    lumpSums: [],
    hardAssets: [],
    liabilities: [],
  };
}

describe("P0-GATE — live projection advice gates", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  });

  afterAll(() => vi.useRealTimers());

  it("P0G-1: survivor live Strategies data and deltas are withheld", () => {
    const comparison = runStrategyComparison(draftFromInputs(survivorGoldenFixturePlan()));

    expect(comparison.adviceGate.adviceWithheld).toBe(true);
    expect(comparison.adviceGate.adviceBlockers).toEqual(
      expect.arrayContaining(["cpp.survivorReduction", "cpp.survivorBaseCap"]),
    );
    expect(comparison.cards.some((card) => /engine-selected/i.test(card.label))).toBe(false);

    const html = renderToStaticMarkup(
      <ComparisonTable
        left={comparison.current.metrics}
        right={comparison.cards[0]!.metrics}
        adviceGate={comparison.adviceGate}
      />,
    );
    expect(html).toContain("Withheld");
    expect(html).not.toMatch(/favourable|unfavourable|optimal|engine-selected/i);
  });

  it("P0G-2: survivor Opportunities retains reasons but no quantified CPP bypass", () => {
    const draft = draftFromInputs(survivorGoldenFixturePlan());
    const run = runScenario(draft);
    const visible = opportunitiesVisibleForGate(buildOpportunities(draft), run.adviceGate);

    expect(run.adviceGate.adviceWithheld).toBe(true);
    expect(run.adviceGate.adviceReasons.map((reason) => reason.code)).toContain(
      "CPP_SURVIVOR_REDUCTION_APPROXIMATE",
    );
    expect(visible.every((opportunity) => opportunity.patch == null)).toBe(true);
    expect(visible.some((opportunity) => opportunity.id.startsWith("cpp-"))).toBe(false);
  });

  it("P0G-3: payroll withholds Goal, Strategies, What-if and quantified Opportunities", () => {
    const plan = payrollPlan();
    const draft = draftFromInputs(plan);
    const baseline = runScenario(draft);
    const strategies = runStrategyComparison(draft);
    const whatIf = runScenarioSet(draft, { currentSpendMonthly: 2600 });
    const goal = goalProgress(plan, runPlan(plan, { startYear: 2026 }));
    const goalHtml = renderToStaticMarkup(<GoalPanel goal={goal} />);

    expect(baseline.adviceGate.adviceBlockers).toContain("payroll.employeePremiums");
    expect(goalHtml).toContain("Goal assessment withheld");
    expect(goalHtml).not.toMatch(/You are on track|There is a gap to close|Needed today/);
    expect(strategies.adviceGate.adviceWithheld).toBe(true);
    expect(whatIf.comparisonAdviceGate.adviceWithheld).toBe(true);
    expect(
      opportunitiesVisibleForGate(buildOpportunities(draft), baseline.adviceGate).every(
        (opportunity) => opportunity.patch == null,
      ),
    ).toBe(true);
  });

  it("P0G-4: a clean control preserves normal Goal, Strategies and What-if comparisons", () => {
    const plan = minimalPlan();
    const draft = draftFromInputs(plan);
    const baseline = runScenario(draft);
    const strategies = runStrategyComparison(draft);
    const whatIf = runScenarioSet(draft, { currentSpendMonthly: 2600 });
    const goal = goalProgress(plan, runPlan(plan, { startYear: 2026 }));
    const goalHtml = renderToStaticMarkup(<GoalPanel goal={goal} />);

    expect(baseline.adviceGate.adviceWithheld).toBe(false);
    expect(strategies.adviceGate.adviceWithheld).toBe(false);
    expect(whatIf.comparisonAdviceGate.adviceWithheld).toBe(false);
    expect(
      renderToStaticMarkup(
        <ComparisonTable
          left={strategies.current.metrics}
          right={strategies.cards[0]!.metrics}
          adviceGate={strategies.adviceGate}
        />,
      ),
    ).not.toContain("Withheld");
    expect(goalHtml).toMatch(/You are on track|There is a gap to close/);
    expect(goalHtml).toContain("Needed today");
    expect(goalHtml).not.toContain("Goal assessment withheld");
  });

  it("P0G-5: an approximate estate tie-break is separate from projection validity", () => {
    const P = runPlan(estateTiePlan(), { startYear: 2026 });
    const output = summarize(P);
    const autoHtml = renderToStaticMarkup(<AutoSelectionDisclosure output={output} />);

    expect(
      P.componentStatuses.find((entry) => entry.component === "estate.afterTaxHaircut"),
    ).toMatchObject({ engaged: true, status: "APPROXIMATE" });
    expect(P.validity).toBe("OK");
    expect(output.validity).toBe("OK");
    expect(output.autoSelectionStatus).toBe("APPROXIMATE");
    expect(output.adviceGate.adviceBlockers).toContain("estate.afterTaxHaircut");
    expect(autoHtml).toContain('data-auto-selection-status="APPROXIMATE"');
    expect(autoHtml).toContain(P.autoSelectionNote);
    expect(renderToStaticMarkup(<ProjectionValidityDisclosure output={output} />)).toBe("");
  });

  it("P0G-6: a hard-blocked auto run exposes WITHHELD and a fallback", () => {
    const P = runPlan({ ...survivorGoldenFixturePlan(), strategy: "auto" }, { startYear: 2026 });
    const output = summarize(P);
    const comparison = runStrategyComparison(
      draftFromInputs({ ...survivorGoldenFixturePlan(), strategy: "auto" }),
    );
    const html = renderToStaticMarkup(<AutoSelectionDisclosure output={output} />);

    expect(P.autoSelected).toBe(false);
    expect(P.chosenStrategy).toBe(AUTO_FALLBACK_STRATEGY);
    expect(output.autoSelectionStatus).toBe("WITHHELD");
    expect(output.autoSelectionNote).toBe(P.autoSelectionNote);
    expect(output.autoSelectionBlockers).toEqual(P.autoSelectionBlockers);
    expect(comparison.current.label).toBe("Deterministic fallback");
    expect(html).toContain("Automatic selection withheld");
    expect(html).toMatch(/fixed default ordering|fallback/i);
    expect(html).not.toMatch(/engine-selected|optimal/i);
  });

  it("P0G-7: a reachable scenario-only auto tie-break has a distinct gate and reason", () => {
    const draft = draftFromInputs(estateTiePlan("nonreg_reg_tfsa"));
    const baseline = runScenario(draft);
    const scenario = runScenario(draft, { strategy: "auto" });
    const comparison = adviceGateForComparison(baseline.adviceGate, [scenario.adviceGate]);

    expect(baseline.adviceGate.adviceWithheld).toBe(false);
    expect(scenario.adviceGate.adviceWithheld).toBe(true);
    expect(scenario.adviceGate.adviceBlockers).toContain("estate.afterTaxHaircut");
    expect(scenario.adviceGate.adviceReasons.map((reason) => reason.code)).toContain(
      "ESTATE_AFTER_TAX_HAIRCUT_APPROXIMATE",
    );
    expect(comparison.adviceWithheld).toBe(true);
  });

  it("P0G-8: saved-scenario comparison uses the pure per-run gate", () => {
    const draft = draftFromInputs(estateTiePlan("nonreg_reg_tfsa"));
    const baseline = runScenario(draft);
    const blocked = runScenario(draft, { strategy: "auto" });
    const comparison = adviceGateForComparison(baseline.adviceGate, [blocked.adviceGate]);
    const html = renderToStaticMarkup(
      <ComparisonTable left={baseline.metrics} right={blocked.metrics} adviceGate={comparison} />,
    );

    expect(comparison.adviceWithheld).toBe(true);
    expect(html).toContain("Withheld");
  });

  it("P0G-9: approximate projection context remains while advice is suppressed", () => {
    const plan = { ...minimalPlan(), endAge: 62 };
    const output = summarize(runPlan(plan, { startYear: 2026 }));
    const validityHtml = renderToStaticMarkup(<ProjectionValidityDisclosure output={output} />);
    const gateHtml = renderToStaticMarkup(<AdviceGateDisclosure gate={output.adviceGate} />);

    expect(output.validity).toBe("APPROXIMATE");
    expect(output.years).toHaveLength(3);
    expect(output.chart).toHaveLength(3);
    expect(validityHtml).toContain('data-projection-validity="APPROXIMATE"');
    expect(gateHtml).toContain('data-advice-withheld="true"');
  });

  it("P0G-10: legacy strategy/recommendation gates remain frozen", () => {
    const plan = survivorGoldenFixturePlan();
    const P = runPlan(plan, { startYear: 2026 });
    const strategies = compareStrategies(plan, P.chosenStrategy);
    const recommendations = buildRecommendations(plan, P, strategies, goalProgress(plan, P));

    expect(strategies.every((row) => row.comparisonWithheld === true)).toBe(true);
    expect(recommendations.map((item) => item.id)).toContain("recommendations-withheld");
    expect(
      recommendations.every((item) =>
        ["tfsa", "debt", "recommendations-withheld"].includes(item.id),
      ),
    ).toBe(true);
  });

  it("P0G-11: all seven raw and rounded numerical anchors remain frozen", () => {
    const single = regressionFixturePlan();
    const locked = projection(lockedInGoldenFixturePlan(), { startYear: 2026 });
    const raw = [
      lifetimeTax(runPlan(single, { startYear: 2026 })),
      lifetimeTax(runPlan({ ...single, indexationRate: 0 }, { startYear: 2026 })),
      lifetimeTax(projection(coupleGoldenFixturePlan(), { startYear: 2026 })),
      lifetimeTax(runPlan(accumulationGoldenFixturePlan(), { startYear: 2026 })),
      lifetimeTax(locked),
      locked.rows[locked.rows.length - 1]!.totalPortfolio,
      lifetimeTax(projection(survivorGoldenFixturePlan(), { startYear: 2026 })),
    ];

    expect(raw[0]).toBeCloseTo(202529.63101576085, 6);
    expect(raw[1]).toBeCloseTo(281104.7871018497, 6);
    expect(raw[2]).toBeCloseTo(406524.2587903573, 6);
    expect(raw[3]).toBeCloseTo(1756006.388544313, 6);
    expect(raw[4]).toBeCloseTo(113282.75217087875, 6);
    expect(raw[5]).toBeCloseTo(131458.02973093285, 6);
    expect(raw[6]).toBeCloseTo(274814.67627053545, 6);
    expect(raw.map(Math.round)).toEqual([202530, 281105, 406524, 1756006, 113283, 131458, 274815]);
  });

  it("P0G-12: E2-1 retention and defensive status remain frozen", () => {
    const locked = projection(lockedInGoldenFixturePlan(), { startYear: 2026 });
    const openingAt65 = locked.rows.find((row) => row.age === 64)!.balances["acc_lira"]!;
    const retainedMinimum = openingAt65 * (rrifMinFactor(65) / 100);
    const transferredToPrrif = openingAt65 - retainedMinimum;

    expect(retainedMinimum).toBe(8398.825698224313);
    expect(transferredToPrrif).toBe(201571.8167573835);

    const defensive = projection(retentionLossPlan(), { startYear: 2026 });
    expect(
      defensive.componentStatuses.find((entry) => entry.component === "rrif.transferRetention")
        ?.engaged,
    ).toBe(false);
    expect(
      defensive.validityReasons.some(
        (reason) => reason.code === "RRIF_TRANSFER_RETENTION_NOT_ENFORCED",
      ),
    ).toBe(false);
  });

  it("P0G-13: active UI reads authoritative gates without input inference", () => {
    const files = [
      "src/components/plan/PlanInsights.tsx",
      "src/components/plan/PlanStrategies.tsx",
      "src/components/plan/PlanOpportunities.tsx",
      "src/components/plan/PlanWhatIf.tsx",
      "src/components/plan/PlanScenarios.tsx",
    ];
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    const disclosure = readFileSync("src/components/plan/ProjectionValidityDisclosure.tsx", "utf8");

    expect(source).toContain("adviceGate");
    expect(source).toContain("comparisonAdviceGate");
    expect(disclosure).toContain("gate.adviceWithheld");
    for (const forbidden of ["deathAge", "survivorPct", "payroll.employeePremiums", "LIF"]) {
      expect(disclosure).not.toContain(forbidden);
    }
  });

  it("P0G-14: Goal carries an internal-only automatic-selection blocker without changing arithmetic", () => {
    const plan = goalSolverDivergencePlan();
    const outer = runPlan(plan, { startYear: 2026 });
    const output = summarize(outer);
    const goal = goalProgress(plan, outer);
    const html = renderToStaticMarkup(<GoalPanel goal={goal} />);

    expect(output.adviceGate.adviceWithheld).toBe(false);
    expect(outer.autoSelectionStatus).toBeUndefined();
    expect(
      outer.componentStatuses.find((entry) => entry.component === "estate.afterTaxHaircut")
        ?.engaged,
    ).toBe(false);
    expect(goal.adviceGate.adviceWithheld).toBe(true);
    expect(goal.adviceGate.adviceBlockers).toContain("estate.afterTaxHaircut");
    expect(goal.requiredToday).toBe(23776);
    expect(goal.requiredToday - goal.currentSavings).toBe(3776);
    expect(goal.fundedRatio).toBeCloseTo(0.8411843876177658, 15);
    expect(html).toContain("Goal assessment withheld");
    expect(html).not.toMatch(/You are on track|There is a gap to close|Needed today/);
  });

  it("P0G-15: zero-shortfall wording distinguishes blocked context from clean conclusions", () => {
    const blocked = summarize(runPlan(payrollPlan(), { startYear: 2026 }));
    const clean = summarize(runPlan(minimalPlan(), { startYear: 2026 }));
    const blockedHtml = renderToStaticMarkup(<PlanResults output={blocked} />);
    const cleanHtml = renderToStaticMarkup(<PlanResults output={clean} />);
    const cleanConclusion = "Every year of the projection funds your spending target in full.";
    const blockedContext =
      "The projection shows the spending target funded in each modelled year, but no funding conclusion or recommendation is made while projection-derived advice is withheld.";

    expect(blocked.summary.shortfallYears).toBe(0);
    expect(blocked.adviceGate.adviceWithheld).toBe(true);
    expect(blockedHtml).toContain(blockedContext);
    expect(blockedHtml).not.toContain(cleanConclusion);
    expect(blockedHtml).not.toContain("Try retiring later");

    expect(clean.summary.shortfallYears).toBe(0);
    expect(clean.adviceGate.adviceWithheld).toBe(false);
    expect(cleanHtml).toContain(cleanConclusion);
    expect(cleanHtml).not.toContain(blockedContext);
  });
});
