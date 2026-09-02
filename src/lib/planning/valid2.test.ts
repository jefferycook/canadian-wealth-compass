import { describe, expect, it } from "vitest";

import { buildRecommendations, compareStrategies, goalProgress } from "./analysis";
import { AUTO_SELECTION_NOTE, lifetimeTax, runPlan } from "./engine";
import {
  accumulationGoldenFixturePlan,
  coupleGoldenFixturePlan,
  lockedInGoldenFixturePlan,
  regressionFixturePlan,
  survivorGoldenFixturePlan,
} from "./fixtures";
import { projection } from "./projection";
import { UNLOCK_COMPONENTS, UNLOCK_RULES } from "./registered";
import {
  COMPONENT_STATUS_REGISTRY,
  LOCKED_IN_STATUS_SOURCES,
  ComponentDisclosureCollector,
  ComponentStatusTracker,
  lockedInStatusSource,
  validityFromComponents,
  type ComponentId,
  type PlanInputs,
  type ProjectionResult,
  type WithdrawalStrategy,
} from "./types";

function component(P: ProjectionResult, id: ComponentId) {
  const entry = P.componentStatuses.find((x) => x.component === id);
  expect(entry, `missing ${id}`).toBeDefined();
  return entry!;
}

function minimalPlan(strategy: WithdrawalStrategy = "nonreg_reg_tfsa"): PlanInputs {
  const base = regressionFixturePlan();
  return {
    ...base,
    planType: "single",
    endAge: 60,
    spendNeed: 30000,
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

function lockedPlan(juris: "AB" | "ON", type: "LIF" | "LIRA" = "LIF"): PlanInputs {
  const base = minimalPlan();
  return {
    ...base,
    people: [{ ...base.people[0]!, curAge: 60, retAge: 60 }],
    accounts: [
      {
        ...base.accounts[0]!,
        id: "locked",
        name: `${juris} ${type}`,
        type,
        juris,
        bal: 200000,
        acb: 0,
        conv: type === "LIRA" ? 50 : 0,
        unlock: type === "LIRA" ? 50 : 0,
      },
    ],
  };
}

function recommendationIds(plan: PlanInputs): string[] {
  const P = runPlan(plan, { startYear: 2026 });
  const strategies = compareStrategies(plan, P.chosenStrategy);
  return buildRecommendations(plan, P, strategies, goalProgress(plan, P)).map((r) => r.id);
}

function uniqueShortfallAutoPlan(): PlanInputs {
  const base = regressionFixturePlan();
  return {
    ...base,
    strategy: "auto",
    endAge: 90,
    spendNeed: 55000,
    accounts: base.accounts.map((account) =>
      account.type === "TFSA"
        ? { ...account, bal: 250000, acb: 250000 }
        : account,
    ),
  };
}

describe("VALID-2 — universal component-status coverage", () => {
  it("V2-1: employment exposes unsupported premiums and suppresses derived advice", () => {
    const base = minimalPlan();
    const plan: PlanInputs = {
      ...base,
      people: [{ ...base.people[0]!, retAge: 65, employ: 80000 }],
    };
    const P = runPlan(plan, { startYear: 2026 });
    const payroll = component(P, "payroll.employeePremiums");

    expect(payroll).toMatchObject({
      status: "UNSUPPORTED",
      substitutive: false,
      engaged: true,
    });
    const reason = P.validityReasons.find((x) => x.code === "PAYROLL_PREMIUMS_NOT_MODELLED");
    expect(reason?.detail).toMatch(/CPP, CPP2 and EI premiums are not deducted/i);
    expect(reason?.detail).toMatch(/spendable cash is therefore? overstated|spendable cash is overstated/i);
    expect(recommendationIds(plan)).toContain("recommendations-withheld");
  });

  it("V2-2: a zero-employment retiree does not engage payroll and keeps advice", () => {
    const plan = minimalPlan();
    const P = runPlan(plan, { startYear: 2026 });

    expect(component(P, "payroll.employeePremiums").engaged).toBe(false);
    const ids = recommendationIds(plan);
    expect(ids).not.toContain("recommendations-withheld");
    expect(ids.some((id) => id === "funded" || id === "shortfall")).toBe(true);
  });

  it("V2-3: an applied non-Ontario approximate LIF maximum suppresses advice", () => {
    const plan = lockedPlan("AB");
    const P = runPlan(plan, { startYear: 2026 });

    expect(component(P, "lockedIn.lifMaximum")).toMatchObject({
      status: "APPROXIMATE",
      substitutive: false,
      engaged: true,
    });
    expect(P.rows[0]!.validity).toBe("APPROXIMATE");
    expect(P.rows[0]!.validityReasons.map((x) => x.code)).toContain(
      "LIF_MAXIMUM_NOT_VERIFIED",
    );
    expect(recommendationIds(plan)).toContain("recommendations-withheld");
  });

  it("V2-4: a verified Ontario LIF maximum does not engage that component", () => {
    const P = runPlan(lockedPlan("ON"), { startYear: 2026 });
    expect(component(P, "lockedIn.lifMaximum")).toMatchObject({
      status: "VERIFIED",
      engaged: false,
    });
  });

  it("V2-5: the estate haircut engages only when it determines automatic ordering", () => {
    const noEstateDecision = runPlan(uniqueShortfallAutoPlan(), { startYear: 2026 });
    expect(noEstateDecision.autoSelected).toBe(true);
    expect(component(noEstateDecision, "estate.afterTaxHaircut")).toMatchObject({
      status: "APPROXIMATE",
      substitutive: false,
      engaged: false,
    });
    expect(noEstateDecision.autoSelectionStatus).toBeUndefined();
    expect(noEstateDecision.autoSelectionNote).toBeUndefined();

    const estateDecision = runPlan(
      { ...accumulationGoldenFixturePlan(), strategy: "auto" },
      { startYear: 2026 },
    );
    expect(estateDecision.autoSelected).toBe(true);
    expect(component(estateDecision, "estate.afterTaxHaircut")).toMatchObject({
      status: "APPROXIMATE",
      substitutive: false,
      engaged: true,
    });
    expect(estateDecision.autoSelectionStatus).toBe("APPROXIMATE");
    expect(estateDecision.autoSelectionNote).toBe(AUTO_SELECTION_NOTE);
    expect(
      recommendationIds({ ...accumulationGoldenFixturePlan(), strategy: "auto" }),
    ).toContain("recommendations-withheld");
  });

  it("V2-6: only a derived tax-year record engages taxYear.derived", () => {
    const published = projection(minimalPlan(), { startYear: 2026 });
    const derivedPlan = { ...minimalPlan(), endAge: 62 };
    const derived = projection(derivedPlan, { startYear: 2026 });

    expect(component(published, "taxYear.derived").engaged).toBe(false);
    expect(component(derived, "taxYear.derived")).toMatchObject({
      status: "APPROXIMATE",
      engaged: true,
    });
    expect(published.rows[0]!.validity).toBe("OK");
    expect(derived.rows[0]!.validity).toBe("OK");
    expect(derived.rows[1]!.validity).toBe("APPROXIMATE");
    expect(derived.rows[1]!.validityReasons.map((x) => x.code)).toContain(
      "TAX_YEAR_DERIVED",
    );
    expect(derived.rows[2]!.validity).toBe("APPROXIMATE");
    expect(derived.rows[2]!.validityReasons.map((x) => x.code)).toContain(
      "TAX_YEAR_DERIVED",
    );
  });

  it("V2-7: isolated approximate unlock wiring engages only when used", () => {
    const source = lockedInStatusSource("unlockEntitlement", "APPROXIMATE");
    const usedRow = new ComponentStatusTracker();
    const usedRun = new ComponentStatusTracker();
    const usedDisclosures = new ComponentDisclosureCollector();
    usedDisclosures.addForStatus(
      usedRow,
      usedRun,
      source,
      true,
      "isolated approximate unlock",
    );

    const unusedRow = new ComponentStatusTracker();
    const unusedRun = new ComponentStatusTracker();
    const unusedDisclosures = new ComponentDisclosureCollector();
    unusedDisclosures.addForStatus(
      unusedRow,
      unusedRun,
      source,
      false,
      "must not be emitted",
    );

    expect(usedRun.entries().find((x) => x.component === source.component)).toMatchObject({
      status: "APPROXIMATE",
      engaged: true,
    });
    expect(validityFromComponents(usedRow.entries())).toBe("APPROXIMATE");
    expect(usedDisclosures.values()).toEqual(["isolated approximate unlock"]);
    expect(unusedRun.entries().find((x) => x.component === source.component)).toMatchObject({
      status: "APPROXIMATE",
      engaged: false,
    });
    expect(validityFromComponents(unusedRow.entries())).toBe("OK");
    expect(unusedDisclosures.values()).toEqual([]);
  });

  it("V2-8: RRIF/LIF factor use engages the whole-year age basis", () => {
    const unrelated = projection(minimalPlan(), { startYear: 2026 });
    const rrifPlan = lockedPlan("ON");
    rrifPlan.accounts[0] = { ...rrifPlan.accounts[0]!, type: "RRIF", juris: "ON" };
    const rrif = projection(rrifPlan, { startYear: 2026 });

    expect(component(unrelated, "rrif.ageBasisWholeYear").engaged).toBe(false);
    expect(component(rrif, "rrif.ageBasisWholeYear")).toMatchObject({
      status: "APPROXIMATE",
      engaged: true,
    });
    expect(rrif.rows[0]!.validity).toBe("APPROXIMATE");
    expect(rrif.rows[0]!.validityReasons.map((x) => x.code)).toContain(
      "RRIF_AGE_BASIS_WHOLE_YEAR",
    );
  });

  it("V2-9: one authoritative schema exhaustively couples statuses and disclosures", () => {
    const P = projection(minimalPlan(), { startYear: 2026 });
    expect(P.componentStatuses.map((x) => x.component)).toEqual(
      Object.keys(COMPONENT_STATUS_REGISTRY),
    );

    expect(UNLOCK_COMPONENTS).toEqual(Object.keys(LOCKED_IN_STATUS_SOURCES));
    expect(Object.values(LOCKED_IN_STATUS_SOURCES).map((x) => x.component)).toEqual(
      Object.keys(COMPONENT_STATUS_REGISTRY).filter((x) => x.startsWith("lockedIn.")),
    );
    for (const rule of Object.values(UNLOCK_RULES)) {
      const statusBearingKeys = Object.entries(rule)
        .filter(
          ([, value]) =>
            typeof value === "object" &&
            value != null &&
            "status" in value &&
            ["VERIFIED", "APPROXIMATE", "UNSUPPORTED"].includes(
              String((value as { status: unknown }).status),
            ),
        )
        .map(([key]) => key)
        .sort();
      expect(statusBearingKeys).toEqual([...UNLOCK_COMPONENTS].sort());
    }

    const tracker = new ComponentStatusTracker();
    expect(() =>
      tracker.engage("future.disclosureOnlyStatus" as ComponentId, "APPROXIMATE"),
    ).toThrow(/unregistered component status/i);
    expect(() =>
      tracker.observe("cpp.survivorOwnPensionUnadjusted", "APPROXIMATE"),
    ).toThrow(/no registered reason/i);
  });

  it("V2-10: all seven numerical anchors remain bit-identical", () => {
    const single = regressionFixturePlan();
    const locked = projection(lockedInGoldenFixturePlan(), { startYear: 2026 });

    expect(Math.round(lifetimeTax(runPlan(single, { startYear: 2026 })))).toBe(202530);
    expect(
      Math.round(
        lifetimeTax(runPlan({ ...single, indexationRate: 0 }, { startYear: 2026 })),
      ),
    ).toBe(281105);
    expect(
      Math.round(lifetimeTax(projection(coupleGoldenFixturePlan(), { startYear: 2026 }))),
    ).toBe(406524);
    expect(
      Math.round(lifetimeTax(runPlan(accumulationGoldenFixturePlan(), { startYear: 2026 }))),
    ).toBe(1756006);
    expect(Math.round(lifetimeTax(locked))).toBe(113283);
    expect(Math.round(locked.rows[locked.rows.length - 1]!.totalPortfolio)).toBe(131458);
    expect(
      Math.round(lifetimeTax(projection(survivorGoldenFixturePlan(), { startYear: 2026 }))),
    ).toBe(274815);
  });
});
