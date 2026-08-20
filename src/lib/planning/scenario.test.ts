/**
 * Scenario-boundary tests (UX1 fixes A–D).
 *
 * These test the scenario layer only — no engine methodology is asserted here
 * beyond the boundary contracts the UI depends on.
 */

import { describe, expect, it } from "vitest";

import { newPlanDraft, emptyPerson } from "./defaults";
import type { PlanDraft } from "./draft";
import { buildOpportunities } from "./opportunities";
import {
  extraSavingTargets,
  isExtraSavingSupported,
  isLeverActive,
  returnAdjustmentFraction,
  runScenario,
  scenarioOverride,
  scenarioInputs,
} from "./scenario";
import type { AccountInput, PersonInput } from "./types";

function account(over: Partial<AccountInput> = {}): AccountInput {
  return {
    id: "acct1",
    name: "Non-registered",
    type: "NONREG",
    owner: "A",
    bal: 1500000,
    eq: 60,
    acb: 1200000,
    conv: 0,
    unlock: 0,
    contrib: 0,
    contribEnd: 0,
    wd: 0,
    wdStart: 0,
    wdEnd: 0,
    mix: { int: 0.3, div: 0.3, cg: 0.4 },
    ...over,
  } as AccountInput;
}

function baseDraft(): PlanDraft {
  const d = newPlanDraft(2026);
  d.tax.provinceKey = "ON";
  d.spendNeed = 60000;
  d.currentSpend = 60000;
  d.people = [
    {
      ...emptyPerson("A"),
      firstName: "Alex",
      dob: "1966-01-01",
      curAge: 60,
      retAge: 65,
      employ: 100000,
      cpp: { amt: 12000, age: 65 },
      oas: { amt: 8500, age: 65 },
    },
  ];
  d.accounts = [account()];
  return d;
}

function coupleDraft(): PlanDraft {
  const d = baseDraft();
  d.planType = "married";
  d.people = [
    d.people[0]!,
    {
      ...emptyPerson("B"),
      firstName: "Bailey",
      dob: "1968-01-01",
      curAge: 58,
      retAge: 65,
      employ: 80000,
      cpp: { amt: 11000, age: 65 },
      oas: { amt: 8500, age: 65 },
    },
  ];
  return d;
}

/* ---------------- UX1-FIX A: return-adjustment units ---------------- */

describe("return adjustment is percentage points, not a fraction", () => {
  it("converts +1.0 pp to +0.01", () => {
    expect(returnAdjustmentFraction(1)).toBeCloseTo(0.01, 12);
  });

  it("converts -1.0 pp to -0.01", () => {
    expect(returnAdjustmentFraction(-1)).toBeCloseTo(-0.01, 12);
  });

  it("+1.0 pp never becomes +100%", () => {
    const o = scenarioOverride({ returnAdjustment: 1 }, scenarioInputs(baseDraft(), {}));
    expect(o.retDelta).toBeCloseTo(0.01, 12);
    expect(o.retDelta).not.toBe(1);
    expect(Math.abs(o.retDelta!)).toBeLessThan(0.1);
  });

  it("baseline 6% + 1.0 pp = 7%, baseline 6% - 1.0 pp = 5%", () => {
    const base = 0.06;
    const up = scenarioOverride({ returnAdjustment: 1 }, scenarioInputs(baseDraft(), {}));
    const down = scenarioOverride({ returnAdjustment: -1 }, scenarioInputs(baseDraft(), {}));
    expect(base + (up.retDelta ?? 0)).toBeCloseTo(0.07, 12);
    expect(base + (down.retDelta ?? 0)).toBeCloseTo(0.05, 12);
  });

  it("a +1 pp scenario moves the estate a plausible amount, not a runaway one", () => {
    const d = baseDraft();
    const flat = runScenario(d, {}).metrics.afterTaxEstate;
    const up = runScenario(d, { returnAdjustment: 1 }).metrics.afterTaxEstate;
    expect(up).toBeGreaterThan(flat);
    expect(up).toBeLessThan(flat * 3);
  });
});

/* ---------------- UX1-FIX B: registered saving disabled -------------- */

describe("extra saving is limited to an existing non-registered account", () => {
  it("reports the owners of real non-registered accounts", () => {
    expect(extraSavingTargets(baseDraft())).toEqual(["A"]);
  });

  it("is unsupported when the plan has no non-registered account", () => {
    const d = baseDraft();
    d.accounts = [account({ type: "TFSA", name: "TFSA", acb: 0 })];
    expect(isExtraSavingSupported(d)).toBe(false);
    const o = scenarioOverride({ extraMonthlySaving: 500 }, scenarioInputs(d, {}));
    expect(o.goalSaves).toBeUndefined();
  });

  it("never manufactures an account or a pension jurisdiction", () => {
    const d = baseDraft();
    d.accounts = [account({ type: "TFSA", name: "TFSA", acb: 0 })];
    const inputs = scenarioInputs(d, { extraMonthlySaving: 500 });
    expect(inputs.accounts).toHaveLength(1);
    expect(inputs.accounts.some((a) => a.id.startsWith("scenario_"))).toBe(false);
  });

  it("routes supported extra saving to the non-registered account", () => {
    const o = scenarioOverride(
      { extraMonthlySaving: 500 },
      scenarioInputs(baseDraft(), {}),
    );
    expect(o.goalSaves).toEqual([{ amt: 6000, type: "NONREG", owner: "A" }]);
  });

  it("no opportunity proposes registered extra saving", () => {
    for (const draft of [baseDraft(), coupleDraft()]) {
      for (const o of buildOpportunities(draft)) {
        expect(o.patch?.savingAccount ?? "NONREG").toBe("NONREG");
      }
    }
  });
});

/* ---------------- UX1-FIX C: per-person timing ----------------------- */

describe("per-person CPP / OAS / retirement scenario timing", () => {
  function applyMods(patch: Parameters<typeof scenarioOverride>[0], draft: PlanDraft) {
    const inputs = scenarioInputs(draft, {});
    const o = scenarioOverride(patch, inputs);
    const people = inputs.people as PersonInput[];
    o.mods?.(people);
    return people;
  }

  it("changing A's CPP does not modify B's", () => {
    const people = applyMods({ cppAgeByPerson: { A: 60 } }, coupleDraft());
    expect(people[0]!.cpp.age).toBe(60);
    expect(people[1]!.cpp.age).toBe(65);
  });

  it("changing B's OAS does not modify A's", () => {
    const people = applyMods({ oasAgeByPerson: { B: 70 } }, coupleDraft());
    expect(people[0]!.oas.age).toBe(65);
    expect(people[1]!.oas.age).toBe(70);
  });

  it("supports a per-person retirement age", () => {
    const people = applyMods({ retireAgeByPerson: { B: 62 } }, coupleDraft());
    expect(people[0]!.retAge).toBe(65);
    expect(people[1]!.retAge).toBe(62);
  });

  it("an asymmetric couple scenario (A CPP 60, B CPP 70) survives a full re-run", () => {
    const d = coupleDraft();
    const flat = runScenario(d, {});
    const asym = runScenario(d, { cppAgeByPerson: { A: 60, B: 70 } });
    expect(Number.isFinite(asym.metrics.afterTaxEstate)).toBe(true);
    expect(asym.series.length).toBeGreaterThan(0);
    expect(asym.metrics.afterTaxEstate).not.toBe(flat.metrics.afterTaxEstate);
  });

  it("single-person plans stay simple", () => {
    const people = applyMods({ cppAgeByPerson: { A: 70 } }, baseDraft());
    expect(people).toHaveLength(1);
    expect(people[0]!.cpp.age).toBe(70);
  });
});

/* ---------------- UX1-FIX D: unlocking stays informational ----------- */

describe("locked-in unlocking is informational only", () => {
  function lockedDraft(juris: "MB" | "ON" | "FED"): PlanDraft {
    const d = baseDraft();
    d.accounts = [account({ id: "lira", name: "LIRA", type: "LIRA", acb: 0, juris })];
    return d;
  }

  it("never emits a generic percentage unlock patch", () => {
    for (const juris of ["MB", "ON", "FED"] as const) {
      const opp = buildOpportunities(lockedDraft(juris)).find((o) => o.id === "unlock");
      expect(opp).toBeDefined();
      expect(opp!.patch).toBeUndefined();
      expect(opp!.change).toBe("No change is applied.");
    }
  });

  it("does not describe unlocked money generically as 'an RRSP or RRIF'", () => {
    const opp = buildOpportunities(lockedDraft("MB")).find((o) => o.id === "unlock")!;
    expect(`${opp.why} ${opp.tradeoffs}`).not.toContain("an RRSP or RRIF");
  });

  it("no scenario override applies unlockAll", () => {
    const o = scenarioOverride({}, scenarioInputs(lockedDraft("MB"), {}));
    expect(o.unlockAll).toBeUndefined();
  });
});

/* ---------------- UX1-FIX E: metrics follow the executed scenario ---- */

describe("retirement metrics come from the executed scenario", () => {
  it("reports the people the engine actually ran (A 60 / B 68)", () => {
    const d = coupleDraft();
    const run = runScenario(d, { retireAgeByPerson: { A: 60, B: 68 } });
    expect(run.people.map((p) => p.retAge)).toEqual([60, 68]);
  });

  it("reports the household retirement age from the first retirement, on A's timeline", () => {
    const d = coupleDraft(); // A is 60 today, B is 58
    const base = runScenario(d, {});
    expect(base.metrics.retirementAge).toBe(65);

    const run = runScenario(d, { retireAgeByPerson: { A: 60, B: 68 } });
    // A retires immediately (age 60); the household is retired from then on.
    expect(run.metrics.retirementAge).toBe(60);
  });

  it("takes portfolio-at-retirement from the scenario year, not baseline age 65", () => {
    const d = coupleDraft();
    const base = runScenario(d, {});
    const run = runScenario(d, { retireAgeByPerson: { A: 60, B: 68 } });
    const row = run.output.chart.find((c) => c.age >= run.metrics.retirementAge!);
    expect(run.metrics.portfolioAtRetirement).toBe(Math.round(row!.portfolio));
    expect(run.metrics.portfolioAtRetirement).not.toBe(base.metrics.portfolioAtRetirement);
  });

  it("still follows retireDeferYears through the executed people", () => {
    const run = runScenario(coupleDraft(), { retireDeferYears: 2 });
    expect(run.people.map((p) => p.retAge)).toEqual([67, 67]);
    expect(run.metrics.retirementAge).toBe(67);
  });
});

/* ---------------- UX1-FIX F: per-person CPP / OAS opportunities ------ */

describe("CPP and OAS opportunities are individual", () => {
  it("produces one CPP and one OAS opportunity per person in a couple", () => {
    const opps = buildOpportunities(coupleDraft());
    expect(opps.filter((o) => o.id.startsWith("cpp-70-")).map((o) => o.id)).toEqual([
      "cpp-70-A",
      "cpp-70-B",
    ]);
    expect(opps.filter((o) => o.id.startsWith("oas-70-")).map((o) => o.id)).toEqual([
      "oas-70-A",
      "oas-70-B",
    ]);
    expect(opps.find((o) => o.id === "cpp-70-A")!.title).toContain("Alex");
    expect(opps.find((o) => o.id === "cpp-70-B")!.title).toContain("Bailey");
  });

  it("an A-only CPP recommendation leaves B untouched when executed", () => {
    const d = coupleDraft();
    const opp = buildOpportunities(d).find((o) => o.id === "cpp-70-A")!;
    expect(opp.patch).toEqual({ cppAgeByPerson: { A: 70 } });
    const run = runScenario(d, opp.patch!);
    expect(run.people.map((p) => p.cppAge)).toEqual([70, 65]);
  });

  it("never describes a start age as optimal", () => {
    for (const o of buildOpportunities(coupleDraft())) {
      expect(`${o.title} ${o.why} ${o.change} ${o.tradeoffs}`.toLowerCase()).not.toContain(
        "optimal",
      );
    }
  });
});

/* ---------------- UX1-FIX G: no silent savings owner ----------------- */

describe("extra saving never picks an owner silently", () => {
  function twoOwnerDraft(): PlanDraft {
    const d = coupleDraft();
    d.accounts = [
      account({ id: "nrA", owner: "A" }),
      account({ id: "nrB", owner: "B", name: "Non-registered (B)" }),
    ];
    return d;
  }

  it("sees both owners as eligible", () => {
    expect(extraSavingTargets(twoOwnerDraft())).toEqual(["A", "B"]);
  });

  it("applies nothing when two owners qualify and none was chosen", () => {
    const d = twoOwnerDraft();
    const o = scenarioOverride({ extraMonthlySaving: 500 }, scenarioInputs(d, {}));
    expect(o.goalSaves).toBeUndefined();
    expect(isLeverActive({ extraMonthlySaving: 500 }, "extraMonthlySaving", d)).toBe(false);
  });

  it("applies the chosen owner's account when one is named", () => {
    const d = twoOwnerDraft();
    const o = scenarioOverride(
      { extraMonthlySaving: 500, savingOwner: "B" },
      scenarioInputs(d, {}),
    );
    expect(o.goalSaves).toEqual([{ amt: 6000, type: "NONREG", owner: "B" }]);
    expect(
      isLeverActive({ extraMonthlySaving: 500, savingOwner: "B" }, "extraMonthlySaving", d),
    ).toBe(true);
  });

  it("offers one owner-specific saving opportunity per eligible owner", () => {
    const opps = buildOpportunities(twoOwnerDraft()).filter((o) => o.id.startsWith("save-more"));
    expect(opps.map((o) => o.id)).toEqual(["save-more-A", "save-more-B"]);
    expect(opps.every((o) => o.patch?.savingOwner != null)).toBe(true);
  });

  it("a single eligible owner still needs no choice", () => {
    const opps = buildOpportunities(baseDraft()).filter((o) => o.id.startsWith("save-more"));
    expect(opps.map((o) => o.id)).toEqual(["save-more"]);
    expect(opps[0]!.patch!.savingOwner).toBe("A");
  });
});
