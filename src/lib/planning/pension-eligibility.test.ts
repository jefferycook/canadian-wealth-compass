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
import {
  computeTax,
  householdTax,
  pensionCreditBase,
  pensionSplittable,
} from "./tax";
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

/**
 * A one-year, zero-growth, zero-spend plan for a COUPLE.
 *
 * Same recipe as `oneYearPlan`: with zero returns and a zero spending need the
 * discretionary draw solves to zero, so the single row's income is exactly the
 * mandatory RRIF minimum (plus any DB pension) and nothing else.
 */
function oneYearCouplePlan(opts: {
  ageA: number;
  ageB: number;
  accountsA?: AccountInput[];
  penA?: number;
}): PlanInputs {
  const person = (id: "A" | "B", age: number, pen: number) => ({
    id,
    firstName: "",
    lastName: "",
    curAge: age,
    retAge: 55,
    employ: 0,
    deathAge: 0,
    cpp: { amt: 0, age: 65 },
    oas: { amt: 0, age: 65 },
    pen: { amt: pen, age: 60 },
    bridge: { amt: 0, end: 65 },
  });
  return {
    taxYear: 2026,
    planType: "married",
    endAge: opts.ageA,
    inflation: 0,
    spendNeed: 0,
    eqRet: 0,
    fiRet: 0,
    survivorPct: 0.6,
    strategy: "nonreg_reg_tfsa",
    tax: ON,
    people: [
      person("A", opts.ageA, opts.penA ?? 0),
      person("B", opts.ageB, 0),
    ],
    accounts: opts.accountsA ?? [],
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
    // Pension below the $2,000 credit maximum, so an eligible bridge would
    // visibly increase the credit if it were wrongly counted.
    const pen = 1200;
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
    const eligible = 300000;
    const a = inc({ age: 70, ordinary: 300000, pensionEligible: eligible });
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
    const b = inc({ age: 70, ordinary: 0, pensionEligible: 0 });
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

describe("Erratum 5 — the transferee applies their own age test", () => {
  const settings = ON;

  /** Hand-built two-sided comparison, the same style as the classification tests. */
  const pair = (x: IncomeComponents, y: IncomeComponents) =>
    computeTax(x, settings, TY).tax + computeTax(y, settings, TY).tax;

  it("a spouse aged 64 gets NO credit on split RRIF income, so tax is higher", () => {
    // Pensioner 66, all eligible income RRIF-sourced. Transferee 64.
    const a = inc({ age: 66, ordinary: 90000, pensionEligible65Plus: 90000 });
    const b = inc({ age: 64, ordinary: 0 });
    const r = householdTax([a, b], settings, true, TY);
    const T = r.splitAmt;
    expect(T).toBeGreaterThan(0);

    // Erratum 5 behaviour: the whole transfer lands in the 65+ stream, and the
    // 64-year-old transferee's credit base is therefore zero.
    const post = pair(
      { ...a, ordinary: a.ordinary - T, pensionEligible65Plus: 90000 - T },
      { ...b, ordinary: T, pensionEligible65Plus: T },
    );
    expect(r.tax).toBeCloseTo(post, 6);
    expect(pensionCreditBase({ ...b, ordinary: T, pensionEligible65Plus: T })).toBe(0);

    // Pre-Erratum-5 behaviour credited the transferee regardless of age, which
    // understated household tax. The corrected answer must be strictly higher.
    const preErratum5 = pair(
      { ...a, ordinary: a.ordinary - T, pensionEligible65Plus: 90000 - T },
      { ...b, ordinary: T, pensionEligibleAnyAge: T },
    );
    expect(r.tax).toBeGreaterThan(preErratum5);
  });

  it("the same split RRIF portion DOES count once the transferee is 65", () => {
    const b64 = inc({ age: 64, ordinary: 20000, pensionEligible65Plus: 20000 });
    const b65 = inc({ ...b64, age: 65 });
    expect(pensionCreditBase(b64)).toBe(0);
    expect(pensionCreditBase(b65)).toBe(20000);
    // The credit is worth the pension amount at the lowest federal+provincial
    // rates, so the 65-year-old pays strictly less on identical income.
    expect(computeTax(b65, settings, TY).tax).toBeLessThan(
      computeTax(b64, settings, TY).tax,
    );
  });

  it("an RPP lifetime pension split to a spouse aged 55 DOES count for them", () => {
    const a = inc({ age: 60, ordinary: 80000, pensionEligibleAnyAge: 80000 });
    const b = inc({ age: 55, ordinary: 0 });
    const r = householdTax([a, b], settings, true, TY);
    const T = r.splitAmt;
    expect(T).toBeGreaterThan(0);
    const transferee = { ...b, ordinary: T, pensionEligibleAnyAge: T };
    expect(pensionCreditBase(transferee)).toBeCloseTo(T, 6);
    expect(r.tax).toBeCloseTo(
      pair(
        { ...a, ordinary: a.ordinary - T, pensionEligibleAnyAge: 80000 - T },
        transferee,
      ),
      6,
    );
  });

  it("draws the transfer proportionally from both streams", () => {
    // 25% any-age, 75% RRIF-sourced. A transferee aged 64 may only credit the
    // any-age quarter, and cannot elect to move that quarter preferentially.
    const anyAge = 20000;
    const p65 = 60000;
    const a = inc({
      age: 70,
      ordinary: 120000,
      pensionEligibleAnyAge: anyAge,
      pensionEligible65Plus: p65,
    });
    const b = inc({ age: 64, ordinary: 0 });
    const r = householdTax([a, b], settings, true, TY);
    const T = r.splitAmt;
    expect(T).toBeGreaterThan(0);
    // The 50% ceiling is measured on the combined pool.
    expect(T).toBeLessThanOrEqual((anyAge + p65) * 0.5 + 1e-9);

    const fracAny = anyAge / (anyAge + p65);
    const tAny = T * fracAny;
    const t65 = T - tAny;
    const transferee = {
      ...b,
      ordinary: T,
      pensionEligibleAnyAge: tAny,
      pensionEligible65Plus: t65,
    };
    const transferor = {
      ...a,
      ordinary: a.ordinary - T,
      pensionEligibleAnyAge: anyAge - tAny,
      pensionEligible65Plus: p65 - t65,
    };
    // Transferee receives the proportional shares; transferor falls by the same.
    expect(pensionCreditBase(transferee)).toBeCloseTo(tAny, 6);
    expect(pensionSplittable(transferor)).toBeCloseTo(anyAge + p65 - T, 6);
    expect(r.tax).toBeCloseTo(pair(transferor, transferee), 6);
  });

  it("treats the legacy scalar as the any-age stream", () => {
    const legacy = inc({ age: 60, ordinary: 40000, pensionEligible: 40000 });
    const explicitAny = inc({ age: 60, ordinary: 40000, pensionEligibleAnyAge: 40000 });
    expect(pensionCreditBase(legacy)).toBe(pensionCreditBase(explicitAny));
    expect(computeTax(legacy, settings, TY).tax).toBeCloseTo(
      computeTax(explicitAny, settings, TY).tax,
      9,
    );
  });

  it("leaves a single filer untouched — there is no transfer path", () => {
    const solo = inc({ age: 66, ordinary: 90000, pensionEligible65Plus: 90000 });
    const r = householdTax([solo], settings, true, TY);
    expect(r.splitAmt).toBe(0);
    expect(r.tax).toBeCloseTo(computeTax(solo, settings, TY).tax, 9);
    // A 66-year-old holder still gets their own credit on RRIF income.
    expect(pensionCreditBase(solo)).toBe(90000);
  });
});

/**
 * End-to-end coverage for Erratum 5.
 *
 * Gap this closes: every other Erratum 5 test calls `householdTax` with
 * hand-built `IncomeComponents`, and the couple golden anchor did not move
 * when the correction landed (its transferee credit is capped by the pension
 * amount either way). So if `projection.ts` ever wrote RRIF-sourced cash into
 * `pensionEligibleAnyAge` — or into the legacy scalar — the whole suite would
 * still pass. These tests run the projection itself and compare it against
 * BOTH constructions, so a misclassification fails loudly.
 */
describe("Erratum 5 end-to-end — the projection feeds two typed streams", () => {
  const rrifA = (bal: number): AccountInput[] => [
    account({ id: "rrif_a", name: "RRIF", type: "RRIF", owner: "A", bal }),
  ];

  it("RRIF cash reaches the 65+ stream, so a 64-year-old transferee gets no credit", () => {
    const P = projection(oneYearCouplePlan({ ageA: 66, ageB: 64, accountsA: rrifA(1500000) }));
    const row = P.rows[0]!;
    const min = (1500000 * rrifMinFactor(66)) / 100;

    const correct = householdTax(
      [inc({ age: 66, ordinary: min, pensionEligible65Plus: min }), inc({ age: 64 })],
      ON,
      true,
      TY,
    );
    const preErratum5 = householdTax(
      [inc({ age: 66, ordinary: min, pensionEligibleAnyAge: min }), inc({ age: 64 })],
      ON,
      true,
      TY,
    );

    // Not vacuous: the optimizer really is splitting in both worlds.
    expect(row.splitAmt).toBeGreaterThan(0);
    expect(correct.splitAmt).toBeGreaterThan(0);
    expect(preErratum5.splitAmt).toBeGreaterThan(0);

    expect(row.tax).toBeCloseTo(correct.tax, 6);
    // The assertion that matters: classifying RRIF cash as any-age would hand
    // the 64-year-old transferee a pension credit they are not entitled to.
    expect(row.tax).toBeGreaterThan(preErratum5.tax + 1);
  });

  it("an RPP lifetime pension reaches the any-age stream, so the same 64-year-old transferee DOES get the credit", () => {
    const P = projection(oneYearCouplePlan({ ageA: 66, ageB: 64, penA: 40000 }));
    const row = P.rows[0]!;

    const correct = householdTax(
      [inc({ age: 66, ordinary: 40000, pensionEligibleAnyAge: 40000 }), inc({ age: 64 })],
      ON,
      true,
      TY,
    );
    const misclassified = householdTax(
      [inc({ age: 66, ordinary: 40000, pensionEligible65Plus: 40000 }), inc({ age: 64 })],
      ON,
      true,
      TY,
    );

    expect(row.splitAmt).toBeGreaterThan(0);
    expect(correct.splitAmt).toBeGreaterThan(0);

    expect(row.tax).toBeCloseTo(correct.tax, 6);
    // Mirror of the test above: the two streams are genuinely distinct, not
    // both written to whichever single field happens to be checked.
    expect(row.tax).toBeLessThan(misclassified.tax - 1);
  });

  it("the transferee's own birthday, not the transferor's, controls the credit", () => {
    const at64 = projection(
      oneYearCouplePlan({ ageA: 66, ageB: 64, accountsA: rrifA(1500000) }),
    ).rows[0]!;
    const at65 = projection(
      oneYearCouplePlan({ ageA: 66, ageB: 65, accountsA: rrifA(1500000) }),
    ).rows[0]!;
    const min = (1500000 * rrifMinFactor(66)) / 100;

    const expected65 = householdTax(
      [inc({ age: 66, ordinary: min, pensionEligible65Plus: min }), inc({ age: 65 })],
      ON,
      true,
      TY,
    );

    expect(at65.splitAmt).toBeGreaterThan(0);
    expect(at65.tax).toBeCloseTo(expected65.tax, 6);
    // A's side is identical in both runs; only B's age differs.
    expect(at65.tax).toBeLessThan(at64.tax);
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
    //
    // Erratum 5 (transferee pension credit) was expected to move this number
    // upward, because B is 64 in year one and previously earned the $2,000
    // pension amount on split RRIF income. It did NOT move, and the reason is
    // arithmetic rather than a missed correction: A holds a $24,000 RPP
    // lifetime pension alongside the RRIF cash, so the proportional draw sends
    // several thousand dollars of ANY-AGE pension income to B every year —
    // far more than the $2,000 federal / $1,673 Ontario pension amount can
    // absorb. B's credit is capped by the pension amount, not by the size of
    // the eligible stream, so it is unchanged. The correction is exercised
    // directly by the Erratum 5 tests above, where the transferor holds only
    // RRIF-sourced income and the transferee's credit correctly falls to zero,
    // and end to end by "Erratum 5 end-to-end — the projection feeds two typed
    // streams" above, which is the actual proof that the correction is live on
    // the projection path rather than only inside `householdTax`.
    //
    // Record plainly: this anchor not moving is a CAP result — B's credit was
    // already limited by the pension amount — and is not by itself evidence
    // that Erratum 5 is implemented correctly. The anchor is a regression
    // tripwire; the mechanism tests are the proof.
    expect(Math.round(lifetime)).toBe(COUPLE_GOLDEN);
  });
});

/** See the note on the test above before changing this number. */
// Batch 0D re-pin, 554616 -> 411408, from indexation of the statutory
// amounts in the derived tax years. Erratum 5 behaviour is unchanged.
const COUPLE_GOLDEN = 411408;
