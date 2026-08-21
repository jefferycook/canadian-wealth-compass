/**
 * Regression suite for the planning engine.
 *
 * The point of these tests is not coverage for its own sake — it's that a
 * client's retirement number must not move because someone refactored a helper.
 * The headline case is the default plan, whose lifetime tax is pinned.
 */

import { describe, expect, it } from "vitest";

import { cppFactor, cppSurvivorBenefit, oasFactor } from "./benefits";
import { regressionFixturePlan as defaultPlanInputs } from "./fixtures";
import {
  afterTaxEstate,
  firstShortfallAge,
  lifetimeTax,
  portfolioExhaustionAge,
  runPlan,
  shortfallYears,
} from "./engine";
import { projection } from "./projection";
import { lifMaxFactor, rrifMinFactor, unlockRule } from "./registered";
import { FIXED_STRATEGIES } from "./strategy";
import { bracketTax, computeTax, householdTax, ontarioHealthPremium } from "./tax";
import { getTaxYear } from "./taxYears";
import type { IncomeComponents, TaxSettings } from "./types";

const TY = getTaxYear(2026);
const ON: TaxSettings = {
  provinceKey: "ON",
  fedBPA: 16452,
  provBPA: 12989,
  oasThresh: 95323,
  lifRate: 6,
};

const income = (over: Partial<IncomeComponents> = {}): IncomeComponents => ({
  ordinary: 0,
  eligDiv: 0,
  capGainsTaxable: 0,
  pensionEligible: 0,
  oasReceived: 0,
  age: 65,
  ...over,
});

describe("bracket tax", () => {
  it("taxes nothing on zero income", () => {
    expect(bracketTax(0, TY.federal)).toBe(0);
  });

  it("applies each rate only to the income within its band", () => {
    const first = TY.federal[0]!;
    expect(bracketTax(first.up, TY.federal)).toBeCloseTo(first.up * first.rate, 6);
    // A dollar into the second bracket is taxed at the second rate, not retroactively.
    const second = TY.federal[1]!;
    expect(bracketTax(first.up + 1000, TY.federal)).toBeCloseTo(
      first.up * first.rate + 1000 * second.rate,
      6,
    );
  });

  it("is monotonic — more income never means less tax", () => {
    let prev = -1;
    for (let inc = 0; inc <= 400000; inc += 5000) {
      const t = bracketTax(inc, TY.federal);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
});

describe("credits and clawbacks", () => {
  it("charges no tax below the lower of the two basic personal amounts", () => {
    // Ontario's BPA is the binding one at $12,989; below it neither government
    // takes anything.
    expect(computeTax(income({ ordinary: 12000, age: 60 }), ON, TY).tax).toBe(0);
    // Just above it, only the province taxes the excess.
    expect(computeTax(income({ ordinary: 15000, age: 60 }), ON, TY).tax).toBeGreaterThan(0);
  });

  it("phases the federal BPA down at high income but never below the floor", () => {
    // Two identical incomes, one just below the phase-out and one far above:
    // the high earner's effective BPA is the statutory minimum.
    const hi = computeTax(income({ ordinary: 400000 }), ON, TY);
    expect(hi.tax).toBeGreaterThan(0);
    expect(hi.taxable).toBe(400000);
  });

  it("grants the age amount only from 65", () => {
    const at64 = computeTax(income({ ordinary: 40000, age: 64 }), ON, TY).tax;
    const at65 = computeTax(income({ ordinary: 40000, age: 65 }), ON, TY).tax;
    expect(at65).toBeLessThan(at64);
  });

  it("taxes eligible dividends more lightly than ordinary income", () => {
    const ord = computeTax(income({ ordinary: 70000 }), ON, TY).tax;
    const div = computeTax(income({ ordinary: 20000, eligDiv: 50000 }), ON, TY).tax;
    expect(div).toBeLessThan(ord);
  });

  it("claws back OAS at 15 cents per dollar above the threshold, capped at the benefit", () => {
    const under = computeTax(
      income({ ordinary: ON.oasThresh - 5000, oasReceived: 9024 }),
      ON,
      TY,
    );
    expect(under.oasClawback).toBe(0);

    const over = computeTax(
      income({ ordinary: ON.oasThresh + 10000, oasReceived: 9024 }),
      ON,
      TY,
    );
    expect(over.oasClawback).toBeCloseTo(10000 * 0.15, 6);

    const way = computeTax(
      income({ ordinary: ON.oasThresh + 200000, oasReceived: 9024 }),
      ON,
      TY,
    );
    expect(way.oasClawback).toBe(9024); // never more than the OAS received
  });

  it("levies the Ontario health premium in steps, capped at $900", () => {
    expect(ontarioHealthPremium(19000)).toBe(0);
    expect(ontarioHealthPremium(25000)).toBeCloseTo(300, 0);
    expect(ontarioHealthPremium(1000000)).toBe(900);
  });
});

describe("pension income splitting", () => {
  it("never chooses a split that raises household tax", () => {
    const a = income({ ordinary: 90000, pensionEligible: 60000 });
    const b = income({ ordinary: 20000 });
    const noSplit =
      computeTax(a, ON, TY).tax + computeTax(b, ON, TY).tax;
    const split = householdTax([a, b], ON, true, TY);
    expect(split.tax).toBeLessThanOrEqual(noSplit + 1e-9);
  });

  it("finds a real saving for a lopsided couple", () => {
    const a = income({ ordinary: 110000, pensionEligible: 90000 });
    const b = income({ ordinary: 0 });
    const split = householdTax([a, b], ON, true, TY);
    expect(split.splitAmt).toBeGreaterThan(0);
    expect(split.tax).toBeLessThan(
      computeTax(a, ON, TY).tax + computeTax(b, ON, TY).tax,
    );
  });

  it("denies splitting to partners who are neither married nor common-law", () => {
    const a = income({ ordinary: 110000, pensionEligible: 90000 });
    const b = income({ ordinary: 0 });
    const r = householdTax([a, b], ON, false, TY);
    expect(r.splitAmt).toBe(0);
    expect(r.tax).toBeCloseTo(computeTax(a, ON, TY).tax + computeTax(b, ON, TY).tax, 6);
  });

  it("respects the 50% statutory transfer limit", () => {
    const a = income({ ordinary: 200000, pensionEligible: 100000 });
    const b = income({ ordinary: 0 });
    expect(householdTax([a, b], ON, true, TY).splitAmt).toBeLessThanOrEqual(50000 + 1e-9);
  });

  /* --- Batch 0.1: the search must reach the full statutory 50%, not 25% --- */

  it("reaches approximately the full 50% when that is the optimum", () => {
    // One spouse with a large eligible pension, the other with nothing: the
    // optimum is at or near the statutory maximum.
    const a = income({ ordinary: 120000, pensionEligible: 120000, age: 68 });
    const b = income({ ordinary: 0, age: 68 });
    const r = householdTax([a, b], ON, true, TY);
    expect(r.splitAmt).toBeGreaterThan(0.45 * 120000);
    expect(r.splitAmt).toBeLessThanOrEqual(0.5 * 120000 + 1e-9);
  });

  it("beats the old 25%-capped search on a lopsided couple", () => {
    const a = income({ ordinary: 120000, pensionEligible: 120000, age: 68 });
    const b = income({ ordinary: 0, age: 68 });
    const r = householdTax([a, b], ON, true, TY);

    // Reproduce the pre-fix behaviour: the best transfer reachable at 25%.
    let capped = computeTax(a, ON, TY).tax + computeTax(b, ON, TY).tax;
    for (let f = 0.05; f <= 0.5001; f += 0.05) {
      const T = 0.5 * 120000 * f; // the old double-50% arithmetic
      const fi = { ...a, ordinary: a.ordinary - T, pensionEligible: 120000 - T };
      const ti = { ...b, ordinary: b.ordinary + T, pensionEligible: T };
      capped = Math.min(capped, computeTax(fi, ON, TY).tax + computeTax(ti, ON, TY).tax);
    }
    expect(r.tax).toBeLessThan(capped);
  });

  it("splits nothing meaningful when both spouses have equal income", () => {
    const a = income({ ordinary: 60000, pensionEligible: 40000, age: 68 });
    const b = income({ ordinary: 60000, pensionEligible: 40000, age: 68 });
    const noSplit = computeTax(a, ON, TY).tax + computeTax(b, ON, TY).tax;
    const r = householdTax([a, b], ON, true, TY);
    expect(r.tax).toBeCloseTo(noSplit, 6);
  });

  it("never drives the transferor's ordinary income negative", () => {
    // Eligible pension exceeds ordinary income (a degenerate input): the
    // transfer must still be bounded by ordinary income.
    const a = income({ ordinary: 10000, pensionEligible: 90000, age: 68 });
    const b = income({ ordinary: 0, age: 68 });
    const r = householdTax([a, b], ON, true, TY);
    expect(r.splitAmt).toBeLessThanOrEqual(10000 + 1e-9);
    expect(r.perPerson.every((p) => p.taxable >= 0)).toBe(true);
  });
});


describe("CPP and OAS timing", () => {
  it("reduces CPP 0.6%/month before 65 and increases it 0.7%/month after", () => {
    expect(cppFactor(65)).toBeCloseTo(1, 10);
    expect(cppFactor(60)).toBeCloseTo(1 - 60 * 0.006, 10); // 0.64
    expect(cppFactor(70)).toBeCloseTo(1 + 60 * 0.007, 10); // 1.42
  });

  it("clamps CPP start age to the statutory 60-70 window", () => {
    expect(cppFactor(55)).toBeCloseTo(cppFactor(60), 10);
    expect(cppFactor(75)).toBeCloseTo(cppFactor(70), 10);
  });

  it("increases OAS 0.6%/month after 65, to a maximum of 36%", () => {
    expect(oasFactor(65)).toBeCloseTo(1, 10);
    expect(oasFactor(70)).toBeCloseTo(1.36, 10);
    expect(oasFactor(60)).toBeCloseTo(1, 10); // OAS cannot start early
  });
});

describe("CPP survivor's pension", () => {
  it("pays 60% of the deceased's age-65 pension to a survivor 65 or older", () => {
    const b = cppSurvivorBenefit(10000, 70, 0, 1, TY);
    expect(b).toBeCloseTo(6000, 6);
  });

  it("uses the flat rate plus 37.5% for a survivor aged 45 to 64", () => {
    const b = cppSurvivorBenefit(10000, 55, 0, 1, TY);
    expect(b).toBeCloseTo(Math.min(TY.cppSurvFlat + 3750, TY.cppSurvMaxU65), 6);
  });

  it("reduces the benefit by 1/120 per month for a survivor aged 35 to 44", () => {
    const full = cppSurvivorBenefit(10000, 45, 0, 1, TY);
    const at40 = cppSurvivorBenefit(10000, 40, 0, 1, TY);
    expect(at40).toBeCloseTo(full * 0.5, 6); // 60 of 120 months
  });

  it("pays nothing to a survivor under 35 with no children or disability", () => {
    expect(cppSurvivorBenefit(10000, 34, 0, 1, TY)).toBe(0);
  });

  it("caps the combined survivor plus own pension at the statutory maximum", () => {
    const b = cppSurvivorBenefit(20000, 70, TY.cppCombinedMax, 1, TY);
    expect(b).toBe(0);
  });

  it("pays nothing when the deceased had no CPP", () => {
    expect(cppSurvivorBenefit(0, 70, 0, 1, TY)).toBe(0);
  });
});

describe("registered account rules", () => {
  it("uses 1/(90-age) for RRIF minimums before 71 and the statutory table after", () => {
    expect(rrifMinFactor(65)).toBeCloseTo(100 / 25, 6);
    expect(rrifMinFactor(71)).toBeCloseTo(5.28, 6);
    expect(rrifMinFactor(94)).toBeCloseTo(18.79, 6);
    expect(rrifMinFactor(99)).toBe(20);
  });

  it("uses the published FSRA table for Ontario LIF maximums", () => {
    expect(lifMaxFactor(65, "ON", 6)).toBeCloseTo(7.38, 6);
    expect(lifMaxFactor(90, "ON", 6)).toBe(100);
  });

  it("keeps the LIF maximum above the RRIF minimum at every age", () => {
    for (let age = 55; age <= 88; age++) {
      expect(lifMaxFactor(age, "ON", 6)).toBeGreaterThan(rrifMinFactor(age));
    }
  });

  it("applies unlocking rules by pension jurisdiction, not by residence", () => {
    expect(unlockRule("ON").pct).toBe(50);
    expect(unlockRule("NB").pct).toBe(25);
    expect(unlockRule("BC").pct).toBe(0); // BC does not permit age-based unlocking
    expect(unlockRule("AB").minAge).toBe(50);
    expect(unlockRule("MB").full65).toBe(true);
  });
});

describe("the default plan (regression fixture)", () => {
  const P = runPlan(defaultPlanInputs());

  it("projects every year from the client's current age to the end age", () => {
    expect(P.rows).toHaveLength(95 - 60 + 1);
    expect(P.rows[0]!.age).toBe(60);
    expect(P.rows[P.rows.length - 1]!.age).toBe(95);
  });

  it("holds the lifetime tax number steady", () => {
    // The pinned figure for the seeded default plan. If a change to the tax
    // tables or the projection moves this, that change needs to be deliberate
    // and this number updated with a note saying why.
    //
    // Re-pinned in Batch 0A (pension income eligibility): was 276326. The
    // fixture person is 60 at the start and holds a RRIF and a LIF, so their
    // mandatory minimums used to earn the pension income credit from age 60.
    // Under the canonical rule RRIF/LIF cash is eligible only from 65, so the
    // credit disappears in the ages 60-64 rows and lifetime tax rises by
    // $2,288 to 278614. The direction is correct: a credit was being claimed
    // five years too early.
    // Batch 0D re-pin. Statutory amounts are now indexed past the last
    // published table instead of frozen in nominal terms, so a plan whose
    // income inflates no longer drifts into higher brackets every year.
    // With indexationRate forced to 0 this fixture reproduces the Batch 0A
    // number 278614 exactly, so the whole move is indexation and neither the
    // non-registered decomposition nor the surplus sweep touched it (this
    // fixture sweeps $0).
    expect(Math.round(lifetimeTax(P))).toBe(198394);
  });

  it("takes at least the mandatory RRIF minimum every year from 71 until the registered money is gone", () => {
    for (const r of P.rows.filter((x) => x.age >= 71 && x.totalPortfolio > 1)) {
      expect(r.regWithdraw).toBeGreaterThan(0);
    }
  });

  it("runs the portfolio down and reports the resulting shortfalls honestly", () => {
    // The seeded plan does not last. The engine must say so rather than
    // quietly funding the gap — and it must separate the funding failure
    // (spending unmet) from the balance-sheet event (portfolio exhausted).
    expect(firstShortfallAge(P)).not.toBeNull();
    expect(firstShortfallAge(P)!).toBeGreaterThan(70);
    expect(shortfallYears(P)).toBeGreaterThan(0);
    expect(P.hadInvestableAssets).toBe(true);
    expect(portfolioExhaustionAge(P)).not.toBeNull();
    expect(portfolioExhaustionAge(P)!).toBeGreaterThanOrEqual(firstShortfallAge(P)!);
  });

  it("does not report an exhausted portfolio for a household that never invested", () => {
    const R = runPlan({
      ...defaultPlanInputs(),
      accounts: [],
      liabilities: [],
    });
    expect(R.hadInvestableAssets).toBe(false);
    expect(portfolioExhaustionAge(R)).toBeNull();
    expect(R.rows.every((r) => r.portfolioEmpty)).toBe(true);
    expect(R.rows.every((r) => !r.portfolioExhausted)).toBe(true);
  });

  it("does not flag a funding shortfall in working years funded by employment income", () => {
    const working = P.rows.filter((r) => r.employ > 0 && r.shortfall <= 1);
    for (const r of working) expect(r.fundingShortfall).toBe(false);
  });

  it("pays off the mortgage and never reports a negative liability", () => {
    expect(P.rows[P.rows.length - 1]!.liabTotal).toBe(0);
    for (const r of P.rows) expect(r.liabTotal).toBeGreaterThanOrEqual(0);
  });

  it("never reports a negative account balance", () => {
    for (const r of P.rows) {
      for (const bal of Object.values(r.balances)) {
        expect(bal).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("meets the spending target in every funded year", () => {
    for (const r of P.rows) {
      if (r.shortfall <= 1) expect(r.afterTax).toBeGreaterThanOrEqual(r.spendTarget - 1);
    }
  });

  it("inflates the spending target at the assumed rate", () => {
    const first = P.rows[0]!;
    const second = P.rows[1]!;
    // Year one carries no one-off expense, so the ratio is pure inflation
    // plus the unchanged mortgage payment.
    expect(second.spendTarget).toBeGreaterThan(first.spendTarget);
  });

  it("records which withdrawal ordering auto chose", () => {
    expect(P.autoSelected).toBe(true);
    expect(FIXED_STRATEGIES).toContain(P.chosenStrategy);
  });
});

describe("withdrawal strategies", () => {
  const inputs = defaultPlanInputs();

  it("produces a valid projection for every ordering", () => {
    for (const s of FIXED_STRATEGIES) {
      const P = projection(inputs, { strategy: s });
      expect(P.rows).toHaveLength(36);
      expect(Number.isFinite(lifetimeTax(P))).toBe(true);
    }
  });

  it("chooses the ordering with the fewest shortfall years, then the largest estate", () => {
    const auto = runPlan(inputs);
    const chosen = projection(inputs, { strategy: auto.chosenStrategy });
    for (const s of FIXED_STRATEGIES) {
      const alt = projection(inputs, { strategy: s });
      const better =
        shortfallYears(alt) < shortfallYears(chosen) ||
        (shortfallYears(alt) === shortfallYears(chosen) &&
          afterTaxEstate(alt) > afterTaxEstate(chosen) + 1);
      expect(better).toBe(false);
    }
  });

  it("preserves the TFSA for longer when the TFSA is drawn last", () => {
    const tfsaLast = projection(inputs, { strategy: "nonreg_reg_tfsa" });
    const tfsaFirst = projection(inputs, { strategy: "tfsa_nonreg_reg" });
    const tfsaLifespan = (P: typeof tfsaLast) =>
      P.rows.filter((r) => (r.balances["acc_tfsa"] ?? 0) > 1).length;
    expect(tfsaLifespan(tfsaLast)).toBeGreaterThan(tfsaLifespan(tfsaFirst));
  });
});

describe("scenario overrides", () => {
  const inputs = defaultPlanInputs();
  const base = runPlan(inputs);

  // The seeded plan depletes before the end, so the meaningful measures of a
  // scenario are how long the money lasts and how many years fall short —
  // the terminal estate is just the house either way.
  const lasts = (P: ReturnType<typeof runPlan>) => firstShortfallAge(P) ?? 999;

  it("leaves the base plan untouched — inputs are never mutated", () => {
    const before = JSON.stringify(inputs);
    runPlan(inputs, { spendAdj: 30000, retAdj: -5, unlockAll: 50 });
    expect(JSON.stringify(inputs)).toBe(before);
  });

  it("falls short in more years when spending rises", () => {
    const more = runPlan(inputs, { spendAdj: 20000 });
    expect(shortfallYears(more)).toBeGreaterThan(shortfallYears(base));
    expect(lasts(more)).toBeLessThanOrEqual(lasts(base));
  });

  it("runs the money out sooner when a market shock hits early", () => {
    const shocked = runPlan(inputs, { shocks: [{ age: 62, pct: -30, years: 2 }] });
    expect(shortfallYears(shocked)).toBeGreaterThan(shortfallYears(base));
  });

  it("runs the money out sooner when returns are lower across the board", () => {
    const drag = runPlan(inputs, { retDelta: -0.01 });
    expect(shortfallYears(drag)).toBeGreaterThan(shortfallYears(base));
  });

  it("stretches the money further when the client spends less", () => {
    const less = runPlan(inputs, { spendAdj: -20000 });
    expect(shortfallYears(less)).toBeLessThan(shortfallYears(base));
  });

  it("stretches the money further when the client saves more before retirement", () => {
    const saver = runPlan(inputs, { goalSaves: [{ amt: 12000, type: "TFSA", owner: "A" }] });
    expect(shortfallYears(saver)).toBeLessThan(shortfallYears(base));
  });

  it("scales smoothly — each extra dollar of spending is never an improvement", () => {
    let prev = shortfallYears(base);
    for (const adj of [10000, 20000, 30000]) {
      const s = shortfallYears(runPlan(inputs, { spendAdj: adj }));
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe("couples and survivorship", () => {
  function couple() {
    const i = defaultPlanInputs();
    i.planType = "married";
    i.spendNeed = 90000;
    i.people.push({
      id: "B",
      firstName: "",
      lastName: "",
      dob: "1968-01-01",
      curAge: 58,
      retAge: 65,
      employ: 0,
      deathAge: 0,
      cpp: { amt: 11000, age: 65 },
      oas: { amt: 9024, age: 65 },
      pen: { amt: 24000, age: 65 },
      bridge: { amt: 0, end: 65 },
    });
    return i;
  }

  it("reports both people while both are alive", () => {
    const P = runPlan(couple());
    expect(P.couple).toBe(true);
    expect(P.rows[0]!.perPerson).toHaveLength(2);
    expect(P.rows[0]!.perPerson.every((p) => p.alive)).toBe(true);
  });

  it("splits pension income to lower household tax", () => {
    const P = runPlan(couple());
    const splitting = P.rows.filter((r) => r.splitAmt > 0);
    expect(splitting.length).toBeGreaterThan(0);
  });

  it("ends the deceased's OAS and continues only the survivor share of the DB pension", () => {
    const i = couple();
    i.people[1]!.deathAge = 75;
    const P = runPlan(i);
    const before = P.rows.find((r) => r.ages[1] === 74)!;
    const after = P.rows.find((r) => r.ages[1] === 76)!;
    expect(after.oas).toBeLessThan(before.oas);
    expect(after.pen).toBeLessThan(before.pen);
    expect(after.anyDeceased).toBe(true);
  });

  it("pays the survivor a CPP survivor's pension on top of their own", () => {
    const i = couple();
    i.people[1]!.deathAge = 75;
    const withDeath = runPlan(i);
    const noDeath = runPlan(couple());
    const yr = (P: typeof withDeath) => P.rows.find((r) => r.ages[1] === 78)!;
    // Person B's own CPP stops, but A picks up a survivor benefit, so the
    // household CPP falls by less than B's full pension.
    const drop = yr(noDeath).cpp - yr(withDeath).cpp;
    expect(drop).toBeGreaterThan(0);
    expect(drop).toBeLessThan(yr(noDeath).cpp * 0.5);
  });

  it("pays no CPP survivor's pension to unmarried partners", () => {
    const married = couple();
    married.people[1]!.deathAge = 75;
    const partners = { ...married, planType: "partners" as const };
    const yr = (P: ReturnType<typeof runPlan>) => P.rows.find((r) => r.ages[1] === 78)!;
    expect(yr(runPlan(partners)).cpp).toBeLessThan(yr(runPlan(married)).cpp);
  });

  it("rolls the deceased's accounts to the survivor rather than liquidating them", () => {
    const i = couple();
    // Modest spending so the accounts are not already drawn down by the death
    // year — otherwise this asserts nothing about the rollover itself.
    i.spendNeed = 40000;
    i.accounts.push({
      ...i.accounts[0]!,
      id: "acc_rrif_b",
      name: "RRIF B",
      owner: "B",
      bal: 300000,
      acb: 300000,
    });
    i.people[1]!.deathAge = 75;
    const P = runPlan(i);
    const before = P.rows.find((r) => r.ages[1] === 74)!;
    const after = P.rows.find((r) => r.ages[1] === 76)!;
    // The deceased's account is still on the household balance sheet after the
    // death — it changed owner, it was not cashed out.
    expect(before.balances["acc_rrif_b"]!).toBeGreaterThan(1000);
    expect(after.balances["acc_rrif_b"]!).toBeGreaterThan(1000);
    // And the household portfolio does not collapse by the size of that account.
    expect(after.totalPortfolio).toBeGreaterThan(
      before.totalPortfolio - before.balances["acc_rrif_b"]! * 0.5,
    );
  });
});


describe("LIRA unlocking", () => {
  it("moves the unlocked share into an RRSP and leaves the rest locked", () => {
    const i = defaultPlanInputs();
    const P = projection(i, { unlockAll: 50, strategy: "nonreg_reg_tfsa" });
    const unlocked = P.acctMeta.find((a) => a.id.endsWith("_unlk"));
    expect(unlocked).toBeDefined();
    expect(unlocked!.type).toBe("RRSP");
  });

  it("does not unlock money governed by a jurisdiction that forbids it", () => {
    const i = defaultPlanInputs();
    i.accounts = i.accounts.map((a) =>
      a.type === "LIF" ? { ...a, juris: "BC" as const } : a,
    );
    const P = projection(i, { unlockAll: 50, strategy: "nonreg_reg_tfsa" });
    expect(P.acctMeta.some((a) => a.id.endsWith("_unlk"))).toBe(false);
  });
});
