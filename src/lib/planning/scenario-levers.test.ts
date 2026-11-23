/**
 * Regression tests for the lever bookkeeping helpers in scenario.ts
 * (`activeLevers`, `isolatePatch`). Pure patch manipulation only: no engine
 * run and no financial value is asserted here.
 */

import { describe, expect, it } from "vitest";

import { emptyPerson, newPlanDraft } from "./defaults";
import type { PlanDraft } from "./draft";
import { PATCH_LEVERS, activeLevers, isolatePatch } from "./scenario";
import type { ScenarioPatch } from "./scenario";
import type { AccountInput } from "./types";

function draft(): PlanDraft {
  const d = newPlanDraft(2026);
  d.people = [{ ...emptyPerson("A"), curAge: 60, retAge: 65, cpp: { amt: 12000, age: 65 } }];
  d.accounts = [
    {
      id: "nr",
      name: "Non-registered",
      type: "NONREG",
      owner: "A",
      bal: 100000,
    } as AccountInput,
  ];
  return d;
}

describe("activeLevers", () => {
  it("is empty for an empty patch", () => {
    expect(activeLevers({}, draft())).toEqual([]);
  });

  it("ignores neutral values: undefined, null, zero and a no-op start age", () => {
    const d = draft();
    const patch: ScenarioPatch = {
      retireDeferYears: 0,
      returnAdjustment: 0,
      cppAgeByPerson: { A: 65 }, // same as baseline
      oneTimeExpense: { amt: 0, age: 70 },
    };
    expect(activeLevers(patch, d)).toEqual([]);
  });

  it("reports active levers in PATCH_LEVERS order, not patch key order", () => {
    const d = draft();
    const patch: ScenarioPatch = {
      returnAdjustment: 1,
      retireDeferYears: 2,
      cppAgeByPerson: { A: 70 },
    };
    const out = activeLevers(patch, d);
    expect(out).toEqual(["retireDeferYears", "cppAgeByPerson", "returnAdjustment"]);
    expect(out.map((k) => PATCH_LEVERS.indexOf(k))).toEqual(
      [...out.map((k) => PATCH_LEVERS.indexOf(k))].sort((a, b) => a - b),
    );
  });

  it("does not count savingAccount / savingOwner alone as levers", () => {
    expect(activeLevers({ savingAccount: "NONREG", savingOwner: "A" }, draft())).toEqual([]);
  });
});

describe("isolatePatch", () => {
  const full: ScenarioPatch = {
    retireDeferYears: 2,
    returnAdjustment: 1,
    extraMonthlySaving: 400,
    savingAccount: "NONREG",
    savingOwner: "A",
  };

  it("keeps only the chosen lever plus the saving account and owner selectors", () => {
    expect(isolatePatch(full, "returnAdjustment")).toEqual({
      returnAdjustment: 1,
      savingAccount: "NONREG",
      savingOwner: "A",
    });
  });

  it("omits selectors that were not set, without adding undefined keys", () => {
    const out = isolatePatch({ retireDeferYears: 2, returnAdjustment: 1 }, "retireDeferYears");
    expect(out).toEqual({ retireDeferYears: 2 });
    expect(Object.keys(out)).toEqual(["retireDeferYears"]);
  });

  it("does not mutate the input patch", () => {
    const copy = JSON.parse(JSON.stringify(full));
    isolatePatch(full, "extraMonthlySaving");
    expect(full).toEqual(copy);
  });

  it("isolating a lever absent from the patch yields only the selectors", () => {
    const out = isolatePatch(full, "inflation");
    expect(Object.keys(out).sort()).toEqual(["inflation", "savingAccount", "savingOwner"].sort());
    expect(out.inflation).toBeUndefined();
  });
});
