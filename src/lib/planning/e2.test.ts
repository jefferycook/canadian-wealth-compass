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

import { describe, expect, it } from "vitest";

import { projection, UNLOCK_SOURCE_TYPES } from "./projection";
import { regressionFixturePlan } from "./fixtures";
import { lifMaximumFor, rrifMinFactor } from "./registered";
import type { AccountInput, PlanInputs, ProjectionResult } from "./types";

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
    // met, so it is treated as pre-existing and pays a minimum. Under R-2 that
    // minimum is struck on its BEGINNING-of-year FMV — the whole 400,000 —
    // even though 200,000 left during the year. The newly created PRRIF has no
    // beginning-of-year FMV and pays nothing.
    expect(rowAt(r, 55).regWithdraw).toBeCloseTo(400000 * minF(55), 4);
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

/* ------------------------------------------------------------------ */
/* R-2 — beginning-of-year fair market value is the base               */
/* ------------------------------------------------------------------ */

describe("R-2 — the minimum and the LIF maximum are struck on beginning-of-year FMV", () => {
  it("R2-1: in-year growth does not raise the RRIF minimum", () => {
    const r = projection(
      probePlan({
        curAge: 72,
        endAge: 74,
        ret: 0.1,
        accounts: [acct({ id: "rrif", type: "RRIF", bal: 300000, acb: 300000 })],
      }),
    );
    // 300,000 opening; the grown balance (330,000) is NOT the base.
    expect(rowAt(r, 72).regWithdraw).toBeCloseTo(300000 * minF(72), 4);
    expect(rowAt(r, 72).regWithdraw).toBeLessThan(330000 * minF(72) - 1);
  });

  it("R2-2: the second year's base is that year's opening value, not the first year's", () => {
    const r = projection(
      probePlan({
        curAge: 72,
        endAge: 75,
        ret: 0.1,
        accounts: [acct({ id: "rrif", type: "RRIF", bal: 300000, acb: 300000 })],
      }),
    );
    const y0 = rowAt(r, 72);
    const open1 = (300000 - y0.regWithdraw) * 1.1;
    // Within 1% of the opening-value minimum (the surplus sweep reinvests a
    // little of the first year's after-tax cash), and nowhere near the
    // end-of-year value that the old basis would have used.
    expect(rowAt(r, 73).regWithdraw).toBeGreaterThan(open1 * minF(73) * 0.99);
    expect(rowAt(r, 73).regWithdraw).toBeLessThan(open1 * minF(73) * 1.01);
  });

  it("R2-3: the LIF maximum's balance limb also reads the opening balance", () => {
    const plan = probePlan({
      curAge: 72,
      endAge: 74,
      ret: 0.1,
      spendNeed: 400000,
      accounts: [acct({ id: "lif", type: "LIF", bal: 300000, acb: 300000, juris: "ON" })],
    });
    const r = projection(plan);
    const lm = lifMaximumFor("ON", 72, plan.tax.lifRate);
    expect(lm.applies).toBe(true);
    // Minimum plus the permitted top-up both come off the same 300,000 base.
    expect(rowAt(r, 72).regWithdraw).toBeCloseTo(300000 * (lm.pct / 100), 3);
  });

  it("R2-4: a transfer that leaves a fund short of its minimum is UNSUPPORTED and withheld", () => {
    const r = projection(
      probePlan({
        curAge: 66,
        endAge: 68,
        retAge: 66,
        accounts: [
          acct({ id: "lif", type: "LIF", bal: 400000, juris: "MB", conv: 55, unlock: 100 }),
        ],
      }),
    );
    // Manitoba's age-65 right moves the whole balance out before step 6a, so
    // the fund cannot pay the minimum it owed on its opening FMV.
    const c = r.componentStatuses.find((x) => x.component === "rrif.transferRetention")!;
    expect(c.status).toBe("UNSUPPORTED");
    expect(c.substitutive).toBe(true);
    expect(c.engaged).toBe(true);
    expect(rowAt(r, 66).validity).toBe("WITHHELD");
    expect(rowAt(r, 66).validityReasons.map((x) => x.code)).toContain(
      "RRIF_TRANSFER_RETENTION_NOT_ENFORCED",
    );
    // Withheld status propagates forward.
    expect(rowAt(r, 67).validity).toBe("WITHHELD");
  });

  it("R2-5: an ordinary plan does not engage the transfer-retention component", () => {
    const r = projection(
      probePlan({
        curAge: 72,
        endAge: 75,
        ret: 0.05,
        accounts: [acct({ id: "rrif", type: "RRIF", bal: 300000, acb: 300000 })],
      }),
    );
    expect(
      r.componentStatuses.find((x) => x.component === "rrif.transferRetention")!.engaged,
    ).toBe(false);
  });

  it("R2-6: a zero-growth, zero-contribution year reproduces pre-R-2 behaviour exactly", () => {
    // The guard against the snapshot being 'simplified' into a reordering of
    // steps 4/5/6a: with nothing happening between the top of the year and the
    // minimum, the opening balance IS the step-6a balance, so the answer must
    // be identical to what the pre-R-2 engine produced.
    const r = projection(
      probePlan({
        curAge: 72,
        endAge: 74,
        ret: 0,
        accounts: [acct({ id: "rrif", type: "RRIF", bal: 300000, acb: 300000 })],
      }),
    );
    expect(rowAt(r, 72).regWithdraw).toBeCloseTo(300000 * minF(72), 6);
    const after = 300000 - rowAt(r, 72).regWithdraw;
    expect(rowAt(r, 73).regWithdraw).toBeCloseTo(after * minF(73), 4);
  });

  it("R2-7: a contribution made in-year does not raise that year's minimum", () => {
    // The contribution is funded from the TFSA (contributions are a use of
    // household cash), so the only registered withdrawal is the minimum.
    const r = projection({
      ...probePlan({
        curAge: 72,
        endAge: 73,
        ret: 0,
        accounts: [
          acct({
            id: "rrif",
            type: "RRIF",
            bal: 300000,
            acb: 300000,
            contrib: 50000,
            contribEnd: 90,
          }),
          acct({ id: "tfsa", type: "TFSA", bal: 200000, acb: 200000 }),
        ],
      }),
      strategy: "tfsa_nonreg_reg",
    });
    expect(rowAt(r, 72).regWithdraw).toBeCloseTo(300000 * minF(72), 4);
    expect(rowAt(r, 72).regWithdraw).toBeLessThan(350000 * minF(72) - 1);
  });

  it("R2-8: growth and a contribution together still leave the opening balance as the base", () => {
    const r = projection({
      ...probePlan({
        curAge: 72,
        endAge: 73,
        ret: 0.1,
        accounts: [
          acct({
            id: "rrif",
            type: "RRIF",
            bal: 300000,
            acb: 300000,
            contrib: 50000,
            contribEnd: 90,
          }),
          acct({ id: "tfsa", type: "TFSA", bal: 200000, acb: 200000 }),
        ],
      }),
      strategy: "tfsa_nonreg_reg",
    });
    expect(rowAt(r, 72).regWithdraw).toBeCloseTo(300000 * minF(72), 4);
    expect(rowAt(r, 72).regWithdraw).toBeLessThan(380000 * minF(72) - 1);
  });

  it("R2-9: a fund receiving a spousal rollover computes its minimum on the PRE-rollover opening balance", () => {
    // Pins the snapshot ahead of step 1. B dies at 75; B's RRIF rolls into A's.
    const base = regressionFixturePlan();
    const plan: PlanInputs = {
      ...base,
      planType: "married",
      inflation: 0,
      indexationRate: 0,
      eqRet: 0,
      fiRet: 0,
      spendNeed: 0,
      currentSpend: 0,
      strategy: "nonreg_reg_tfsa",
      endAge: 77,
      people: [
        {
          ...base.people[0]!,
          id: "A",
          curAge: 75,
          retAge: 75,
          employ: 0,
          deathAge: 0,
          cpp: { amt: 0, age: 65 },
          oas: { amt: 0, age: 65 },
          pen: { amt: 0, age: 65 },
          bridge: { amt: 0, end: 65 },
        },
        {
          ...base.people[0]!,
          id: "B",
          firstName: "B",
          curAge: 75,
          retAge: 75,
          employ: 0,
          deathAge: 75,
          cpp: { amt: 0, age: 65 },
          oas: { amt: 0, age: 65 },
          pen: { amt: 0, age: 65 },
          bridge: { amt: 0, end: 65 },
        },
      ],
      accounts: [
        acct({ id: "rrifA", type: "RRIF", bal: 300000, acb: 300000, owner: "A" }),
        acct({ id: "rrifB", type: "RRIF", bal: 200000, acb: 200000, owner: "B" }),
      ],
      expenses: [],
      otherIncome: [],
      lumpSums: [],
      hardAssets: [],
      liabilities: [],
    };
    const r = projection(plan);
    const control = projection({
      ...plan,
      accounts: [acct({ id: "rrifA", type: "RRIF", bal: 300000, acb: 300000, owner: "A" })],
    });
    // A's receiving fund pays a minimum struck on its OWN opening 300,000; the
    // 200,000 that arrives by rollover during the year does not enter its base,
    // so its closing balance is identical to the no-rollover control.
    expect(rowAt(r, 75).balances["rrifA"]!).toBeCloseTo(300000 * (1 - minF(75)), 3);
    expect(rowAt(r, 75).balances["rrifA"]!).toBeCloseTo(
      rowAt(control, 75).balances["rrifA"]!,
      6,
    );
  });

  it("R2-10: a fund in its establishment year that transfers out does not engage transfer retention", () => {
    const r = projection(
      probePlan({
        curAge: 54,
        endAge: 60,
        retAge: 55,
        accounts: [
          acct({ id: "lira", type: "LIRA", bal: 400000, juris: "MB", conv: 55, unlock: 100 }),
        ],
      }),
    );
    // At 55 the fund is established (minimum nil) and moves everything it can
    // to the PRRIF. A nil minimum cannot be left unpaid.
    expect(rowAt(r, 55).regWithdraw).toBe(0);
    expect(
      r.componentStatuses.find((x) => x.component === "rrif.transferRetention")!.engaged,
    ).toBe(false);
    expect(rowAt(r, 55).validity).not.toBe("WITHHELD");
  });

  it("R2-11: step 2's accepted unlock source types are exactly LIRA, DCPP and LIF", () => {
    // Structural guard. Widening this list must fail here rather than silently
    // bypassing the `wasLifBeforeTransfer` provenance check: only a LIF is a
    // RRIF arrangement bound by s.146.3(2)(e.1).
    expect([...UNLOCK_SOURCE_TYPES]).toEqual(["LIRA", "DCPP", "LIF"]);
  });

  it("R2-12: a LIRA past its conversion age that transfers out is NOT a transferring RRIF", () => {
    // s.146.3(2)(e.1) binds RRIFs. A LIRA is an RRSP-type arrangement, so
    // moving its whole balance out is not an infeasible transfer, however much
    // moves and whatever its conversion age says about its RRIF-like status.
    const r = projection(
      probePlan({
        curAge: 66,
        endAge: 68,
        retAge: 66,
        accounts: [
          acct({ id: "lira", type: "LIRA", bal: 400000, juris: "MB", conv: 55, unlock: 100 }),
        ],
      }),
    );
    // Identical in shape to R2-4 except the arrangement type at intake: this
    // one is a LIRA, so Manitoba's age-65 right moves the whole balance out of
    // an RRSP-type arrangement and s.146.3(2)(e.1) has nothing to say about it.
    expect(
      r.componentStatuses.find((x) => x.component === "rrif.transferRetention")!.engaged,
    ).toBe(false);
    expect(r.rows.every((x) => x.validity !== "WITHHELD")).toBe(true);
  });
});


