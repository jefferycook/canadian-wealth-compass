/**
 * Batch 0A — pension income eligibility classification.
 *
 * Canonical rule (spec v1.2 FINAL + Erratum 1):
 *
 *   pensionEligible = rppLifetimePension
 *                   + (age >= 65 ? rrifEligibleCash : 0)
 *                   + (bridgeEligibleAffirmed ? bridgeInc : 0)
 *
 * Each test below builds a one-year plan with zero returns and zero spending
 * need, so the year's tax is fully determined by the fixed income. The tax the
 * projection reports is then compared against `computeTax` run twice by hand:
 * once with the withdrawal counted as pension eligible and once with it not.
 * That pins the classification itself, not just a total.
 */

import { describe, expect, it } from "vitest";

import { coupleGoldenFixturePlan } from "./fixtures";
import { projection } from "./projection";
import { rrifMinFactor } from "./registered";
import { computeTax, householdTax } from "./tax";
import { getTaxYear } from "./taxYears";
import type {
  AccountInput,
  AccountType,
  BridgeInput,
  IncomeComponents,
  PlanInputs,
  TaxSettings,
} from "./types";

const TY = getTaxYear(2026);
const ON: TaxSettings = {
  provinceKey: "ON",
  fedBPA: 16452,
  provBPA: 12989,
  oasThresh: 95323,
  lifRate: 6,
};

function account(over: Partial<AccountInput> & { type: AccountType }): AccountInput {
  return {
    id: "acc",
    name: "acc",
    owner: "A",
    bal: 0,
    acb: 0,
    eq: 0,
    mix: { int: 1, div: 0, cg: 0 },
    juris: "ON",
    conv: 0,
    unlock: 0,
    contrib: 0,
    contribEnd: 0,
    wd: 0,
    wdStart: 0,
    wdEnd: 0,
    ...over,
  };
}

/** A one-year, zero-growth, zero-spend plan for one person. */
function oneYearPlan(opts: {
  age: number;
  accounts?: AccountInput[];
  pen?: number;
  bridge?: BridgeInput;
}): PlanInputs {
  return {
    taxYear: 2026,
    planType: "single",
    endAge: opts.age,
    inflation: 0,
    spendNeed: 0,
    eqRet: 0,
    fiRet: 0,
    survivorPct: 0.6,
    strategy: "nonreg_reg_tfsa",
    tax: ON,
    people: [
      {
        id: "A",
        firstName: "",
        lastName: "",
        curAge: opts.age,
        retAge: 55, // already retired, so bridge timing rules apply
        employ: 0,
        deathAge: 0,
        cpp: { amt: 0, age: 65 },
        oas: { amt: 0, age: 65 },
        pen: { amt: opts.pen ?? 0, age: 60 },
        bridge: opts.bridge ?? { amt: 0, end: 65 },
      },
    ],
    accounts: opts.accounts ?? [],
    expenses: [],
    otherIncome: [],
    lumpSums: [],
    hardAssets: [],
    liabilities: [],
  };
}

const inc = (over: Partial<IncomeComponents>): IncomeComponents => ({
  ordinary: 0,
  eligDiv: 0,
  capGainsTaxable: 0,
  pensionEligible: 0,
  oasReceived: 0,
  age: 65,
  ...over,
});

/** Tax if `eligible` of the ordinary income counted for the pension credit. */
const taxWith = (age: number, ordinary: number, eligible: number) =>
  computeTax(inc({ age, ordinary, pensionEligible: eligible }), ON, TY).tax;

describe("source-aware registered withdrawal classification", () => {
  it("age 70, plain RRSP withdrawal: taxable but not pension eligible", () => {
    // conv = 99 keeps the account an RRSP, not a RRIF, at 70.
    const w = 30000;
    const P = projection(
      oneYearPlan({
        age: 70,
        accounts: [
          account({ type: "RRSP", bal: 200000, conv: 99, wd: w, wdStart: 0, wdEnd: 999 }),
        ],
      }),
    );
    const row = P.rows[0]!;
    expect(row.regWithdraw).toBeCloseTo(w, 6);
    expect(row.tax).toBeCloseTo(taxWith(70, w, 0), 6);
    // Being 65+ does not make plain RRSP cash eligible.
    expect(row.tax).toBeGreaterThan(taxWith(70, w, w) + 1);
  });

  it("age 60, mandatory RRIF minimum: taxable but not pension eligible", () => {
    const bal = 400000;
    const P = projection(
      oneYearPlan({ age: 60, accounts: [account({ type: "RRIF", bal })] }),
    );
    const row = P.rows[0]!;
    const min = bal * (rrifMinFactor(60) / 100);
    expect(row.regWithdraw).toBeCloseTo(min, 4);
    expect(row.tax).toBeCloseTo(taxWith(60, min, 0), 4);
    expect(row.tax).toBeGreaterThan(taxWith(60, min, min) + 1);
  });

  it("age 66, RRIF withdrawal: pension eligible", () => {
    const bal = 400000;
    const w = 20000;
    const P = projection(
      oneYearPlan({
        age: 66,
        accounts: [account({ type: "RRIF", bal, wd: w, wdStart: 0, wdEnd: 999 })],
      }),
    );
    const row = P.rows[0]!;
    const min = bal * (rrifMinFactor(66) / 100);
    const total = min + w;
    expect(row.regWithdraw).toBeCloseTo(total, 4);
    expect(row.tax).toBeCloseTo(taxWith(66, total, total), 4);
    expect(row.tax).toBeLessThan(taxWith(66, total, 0) - 1);
  });

  it("age 66, LIF withdrawal: pension eligible", () => {
    const bal = 300000;
    const P = projection(
      oneYearPlan({ age: 66, accounts: [account({ type: "LIF", bal, juris: "ON" })] }),
    );
    const row = P.rows[0]!;
    const min = bal * (rrifMinFactor(66) / 100);
    expect(row.regWithdraw).toBeCloseTo(min, 4);
    expect(row.tax).toBeCloseTo(taxWith(66, min, min), 4);
  });
});

describe("employer pension and bridge classification", () => {
  it("age 60, RPP lifetime pension: pension eligible", () => {
    const pen = 30000;
    const P = projection(oneYearPlan({ age: 60, pen }));
    const row = P.rows[0]!;
    expect(row.tax).toBeCloseTo(taxWith(60, pen, pen), 4);
    expect(row.tax).toBeLessThan(taxWith(60, pen, 0) - 1);
  });

  it("age 60, lifetime pension plus an ordinary bridge: only the lifetime pension is eligible", () => {
    const pen = 30000;
    const bridge = 40000;
    const P = projection(
      oneYearPlan({
        age: 60,
        pen,
        bridge: { amt: bridge, end: 65, sourceClass: "RPP_BRIDGE" },
      }),
    );
    const row = P.rows[0]!;
    // Bridge is fully taxable ordinary income and produces cash...
    expect(row.pen).toBeCloseTo(pen + bridge, 4);
    expect(row.taxable).toBeCloseTo(pen + bridge, 4);
    // ...but only the lifetime pension enters the pension credit.
    expect(row.tax).toBeCloseTo(taxWith(60, pen + bridge, pen), 4);
    expect(row.tax).toBeGreaterThan(taxWith(60, pen + bridge, pen + bridge) + 1);
  });

  it("a bridge affirmed as an RPP lifetime benefit does enter pensionEligible", () => {
    const bridge = 40000;
    const P = projection(
      oneYearPlan({
        age: 60,
        bridge: {
          amt: bridge,
          end: 65,
          sourceClass: "RPP_LIFETIME",
          eligibleAffirmed: true,
        },
      }),
    );
    expect(P.rows[0]!.tax).toBeCloseTo(taxWith(60, bridge, bridge), 4);
  });

  it("affirmation defaults to false on plans saved without the new fields", () => {
    const bridge = 40000;
    // No sourceClass, no eligibleAffirmed — exactly an older stored plan.
    const P = projection(oneYearPlan({ age: 60, bridge: { amt: bridge, end: 65 } }));
    expect(P.rows[0]!.tax).toBeCloseTo(taxWith(60, bridge, 0), 4);
  });

  it("a non-RPP supplement cannot be affirmed into eligibility", () => {
    const bridge = 40000;
    for (const sourceClass of ["RCA", "SERP", "NONREG", "OTHER", "RPP_BRIDGE"] as const) {
      const P = projection(
        oneYearPlan({
          age: 60,
          bridge: { amt: bridge, end: 65, sourceClass, eligibleAffirmed: true },
        }),
      );
      expect(P.rows[0]!.tax).toBeCloseTo(taxWith(60, bridge, 0), 4);
    }
  });
});

describe("pension splitting search endpoints", () => {
  const settings = ON;

  it("evaluates 0% — no transfer when splitting cannot help", () => {
    // Identical spouses: any transfer is neutral or worse, so the optimum is 0.
    const a = inc({ age: 70, ordinary: 60000, pensionEligible: 40000 });
    const b = inc({ age: 70, ordinary: 60000, pensionEligible: 40000 });
    const r = householdTax([a, b], settings, true, TY);
    expect(r.splitAmt).toBe(0);
    expect(r.tax).toBeCloseTo(
      computeTax(a, settings, TY).tax + computeTax(b, settings, TY).tax,
      6,
    );
  });

  it("evaluates the full 50% endpoint on a lopsided couple", () => {
    // One spouse holds all the eligible pension income; the tax-minimizing
    // transfer is the statutory maximum, i.e. 50% of the eligible amount.
    const eligible = 90000;
    const a = inc({ age: 70, ordinary: 90000, pensionEligible: eligible });
    const b = inc({ age: 70, ordinary: 0, pensionEligible: 0 });
    const r = householdTax([a, b], settings, true, TY);
    expect(r.splitAmt).toBeCloseTo(eligible * 0.5, 2);
    expect(r.dir).toBe(0);
    expect(r.tax).toBeLessThan(
      computeTax(a, settings, TY).tax + computeTax(b, settings, TY).tax,
    );
  });

  it("finds an interior optimum when the 50% endpoint overshoots", () => {
    const eligible = 90000;
    const a = inc({ age: 70, ordinary: 90000, pensionEligible: eligible });
    const b = inc({ age: 70, ordinary: 70000, pensionEligible: 0 });
    const r = householdTax([a, b], settings, true, TY);
    expect(r.splitAmt).toBeGreaterThan(0);
    expect(r.splitAmt).toBeLessThan(eligible * 0.5);
  });

  it("never splits for a couple who are not spouses", () => {
    const a = inc({ age: 70, ordinary: 90000, pensionEligible: 90000 });
    const b = inc({ age: 70, ordinary: 0, pensionEligible: 0 });
    expect(householdTax([a, b], settings, false, TY).splitAmt).toBe(0);
  });
});

describe("couple golden fixture", () => {
  const P = projection(coupleGoldenFixturePlan());
  const lifetime = P.rows.reduce((s, r) => s + r.tax, 0);

  it("projects both people from A's age 66 to the end age", () => {
    expect(P.rows).toHaveLength(90 - 66 + 1);
    expect(P.rows[0]!.perPerson).toHaveLength(2);
  });

  it("splits pension income to the lower-income spouse in the early years", () => {
    expect(P.rows[0]!.splitAmt).toBeGreaterThan(0);
  });

  it("holds the couple lifetime tax number steady", () => {
    // Batch 0A anchor. Pinned after the eligibility classification landed:
    // A's RRIF cash counts (age 66+), A's bridge does not (temporary, not
    // affirmed), and B's plain RRSP cash never does.
    expect(Math.round(lifetime)).toBe(COUPLE_GOLDEN);
  });
});

/** See the note on the test above before changing this number. */
const COUPLE_GOLDEN = 411915;
