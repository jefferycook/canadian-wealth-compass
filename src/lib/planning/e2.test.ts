/**
 * Engine Batch E2 — R-3 (the minimum amount is nil in the year the fund was
 * entered into) and R-2 (the base is fair market value at the beginning of the
 * year, for the RRIF minimum and for the balance-based limb of the LIF
 * maximum).
 *
 * Governing provision: ITA s.146.3(1) "minimum amount"; CRA IC78-18R7.
 *
 * Every test here is new. No existing test was modified for this batch.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { projection } from "./projection";
import { regressionFixturePlan } from "./fixtures";
import { lifMaximumFor, rrifMinFactor } from "./registered";
import type { AccountInput, PlanInputs, ProjectionResult } from "./types";

const SRC = (f: string) => readFileSync(`src/lib/planning/${f}`, "utf8");

/** A bare account with everything switched off unless overridden. */
function acct(a: Partial<AccountInput> & { id: string; type: AccountInput["type"] }): AccountInput {
  return {
    name: a.id,
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
    ...a,
  } as AccountInput;
}

/**
 * A quiet single-person probe plan: no inflation, no indexation, no guaranteed
 * income, no spending and (by default) no growth, so the only registered
 * withdrawal in any row is the mandatory RRIF/LIF minimum.
 */
function probePlan(opts: {
  curAge: number;
  endAge: number;
  accounts: AccountInput[];
  retAge?: number;
  spendNeed?: number;
  ret?: number;
}): PlanInputs {
  const base = regressionFixturePlan();
  const r = opts.ret ?? 0;
  return {
    ...base,
    planType: "single",
    inflation: 0,
    indexationRate: 0,
    eqRet: r,
    fiRet: r,
    spendNeed: opts.spendNeed ?? 0,
    currentSpend: opts.spendNeed ?? 0,
    strategy: "nonreg_reg_tfsa",
    endAge: opts.endAge,
    people: [
      {
        ...base.people[0]!,
        curAge: opts.curAge,
        retAge: opts.retAge ?? opts.curAge,
        employ: 0,
        cpp: { amt: 0, age: 65 },
        oas: { amt: 0, age: 65 },
        pen: { amt: 0, age: 65 },
        bridge: { amt: 0, end: 65 },
      },
    ],
    accounts: opts.accounts,
    expenses: [],
    otherIncome: [],
    lumpSums: [],
    hardAssets: [],
    liabilities: [],
  };
}

const rowAt = (r: ProjectionResult, age: number) => r.rows.find((x) => x.age === age)!;
const minF = (age: number) => rrifMinFactor(age) / 100;

/* ------------------------------------------------------------------ */
/* R-3 — establishment-year minimum is nil                             */
/* ------------------------------------------------------------------ */

describe("R-3 — the minimum amount is nil in the year the fund was entered into", () => {
  it("R3-3: a pre-existing RRIF at off 0 takes a normal, non-zero minimum", () => {
    const r = projection(
      probePlan({
        curAge: 72,
        endAge: 74,
        accounts: [acct({ id: "rrif", type: "RRIF", bal: 300000, acb: 300000 })],
      }),
    );
    expect(rowAt(r, 72).regWithdraw).toBeCloseTo(300000 * minF(72), 6);
    expect(rowAt(r, 72).regWithdraw).toBeGreaterThan(0);
  });

  it("R3-4: a pre-existing LIF at off 0 likewise takes a normal minimum", () => {
    const r = projection(
      probePlan({
        curAge: 72,
        endAge: 74,
        accounts: [acct({ id: "lif", type: "LIF", bal: 300000, acb: 300000 })],
      }),
    );
    expect(rowAt(r, 72).regWithdraw).toBeCloseTo(300000 * minF(72), 6);
  });

  it("R3-1/R3-2: an RRSP converting at 71 takes nil that year and a normal minimum the next", () => {
    const r = projection(
      probePlan({
        curAge: 69,
        endAge: 73,
        accounts: [acct({ id: "rrsp", type: "RRSP", bal: 300000, acb: 300000 })],
      }),
    );
    expect(rowAt(r, 70).regWithdraw).toBe(0); // not yet in RRIF status
    expect(rowAt(r, 71).regWithdraw).toBe(0); // establishment year — nil
    expect(rowAt(r, 72).regWithdraw).toBeCloseTo(300000 * minF(72), 6);
    expect(rowAt(r, 72).regWithdraw).toBeGreaterThan(0);
  });

  it("R3-5: a LIRA converting to a LIF mid-projection is nil that year, normal the next", () => {
    const r = projection(
      probePlan({
        curAge: 60,
        endAge: 67,
        retAge: 65,
        accounts: [acct({ id: "lira", type: "LIRA", bal: 300000, juris: "ON" })],
      }),
    );
    expect(rowAt(r, 65).regWithdraw).toBe(0);
    expect(rowAt(r, 66).regWithdraw).toBeCloseTo(300000 * minF(66), 6);
  });

  it("R3-6: a PRRIF created by an unlock at off > 0 is nil in its creation year", () => {
    const r = projection(
      probePlan({
        curAge: 54,
        endAge: 58,
        retAge: 55,
        accounts: [
          acct({ id: "lira", type: "LIRA", bal: 400000, juris: "MB", conv: 55, unlock: 50 }),
        ],
      }),
    );
    // At 55 the LIRA becomes a LIF (establishment year) and the unlock creates
    // a PRRIF (also its establishment year): both minimums are nil.
    expect(rowAt(r, 55).regWithdraw).toBe(0);
    // At 56 both funds take a normal minimum on the whole 400,000.
    expect(rowAt(r, 56).regWithdraw).toBeCloseTo(400000 * minF(56), 4);
  });

  it("R3-6a: a PRRIF created by an unlock during off 0 is exempt; the pre-existing LIF is not", () => {
    const r = projection(
      probePlan({
        curAge: 55,
        endAge: 58,
        retAge: 55,
        accounts: [
          acct({ id: "lira", type: "LIRA", bal: 400000, juris: "MB", conv: 55, unlock: 50 }),
        ],
      }),
    );
    // The source was present at intake with its conversion condition already
    // met, so it is treated as pre-existing and pays a minimum on its own
    // 200,000. The 200,000 in the newly created PRRIF pays nothing.
    expect(rowAt(r, 55).regWithdraw).toBeCloseTo(200000 * minF(55), 4);
    expect(rowAt(r, 55).regWithdraw).toBeGreaterThan(0);
  });

  it("R3-6b: that PRRIF does not get a second exemption when it receives a later transfer", () => {
    const r = projection(
      probePlan({
        curAge: 55,
        endAge: 70,
        retAge: 55,
        accounts: [
          acct({ id: "lira", type: "LIRA", bal: 400000, juris: "MB", conv: 55, unlock: 100 }),
        ],
      }),
    );
    // Manitoba's age-65 right moves the remaining locked balance into the same
    // PRRIF. It was established at 55; it is not re-established at 65.
    expect(rowAt(r, 65).regWithdraw).toBeGreaterThan(0);
  });

  it("R3-7: the LIF maximum still applies in an establishment year", () => {
    const plan = probePlan({
      curAge: 60,
      endAge: 67,
      retAge: 65,
      spendNeed: 400000, // demand far more than the LIF may release
      accounts: [acct({ id: "lira", type: "LIRA", bal: 300000, juris: "ON" })],
    });
    const r = projection(plan);
    const lm = lifMaximumFor("ON", 65, plan.tax.lifRate);
    expect(lm.applies).toBe(true);
    // Minimum is nil in the establishment year, so the cap is the full maximum.
    expect(rowAt(r, 65).regWithdraw).toBeCloseTo(300000 * (lm.pct / 100), 4);
    expect(rowAt(r, 65).regWithdraw).toBeLessThan(300000);
    expect(rowAt(r, 65).fundingShortfall).toBe(true);
  });

  it("R3-8: an ambiguous start is NOT exempt, and the row is APPROXIMATE", () => {
    const r = projection(
      probePlan({
        curAge: 72,
        endAge: 74,
        accounts: [acct({ id: "rrsp", type: "RRSP", bal: 300000, acb: 300000 })],
      }),
    );
    expect(rowAt(r, 72).regWithdraw).toBeCloseTo(300000 * minF(72), 6);
    const c = r.componentStatuses.find(
      (x) => x.component === "rrif.establishmentYearAmbiguousStart",
    )!;
    expect(c.status).toBe("APPROXIMATE");
    expect(c.substitutive).toBe(false);
    expect(c.engaged).toBe(true);
    expect(rowAt(r, 72).validity).toBe("APPROXIMATE");
    expect(rowAt(r, 72).validityReasons.map((x) => x.code)).toContain(
      "RRIF_ESTABLISHMENT_DATE_UNKNOWN",
    );
  });

  it("R3-9: an account entered as a RRIF at intake does not raise the ambiguity component", () => {
    const r = projection(
      probePlan({
        curAge: 72,
        endAge: 74,
        accounts: [acct({ id: "rrif", type: "RRIF", bal: 300000, acb: 300000 })],
      }),
    );
    const c = r.componentStatuses.find(
      (x) => x.component === "rrif.establishmentYearAmbiguousStart",
    )!;
    expect(c.engaged).toBe(false);
    expect(r.rows.every((x) => x.validity === "OK")).toBe(true);
  });

  it("R3-10: TFSA, non-registered and a plain RRSP below conversion age are unaffected", () => {
    const r = projection(
      probePlan({
        curAge: 60,
        endAge: 65,
        accounts: [
          acct({ id: "tfsa", type: "TFSA", bal: 100000, acb: 100000 }),
          acct({ id: "nr", type: "NONREG", bal: 100000, acb: 100000 }),
          acct({ id: "rrsp", type: "RRSP", bal: 100000, acb: 100000 }),
        ],
      }),
    );
    expect(r.rows.every((x) => x.regWithdraw === 0)).toBe(true);
    expect(r.rows.every((x) => x.validity === "OK")).toBe(true);
  });
});

export { SRC };
