/**
 * Batch 0B — RRSP / TFSA accumulation correctness.
 *
 * These tests pin the room rules that a client's numbers depend on: what the
 * opening year may assume, who may spend room (the client asserting a fact vs
 * the engine giving advice), how a deduction differs from a contribution, and
 * where the tool must stay silent rather than guess.
 */

import { describe, expect, it } from "vitest";
import { PersonRoomLedger, rrspDollarLimit, tfsaAnnualLimit } from "./room";
import { lifetimeTax, runPlan } from "./engine";
import { projection } from "./projection";
import { accumulationGoldenFixturePlan, regressionFixturePlan } from "./fixtures";
import type { PersonInput } from "./types";

function person(over: Partial<PersonInput> = {}): PersonInput {
  return {
    id: "A",
    firstName: "",
    lastName: "",
    curAge: 40,
    retAge: 65,
    employ: 100000,
    deathAge: 0,
    cpp: { amt: 0, age: 65 },
    oas: { amt: 0, age: 65 },
    pen: { amt: 0, age: 65 },
    bridge: { amt: 0, end: 65 },
    ...over,
  };
}

function ledger(over: Partial<PersonInput> = {}, pensionMember = false) {
  return new PersonRoomLedger(person(over), {
    planStartYear: 2026,
    inflation: 0.021,
    pensionMember,
  });
}

describe("opening-year room semantics (Erratum 2)", () => {
  it("uses the entered CRA figure verbatim, adding no annual limit", () => {
    const l = ledger({ tfsaRoom: 15000, rrspRoom: 20000 });
    const y = l.openYear(2026, 40, 100000);
    expect(y.tfsa.open).toBe(15000);
    expect(y.tfsa.accrual).toBe(0);
    expect(y.rrsp.contribRoomOpen).toBe(20000);
    expect(y.rrsp.accrual).toBe(0);
  });

  it("treats unknown room as zero verified capacity, never as the annual limit", () => {
    const y = ledger().openYear(2026, 40, 100000);
    expect(y.tfsa.open).toBe(0);
    expect(y.rrsp.contribRoomOpen).toBe(0);
    expect(y.tfsa.status).toBe("UNKNOWN");
    expect(y.disclosures.join(" ")).toContain("TFSA contribution room is unknown");
  });

  it("accrues from the second year onward, off the prior year's earned income", () => {
    const l = ledger({ tfsaRoom: 0, rrspRoom: 0 });
    l.openYear(2026, 40, 50000);
    l.closeYear();
    const y2 = l.openYear(2027, 41, 50000);
    expect(y2.tfsa.accrual).toBe(tfsaAnnualLimit(2027, 0.021));
    expect(y2.rrsp.accrual).toBeCloseTo(0.18 * 50000, 6);
  });

  it("caps RRSP accrual at the statutory dollar limit", () => {
    const l = ledger({ rrspRoom: 0 });
    l.openYear(2026, 40, 900000);
    l.closeYear();
    const y2 = l.openYear(2027, 41, 900000);
    expect(y2.rrsp.accrual).toBeCloseTo(rrspDollarLimit(2027, 0.021), 6);
  });

  it("reduces RRSP accrual by a known pension adjustment", () => {
    const l = ledger({ rrspRoom: 0, pensionAdjustment: 8000 }, true);
    l.openYear(2026, 40, 100000);
    l.closeYear();
    const y2 = l.openYear(2027, 41, 100000);
    expect(y2.rrsp.accrual).toBeCloseTo(18000 - 8000, 6);
  });
});

describe("asserted vs generated contributions", () => {
  it("honours a client-asserted contribution when room is unknown, and flags it", () => {
    const l = ledger();
    l.openYear(2026, 40, 100000);
    expect(l.contributeTfsa(6000, "asserted")).toBe(6000);
    const y = l.closeYear();
    expect(y.tfsa.unverifiedRoom).toBe(true);
  });

  it("refuses to generate a contribution against room it cannot verify", () => {
    const l = ledger();
    l.openYear(2026, 40, 100000);
    expect(l.contributeTfsa(6000, "generated")).toBe(0);
    expect(l.contributeRrsp(6000, "generated")).toBe(0);
  });

  it("caps generated contributions at known room", () => {
    const l = ledger({ tfsaRoom: 2500, rrspRoom: 3000 });
    l.openYear(2026, 40, 100000);
    expect(l.contributeTfsa(6000, "generated")).toBe(2500);
    expect(l.contributeRrsp(6000, "generated")).toBe(3000);
  });

  it("records an over-contribution and its penalty exposure when room is known", () => {
    const l = ledger({ tfsaRoom: 1000 });
    l.openYear(2026, 40, 100000);
    l.contributeTfsa(4000, "asserted");
    const y = l.closeYear();
    expect(y.tfsa.excess).toBe(3000);
    expect(y.penalty.estimatedPenalty).toBeCloseTo(3000 * 0.12, 6);
    expect(y.penalty.approximate).toBe(true);
  });

  it("applies the $2,000 RRSP cushion before any penalty", () => {
    const l = ledger({ rrspRoom: 0 });
    l.openYear(2026, 40, 100000);
    l.contributeRrsp(1500, "asserted");
    const y = l.closeYear();
    expect(y.rrsp.excess).toBe(1500);
    expect(y.penalty.rrspExcessOverCushion).toBe(0);
    expect(y.penalty.estimatedPenalty).toBe(0);
  });
});

describe("TFSA withdrawal room restoration", () => {
  it("restores withdrawn room on January 1 of the following year, not this one", () => {
    const l = ledger({ tfsaRoom: 0 });
    l.openYear(2026, 40, 0);
    l.recordTfsaWithdrawal(10000);
    expect(l.generatedTfsaCapacity()).toBe(0);
    l.closeYear();
    const y2 = l.openYear(2027, 41, 0);
    expect(y2.tfsa.withdrawalsRestored).toBe(10000);
    expect(y2.tfsa.open).toBe(10000 + tfsaAnnualLimit(2027, 0.021));
  });
});

describe("contribution room vs deduction limit vs undeducted contributions", () => {
  it("surfaces a CRA identity that does not balance instead of picking a figure", () => {
    const l = ledger({
      rrspRoom: 10000,
      rrspUndeductedContributions: 5000,
      rrspDeductionLimitOpen: 12000,
    });
    expect(l.validationErrors.length).toBe(1);
    expect(l.validationErrors[0]).toContain("inconsistent");
  });

  it("derives the deduction limit from the identity when it is not supplied", () => {
    const l = ledger({ rrspRoom: 10000, rrspUndeductedContributions: 4000 });
    const y = l.openYear(2026, 40, 100000);
    expect(y.rrsp.deductionLimitOpen).toBe(14000);
  });

  it("caps the deduction by income and carries the rest forward", () => {
    const l = ledger({ rrspRoom: 50000, rrspUndeductedContributions: 0 });
    l.openYear(2026, 40, 30000);
    l.contributeRrsp(20000, "asserted");
    expect(l.claimRrspDeduction(12000)).toBe(12000);
    const y = l.closeYear();
    expect(y.rrsp.deductionClaimed).toBe(12000);
    expect(y.rrsp.undeductedCarry).toBe(8000);
  });

  it("keeps a contribution deductible in a later year", () => {
    const l = ledger({ rrspRoom: 50000 });
    l.openYear(2026, 40, 0);
    l.contributeRrsp(10000, "asserted");
    l.claimRrspDeduction(0);
    l.closeYear();
    l.openYear(2027, 41, 80000);
    expect(l.claimRrspDeduction(80000)).toBe(10000);
  });
});

describe("age-71 handling", () => {
  it("refuses any contribution to the person's own RRSP past 71, asserted included", () => {
    const l = ledger({ rrspRoom: 40000, curAge: 72 });
    const y = l.openYear(2026, 72, 0);
    expect(y.rrsp.dormantAfter71).toBe(true);
    expect(l.contributeRrsp(5000, "asserted")).toBe(0);
    expect(l.contributeRrsp(5000, "generated")).toBe(0);
  });

  it("keeps unused room visible on the ledger rather than deleting it", () => {
    const l = ledger({ rrspRoom: 40000, curAge: 72 });
    const y = l.openYear(2026, 72, 0);
    expect(y.rrsp.contribRoomOpen).toBe(40000);
    expect(y.disclosures.join(" ")).toContain("past the year you turned 71");
  });

  it("still allows a TFSA contribution past 71", () => {
    const l = ledger({ tfsaRoom: 8000, curAge: 75 });
    l.openYear(2026, 75, 0);
    expect(l.contributeTfsa(8000, "generated")).toBe(8000);
  });
});

describe("pension adjustment uncertainty", () => {
  it("discloses a modelled $0 PA for a pension-plan member", () => {
    const y = ledger({ rrspRoom: 20000 }, true).openYear(2026, 40, 100000);
    expect(y.disclosures.join(" ")).toContain("Pension adjustment is unknown");
    expect(y.registeredRecommendationsWithheld).toBe(false);
  });

  it("withholds registered recommendations when both room and PA are unknown", () => {
    const y = ledger({}, true).openYear(2026, 40, 100000);
    expect(y.registeredRecommendationsWithheld).toBe(true);
  });
});

describe("engine integration", () => {
  const acc = accumulationGoldenFixturePlan();

  it("publishes a per-person room ledger on every projection year", () => {
    const P = projection(acc);
    expect(P.rows[0]!.roomLedger.length).toBe(2);
    expect(P.rows[0]!.roomLedger[0]!.tfsa.open).toBe(30000);
    expect(P.rows[0]!.roomLedger[0]!.rrsp.contribRoomOpen).toBe(40000);
  });

  it("claims an RRSP deduction that lowers taxable income while working", () => {
    const P = projection(acc);
    const y0 = P.rows[0]!;
    expect(y0.rrspDeduction).toBeGreaterThan(0);
    const noDeduction = projection({
      ...acc,
      accounts: acc.accounts.map((a) =>
        a.type === "RRSP" ? { ...a, contrib: 0 } : a,
      ),
    });
    expect(y0.taxable).toBeLessThan(noDeduction.rows[0]!.taxable);
  });

  it("discloses a modelled $0 pension adjustment for a plan member who did not supply one", () => {
    const withPlan = accumulationGoldenFixturePlan();
    // B is a workplace pension member but never reported a PA.
    withPlan.people[1]!.pen = { amt: 18000, age: 65 };
    expect(projection(withPlan).roomDisclosures.join(" ")).toContain(
      "Pension adjustment is unknown",
    );
  });

  it("reports an inconsistent CRA identity as a validation error", () => {
    const bad = accumulationGoldenFixturePlan();
    bad.people[0]!.rrspDeductionLimitOpen = 99999;
    expect(projection(bad).roomValidationErrors.length).toBe(1);
  });

  it("stops own-RRSP contributions after 71 without stopping TFSA contributions", () => {
    const late = accumulationGoldenFixturePlan();
    late.people[0]!.curAge = 71;
    late.people[1]!.curAge = 71;
    for (const a of late.accounts) a.contribEnd = 0;
    const P = projection(late);
    const past71 = P.rows.find((r) => r.ages[0]! === 73)!;
    expect(past71.contribBy["acc_rrsp_a"] ?? 0).toBe(0);
    expect(past71.contribBy["acc_tfsa_a"] ?? 0).toBeGreaterThan(0);
  });

  it("routes engine-generated saving past exhausted registered room into non-registered", () => {
    const base = accumulationGoldenFixturePlan();
    const P = projection(base, { goalSaves: [{ amt: 100000, type: "TFSA", owner: "A" }] });
    const y0 = P.rows[0]!;
    // Person A's TFSA room opens at 30,000 and already takes a 7,000 asserted
    // contribution, so the generated saving cannot exceed what is left.
    expect(y0.contribBy["acc_tfsa_a"]!).toBeLessThanOrEqual(30000);
    expect(y0.contribBy["acc_nonreg_j"] ?? 0).toBeGreaterThan(0);
  });

  it("holds the accumulation golden lifetime tax", () => {
    expect(Math.round(lifetimeTax(runPlan(acc)))).toBe(ACCUMULATION_GOLDEN);
  });

  it("leaves the Batch 0A single-filer golden untouched", () => {
    expect(Math.round(lifetimeTax(runPlan(regressionFixturePlan())))).toBe(278614);
  });
});

/** Pinned Batch 0B anchor; see the run report for the derivation. */
const ACCUMULATION_GOLDEN = 2254682;
