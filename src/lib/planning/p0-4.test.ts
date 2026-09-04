import { describe, expect, it } from "vitest";

import { adviceGateFromStatuses } from "./advice-gate";
import { runPlan } from "./engine";
import { regressionFixturePlan } from "./fixtures";
import { projection } from "./projection";
import { lifMaximumFor, rrifMinFactor } from "./registered";
import { summarize } from "./summary";
import type {
  AccountInput,
  ComponentId,
  JurisdictionKey,
  PlanInputs,
  ProjectionResult,
} from "./types";

const START_YEAR = 2026;
const OPENING_BALANCE = 100000;

function lifAccount(
  juris: JurisdictionKey,
  overrides: Partial<AccountInput> = {},
): AccountInput {
  return {
    id: "lif",
    name: `${juris} LIF`,
    type: "LIF",
    owner: "A",
    bal: OPENING_BALANCE,
    acb: OPENING_BALANCE,
    eq: 0,
    mix: { int: 1, div: 0, cg: 0 },
    juris,
    conv: 0,
    unlock: 0,
    contrib: 0,
    contribEnd: 0,
    wd: 0,
    wdStart: 0,
    wdEnd: 0,
    ...overrides,
  };
}

function lifPlan(opts: {
  account: AccountInput;
  age?: number;
  spendNeed?: number;
}): PlanInputs {
  const base = regressionFixturePlan();
  const age = opts.age ?? 65;
  const spendNeed = opts.spendNeed ?? 0;
  return {
    ...base,
    planType: "single",
    inflation: 0,
    indexationRate: 0,
    eqRet: 0,
    fiRet: 0,
    spendNeed,
    currentSpend: spendNeed,
    strategy: "nonreg_reg_tfsa",
    endAge: age,
    people: [
      {
        ...base.people[0]!,
        curAge: age,
        retAge: age,
        employ: 0,
        cpp: { amt: 0, age: 65 },
        oas: { amt: 0, age: 65 },
        pen: { amt: 0, age: 65 },
        bridge: { amt: 0, end: 65 },
      },
    ],
    accounts: [opts.account],
    expenses: [],
    otherIncome: [],
    lumpSums: [],
    hardAssets: [],
    liabilities: [],
  };
}

function unsupportedUnlockPlan(requestedUnlock: number): PlanInputs {
  return lifPlan({
    age: 55,
    account: lifAccount("NB", {
      type: "LIRA",
      conv: 65,
      unlock: requestedUnlock,
    }),
  });
}

function component(P: ProjectionResult, id: ComponentId) {
  return P.componentStatuses.find((entry) => entry.component === id)!;
}

function annualMaximum(
  juris: JurisdictionKey,
  age = 65,
  balance = OPENING_BALANCE,
): number {
  return balance * (lifMaximumFor(juris, age, 6).pct / 100);
}

function mandatoryMinimum(age = 65, balance = OPENING_BALANCE): number {
  return balance * (rrifMinFactor(age) / 100);
}

describe("P0-4 — locked-in and LIF enforcement", () => {
  it("P04-1: a verified Ontario maximum hard-caps mandatory plus discretionary draws", () => {
    const P = projection(
      lifPlan({ account: lifAccount("ON"), spendNeed: 200000 }),
      { startYear: START_YEAR },
    );
    const row = P.rows[0]!;
    const maximum = annualMaximum("ON");

    expect(row.regWithdraw).toBeCloseTo(maximum, 6);
    expect(row.regWithdraw).toBeLessThanOrEqual(maximum + 1e-8);
    expect(row.balances["lif"]).toBeCloseTo(OPENING_BALANCE - maximum, 6);
    expect(component(P, "lockedIn.lifMaximum")).toMatchObject({
      status: "VERIFIED",
      engaged: false,
    });
  });

  it("P04-2: a schedule above the remaining Ontario cap is truncated and exhausts it", () => {
    const P = projection(
      lifPlan({
        account: lifAccount("ON", { wd: 10000, wdStart: 65, wdEnd: 65 }),
        spendNeed: 200000,
      }),
      { startYear: START_YEAR },
    );
    const row = P.rows[0]!;
    const maximum = annualMaximum("ON");
    const minimum = mandatoryMinimum();

    expect(row.regWithdraw).toBeCloseTo(maximum, 6);
    expect(row.regWithdraw - minimum).toBeCloseTo(maximum - minimum, 6);
    expect(row.balances["lif"]).toBeCloseTo(OPENING_BALANCE - maximum, 6);
    expect(P.lockedInDisclosures).toContain(
      'The requested scheduled LIF withdrawal for "ON LIF" was limited to the remaining annual LIF maximum.',
    );
  });

  it("P04-3: a schedule below the cap leaves only the residual for discretionary draw", () => {
    const scheduledOnly = projection(
      lifPlan({ account: lifAccount("ON", { wd: 1000, wdStart: 65, wdEnd: 65 }) }),
      { startYear: START_YEAR },
    );
    const combined = projection(
      lifPlan({
        account: lifAccount("ON", { wd: 1000, wdStart: 65, wdEnd: 65 }),
        spendNeed: 200000,
      }),
      { startYear: START_YEAR },
    );
    const maximum = annualMaximum("ON");
    const minimum = mandatoryMinimum();
    const scheduled = 1000;
    const discretionary = combined.rows[0]!.regWithdraw - scheduledOnly.rows[0]!.regWithdraw;

    expect(scheduledOnly.rows[0]!.regWithdraw).toBeCloseTo(minimum + scheduled, 6);
    expect(discretionary).toBeCloseTo(maximum - minimum - scheduled, 6);
    expect(combined.rows[0]!.regWithdraw).toBeCloseTo(maximum, 6);
    expect(combined.rows[0]!.regWithdraw).toBeLessThanOrEqual(maximum + 1e-8);
  });

  it("P04-4: an unsupported maximum permits only the mandatory minimum", () => {
    const P = projection(
      lifPlan({
        account: lifAccount("NB", { wd: 10000, wdStart: 65, wdEnd: 65 }),
        spendNeed: 200000,
      }),
      { startYear: START_YEAR },
    );
    const row = P.rows[0]!;
    const gate = adviceGateFromStatuses(P.componentStatuses);
    const lookup = lifMaximumFor("NB", 65, 6);

    expect(row.regWithdraw).toBeCloseTo(mandatoryMinimum(), 6);
    expect(row.balances["lif"]).toBeCloseTo(OPENING_BALANCE - mandatoryMinimum(), 6);
    expect(lookup).toEqual({ applies: false, pct: 0, status: "UNSUPPORTED" });
    expect(component(P, "lockedIn.lifMaximum")).toMatchObject({
      status: "UNSUPPORTED",
      engaged: true,
      substitutive: false,
    });
    expect(gate.adviceWithheld).toBe(true);
    expect(gate.adviceBlockers).toContain("lockedIn.lifMaximum");
    expect(P.lockedInDisclosures.join("\n")).toMatch(
      /maximum.*unavailable.*additional LIF withdrawals are not modelled.*no other jurisdiction/is,
    );
  });

  it("P04-5: an approximate maximum is enforced and disclosed across all channels", () => {
    const P = projection(
      lifPlan({
        account: lifAccount("AB", { wd: 1000, wdStart: 65, wdEnd: 65 }),
        spendNeed: 200000,
      }),
      { startYear: START_YEAR },
    );
    const maximum = annualMaximum("AB");
    const gate = adviceGateFromStatuses(P.componentStatuses);

    expect(P.rows[0]!.regWithdraw).toBeCloseTo(maximum, 6);
    expect(P.rows[0]!.regWithdraw).toBeLessThanOrEqual(maximum + 1e-8);
    expect(component(P, "lockedIn.lifMaximum")).toMatchObject({
      status: "APPROXIMATE",
      engaged: true,
    });
    expect(gate.adviceBlockers).toContain("lockedIn.lifMaximum");
    expect(P.lockedInDisclosures.join("\n")).toMatch(
      /LIF maximum for AB is an approximation.*not the published table/i,
    );
  });

  it("P04-6: Quebec's verified no-maximum case remains unrestricted", () => {
    const lookup = lifMaximumFor("QC", 65, 6);
    const P = projection(
      lifPlan({
        account: lifAccount("QC", { wd: 10000, wdStart: 65, wdEnd: 65 }),
        spendNeed: 200000,
      }),
      { startYear: START_YEAR },
    );
    const gate = adviceGateFromStatuses(P.componentStatuses);

    expect(lookup).toEqual({ applies: false, pct: 0, status: "VERIFIED" });
    expect(P.rows[0]!.regWithdraw).toBe(OPENING_BALANCE);
    expect(P.rows[0]!.balances["lif"]).toBe(0);
    expect(component(P, "lockedIn.lifMaximum")).toMatchObject({
      status: "VERIFIED",
      engaged: false,
    });
    expect(gate.adviceBlockers).not.toContain("lockedIn.lifMaximum");
  });

  it("P04-7: a requested unsupported unlock is refused and authoritatively engaged", () => {
    const P = projection(unsupportedUnlockPlan(50), { startYear: START_YEAR });
    const gate = adviceGateFromStatuses(P.componentStatuses);

    expect(P.rows[0]!.balances["lif"]).toBe(OPENING_BALANCE);
    expect(P.acctMeta.map((entry) => entry.id)).toEqual(["lif"]);
    expect(component(P, "lockedIn.unlockEntitlement")).toMatchObject({
      status: "UNSUPPORTED",
      engaged: true,
      substitutive: false,
    });
    expect(component(P, "lockedIn.destinationVehicle").engaged).toBe(false);
    expect(gate.adviceWithheld).toBe(true);
    expect(gate.adviceBlockers).toContain("lockedIn.unlockEntitlement");
    expect(P.lockedInDisclosures.join("\n")).toMatch(
      /unlocking.*is withheld.*No other jurisdiction's rule is substituted/i,
    );
  });

  it("P04-8: unsupported entitlement stays unengaged when no unlock was requested", () => {
    const P = projection(unsupportedUnlockPlan(0), { startYear: START_YEAR });
    const gate = adviceGateFromStatuses(P.componentStatuses);

    expect(component(P, "lockedIn.unlockEntitlement")).toMatchObject({
      status: "UNSUPPORTED",
      engaged: false,
    });
    expect(component(P, "lockedIn.destinationVehicle").engaged).toBe(false);
    expect(gate.adviceBlockers).not.toContain("lockedIn.unlockEntitlement");
    expect(P.lockedInDisclosures).toEqual([]);
  });

  it("P04-9: summarize propagates projection-owned locked-in disclosures once", () => {
    const P = runPlan(unsupportedUnlockPlan(50));
    const disclosure = P.lockedInDisclosures[0]!;
    const output = summarize(P);

    expect(disclosure).toMatch(/unlocking.*withheld/i);
    expect(output.methodDisclosures).toContain(disclosure);
    expect(output.methodDisclosures.filter((entry) => entry === disclosure)).toHaveLength(1);
  });

  it("P04-10: one status-neutral LIF reason truthfully covers approximate and unsupported", () => {
    const approximate = projection(
      lifPlan({ account: lifAccount("AB"), spendNeed: 200000 }),
      { startYear: START_YEAR },
    );
    const unsupported = projection(
      lifPlan({ account: lifAccount("NB"), spendNeed: 200000 }),
      { startYear: START_YEAR },
    );
    const approximateReason = adviceGateFromStatuses(approximate.componentStatuses)
      .adviceReasons.find((reason) => reason.code === "LIF_MAXIMUM_NOT_VERIFIED");
    const unsupportedReason = adviceGateFromStatuses(unsupported.componentStatuses)
      .adviceReasons.find((reason) => reason.code === "LIF_MAXIMUM_NOT_VERIFIED");

    expect(approximateReason).toEqual(unsupportedReason);
    expect(approximateReason?.detail).toMatch(/available approximate maximum is enforced/i);
    expect(approximateReason?.detail).toMatch(
      /maximum is unavailable.*withdrawals are refused.*without substituting/is,
    );
    expect(approximateReason?.detail).not.toMatch(/an approximate formula was applied/i);

    const unlockGate = adviceGateFromStatuses(
      projection(unsupportedUnlockPlan(50), { startYear: START_YEAR }).componentStatuses,
    );
    expect(unlockGate.adviceReasons.map((reason) => reason.code)).toContain(
      "LOCKED_IN_UNLOCK_ENTITLEMENT_NOT_VERIFIED",
    );
  });

  it.each([
    { caseId: "P04-15a", type: "LIRA" as const },
    { caseId: "P04-15b", type: "DCPP" as const },
  ])("$caseId: a scheduled $type withdrawal before conversion is refused", ({ type }) => {
    const P = projection(
      lifPlan({
        age: 55,
        spendNeed: 10000,
        account: lifAccount("ON", {
          type,
          name: `ON ${type}`,
          conv: 65,
          unlock: 0,
          wd: 5000,
          wdStart: 55,
          wdEnd: 55,
        }),
      }),
      { startYear: START_YEAR },
    );

    expect(P.rows[0]!.regWithdraw).toBe(0);
    expect(P.rows[0]!.balances["lif"]).toBe(OPENING_BALANCE);
    expect(P.acctMeta.map((entry) => entry.id)).toEqual(["lif"]);
    expect(P.lockedInDisclosures).toContain(
      `The requested scheduled withdrawal for "ON ${type}" is not modelled before the account's LIF conversion age. Jurisdiction-specific unlocking must use the locked-in unlocking mechanism.`,
    );
    expect(component(P, "lockedIn.unlockEntitlement")).toMatchObject({
      status: "VERIFIED",
      engaged: false,
    });
  });
});
