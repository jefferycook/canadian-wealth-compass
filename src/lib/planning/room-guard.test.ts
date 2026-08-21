/**
 * Batch 0B targeted corrections.
 *
 * 1. Registered-destination lump sums must pass through the owner's room
 *    ledger instead of landing in the account directly.
 * 2. A LIRA alone is not evidence of current pension-plan membership.
 * 3. A deterministic property guard: engine-generated registered contributions
 *    can never exceed the room the ledger says is legally available.
 */

import { describe, expect, it } from "vitest";
import { projection } from "./projection";
import { PersonRoomLedger } from "./room";
import { accumulationGoldenFixturePlan } from "./fixtures";
import type { AccountInput, PersonInput, PlanInputs } from "./types";

/** A quiet accumulation plan: no asserted contributions, no lump sums. */
function quietPlan(): PlanInputs {
  const p = accumulationGoldenFixturePlan();
  for (const a of p.accounts) a.contrib = 0;
  for (const person of p.people) {
    person.tfsaRoom = 0;
    person.rrspRoom = 0;
    person.rrspDeductionLimitOpen = 0;
    person.rrspUndeductedContributions = 0;
    person.pensionAdjustment = 0;
  }
  return p;
}

const bal = (p: PlanInputs, id: string) =>
  projection(p).rows[0]!.balances[id] ?? 0;

/**
 * Room actually consumed in the opening year by person A. Batch 0D added the
 * after-tax surplus sweep, which also contributes to the TFSA, so a balance
 * delta between two plans no longer isolates the lump sum. The ledger is the
 * direct statement of the invariant these guards exist to protect.
 */
const roomYear0 = (p: PlanInputs) =>
  projection(p).rows[0]!.roomLedger.find((r) => r.person === "A")!;

describe("registered-destination lump sums respect room", () => {
  it("cannot place more than known TFSA room into a TFSA", () => {
    const base = quietPlan();
    const withLump = quietPlan();
    withLump.people[0]!.tfsaRoom = 5000;
    base.people[0]!.tfsaRoom = 5000;
    withLump.lumpSums = [
      {
        id: "ls",
        name: "Inheritance",
        age: withLump.people[0]!.curAge,
        amt: 100000,
        dest: "TFSA",
        owner: "A",
        taxable: false,
      },
    ];
    const led = roomYear0(withLump);
    // The lump sum is capped by legally available room, and the whole 5,000
    // of it is used: contributions equal the room, and none spills to excess.
    expect(led.tfsa.contributions).toBeLessThanOrEqual(
      led.tfsa.open + led.tfsa.accrual + led.tfsa.withdrawalsRestored + 0.01,
    );
    expect(led.tfsa.contributions).toBeCloseTo(5000, 2);
    expect(led.tfsa.excess).toBeCloseTo(0, 2);
    // And the account never receives more than the base plan plus that room.
    expect(bal(withLump, "acc_tfsa_a")).toBeLessThanOrEqual(
      bal(base, "acc_tfsa_a") + 5000 + 0.01,
    );
  });

  it("cascades the remainder rather than losing it", () => {
    const base = quietPlan();
    const withLump = quietPlan();
    base.people[0]!.tfsaRoom = 5000;
    withLump.people[0]!.tfsaRoom = 5000;
    withLump.people[0]!.rrspRoom = 20000;
    base.people[0]!.rrspRoom = 20000;
    withLump.people[0]!.rrspDeductionLimitOpen = 20000;
    base.people[0]!.rrspDeductionLimitOpen = 20000;
    withLump.lumpSums = [
      {
        id: "ls",
        name: "Inheritance",
        age: withLump.people[0]!.curAge,
        amt: 100000,
        dest: "TFSA",
        owner: "A",
        taxable: false,
      },
    ];
    const led = roomYear0(withLump);
    expect(led.tfsa.contributions).toBeCloseTo(5000, 2);
    expect(led.rrsp.contributions).toBeCloseTo(20000, 2);
    const tfsa = bal(withLump, "acc_tfsa_a") - bal(base, "acc_tfsa_a");
    const rrsp = bal(withLump, "acc_rrsp_a") - bal(base, "acc_rrsp_a");
    const nonreg = bal(withLump, "acc_nonreg_j") - bal(base, "acc_nonreg_j");
    // Nothing is lost: whatever room could not absorb lands non-registered.
    expect(tfsa + rrsp + nonreg).toBeGreaterThan(99000);
  });

  it("places nothing in a TFSA whose room is unknown", () => {
    const base = quietPlan();
    const withLump = quietPlan();
    base.people[0]!.tfsaRoom = null;
    withLump.people[0]!.tfsaRoom = null;
    withLump.lumpSums = [
      {
        id: "ls",
        name: "Inheritance",
        age: withLump.people[0]!.curAge,
        amt: 100000,
        dest: "TFSA",
        owner: "A",
        taxable: false,
      },
    ];
    expect(bal(withLump, "acc_tfsa_a") - bal(base, "acc_tfsa_a")).toBeCloseTo(0, 2);
    expect(
      bal(withLump, "acc_nonreg_j") - bal(base, "acc_nonreg_j"),
    ).toBeGreaterThan(0);
  });

  it("respects RRSP room for an RRSP-destination lump sum", () => {
    const base = quietPlan();
    const withLump = quietPlan();
    for (const p of [base, withLump]) {
      p.people[0]!.rrspRoom = 12000;
      p.people[0]!.rrspDeductionLimitOpen = 12000;
    }
    withLump.lumpSums = [
      {
        id: "ls",
        name: "Bonus",
        age: withLump.people[0]!.curAge,
        amt: 60000,
        dest: "RRSP",
        owner: "A",
        taxable: false,
      },
    ];
    expect(bal(withLump, "acc_rrsp_a") - bal(base, "acc_rrsp_a")).toBeCloseTo(
      12000,
      2,
    );
  });

  it("places nothing in an own RRSP past 71", () => {
    const base = quietPlan();
    const withLump = quietPlan();
    for (const p of [base, withLump]) {
      p.people[0]!.curAge = 74;
      p.people[1]!.curAge = 74;
      p.people[0]!.rrspRoom = 40000;
      p.people[0]!.rrspDeductionLimitOpen = 40000;
    }
    withLump.lumpSums = [
      {
        id: "ls",
        name: "Bonus",
        age: 74,
        amt: 40000,
        dest: "RRSP",
        owner: "A",
        taxable: false,
      },
    ];
    expect(bal(withLump, "acc_rrsp_a") - bal(base, "acc_rrsp_a")).toBeCloseTo(0, 2);
    expect(
      bal(withLump, "acc_nonreg_j") - bal(base, "acc_nonreg_j"),
    ).toBeGreaterThan(0);
  });
});

describe("pension-plan membership is not inferred from a LIRA", () => {
  it("does not treat LIRA-only ownership as a current pension adjustment", () => {
    const p = quietPlan();
    p.people[0]!.pensionAdjustment = null;
    p.people[0]!.pen = { amt: 0, age: 65 };
    p.people[1]!.pensionAdjustment = null;
    p.people[1]!.pen = { amt: 0, age: 65 };
    const lira: AccountInput = {
      id: "acc_lira_a",
      name: "LIRA (former employer)",
      type: "LIRA",
      owner: "A",
      bal: 150000,
      acb: 150000,
      eq: 60,
      mix: { int: 1, div: 0, cg: 0 },
      juris: "ON",
      conv: 0,
      unlock: 0,
      contrib: 0,
      contribEnd: 0,
      wd: 0,
      wdStart: 0,
      wdEnd: 0,
    };
    p.accounts.push(lira);
    const P = projection(p);
    expect(P.roomDisclosures.join(" ")).not.toContain("Pension adjustment is unknown");
    expect(P.rows[0]!.roomLedger[0]!.registeredRecommendationsWithheld).toBe(false);
  });
});

/* -------- deterministic property guard -------- */

/** Small deterministic LCG so the suite never varies between runs. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function personFor(over: Partial<PersonInput>): PersonInput {
  return {
    id: "A",
    firstName: "",
    lastName: "",
    curAge: 40,
    retAge: 65,
    employ: 80000,
    deathAge: 0,
    cpp: { amt: 0, age: 65 },
    oas: { amt: 0, age: 65 },
    pen: { amt: 0, age: 65 },
    bridge: { amt: 0, end: 65 },
    ...over,
  };
}

describe("property guard: generated contributions never exceed available room", () => {
  it("caps every generated allocation at legal room across varied cases", () => {
    const r = rng(20260821);
    for (let i = 0; i < 300; i++) {
      const tfsaKnown = r() < 0.6;
      const rrspKnown = r() < 0.6;
      const age = [35, 55, 70, 72, 80][Math.floor(r() * 5)]!;
      const tfsaRoom = tfsaKnown ? Math.round(r() * 30000) : null;
      const rrspRoom = rrspKnown ? Math.round(r() * 40000) : null;
      const assertedTfsa = Math.round(r() * 8000);
      const assertedRrsp = Math.round(r() * 8000);
      const request = Math.round(r() * 60000);
      const id = r() < 0.5 ? "A" : "B";

      const l = new PersonRoomLedger(
        personFor({ id, curAge: age, tfsaRoom, rrspRoom }),
        { planStartYear: 2026, inflation: 0.021, pensionMember: false },
      );
      l.openYear(2026, age, 80000);
      l.contributeTfsa(assertedTfsa, "asserted");
      l.contributeRrsp(assertedRrsp, "asserted");

      const tfsaCap = l.generatedTfsaCapacity();
      const rrspCap = l.generatedRrspCapacity();
      const tfsaPlaced = l.contributeTfsa(request, "generated");
      const rrspPlaced = l.contributeRrsp(request, "generated");

      expect(tfsaPlaced).toBeLessThanOrEqual(tfsaCap + 1e-9);
      expect(rrspPlaced).toBeLessThanOrEqual(rrspCap + 1e-9);
      if (!tfsaKnown) expect(tfsaPlaced).toBe(0);
      if (!rrspKnown) expect(rrspPlaced).toBe(0);
      if (age > 71) expect(rrspPlaced).toBe(0);
      expect(l.generatedTfsaCapacity()).toBeGreaterThanOrEqual(0);
      expect(l.generatedRrspCapacity()).toBeGreaterThanOrEqual(0);
      l.closeYear();
    }
  });

  it("preserves the requested saving in non-registered when registered room runs out", () => {
    const r = rng(777);
    for (let i = 0; i < 40; i++) {
      const p = quietPlan();
      const ownerIdx = r() < 0.5 ? 0 : 1;
      const owner = ownerIdx === 0 ? "A" : "B";
      const tfsaRoom = Math.round(r() * 20000);
      const rrspRoom = Math.round(r() * 20000);
      p.people[ownerIdx]!.tfsaRoom = tfsaRoom;
      p.people[ownerIdx]!.rrspRoom = rrspRoom;
      p.people[ownerIdx]!.rrspDeductionLimitOpen = rrspRoom;
      const amt = Math.round(r() * 80000) + 1000;
      const y0 = projection(p, {
        goalSaves: [{ amt, type: "TFSA", owner }],
      }).rows[0]!;
      const tfsaId = ownerIdx === 0 ? "acc_tfsa_a" : "acc_tfsa_b";
      const rrspId = ownerIdx === 0 ? "acc_rrsp_a" : "acc_rrsp_b";
      expect(y0.contribBy[tfsaId] ?? 0).toBeLessThanOrEqual(tfsaRoom + 1e-6);
      expect(y0.contribBy[rrspId] ?? 0).toBeLessThanOrEqual(rrspRoom + 1e-6);
      const total = Object.values(y0.contribBy).reduce((s, v) => s + v, 0);
      expect(total).toBeCloseTo(amt, 2);
    }
  });
});
