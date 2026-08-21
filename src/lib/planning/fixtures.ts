/**
 * TEST FIXTURE ONLY — never shown to a client and never used to seed a new plan.
 *
 * Mirrors the seed data of the original tool exactly.
 *
 * This doubles as the regression fixture: the engine test runs this plan and
 * asserts on its lifetime tax, so an accidental change to any tax constant or
 * projection rule shows up as a failing test rather than a silently wrong
 * client number.
 */

import type { PlanInputs } from "./types";

/** Person A is born 1966-01-01; pinned so results don't drift with the clock. */
export const DEFAULT_BASE_YEAR = 2026;

export function regressionFixturePlan(): PlanInputs {
  return {
    taxYear: 2026,
    planType: "single",
    endAge: 95,
    inflation: 0.021,
    spendNeed: 60000,
    eqRet: 0.065,
    fiRet: 0.035,
    survivorPct: 0.6,
    strategy: "auto",
    tax: {
      provinceKey: "ON",
      fedBPA: 16452,
      provBPA: 12989,
      oasThresh: 95323,
      lifRate: 6.0,
    },
    people: [
      {
        id: "A",
        firstName: "",
        lastName: "",
        dob: "1966-01-01",
        curAge: 60,
        retAge: 65,
        employ: 0,
        deathAge: 0,
        cpp: { amt: 14000, age: 65 },
        oas: { amt: 9024, age: 65 },
        pen: { amt: 0, age: 65 },
        bridge: { amt: 0, end: 65 },
      },
    ],
    accounts: [
      {
        id: "acc_rrif",
        name: "RRIF",
        type: "RRIF",
        owner: "A",
        bal: 450000,
        acb: 450000,
        eq: 55,
        mix: { int: 1, div: 0, cg: 0 },
        juris: "ON",
        conv: 0,
        unlock: 0,
        contrib: 0,
        contribEnd: 0,
        wd: 0,
        wdStart: 0,
        wdEnd: 0,
      },
      {
        id: "acc_lif",
        name: "LIF (from LIRA)",
        type: "LIF",
        owner: "A",
        bal: 180000,
        acb: 180000,
        eq: 55,
        mix: { int: 1, div: 0, cg: 0 },
        juris: "ON",
        conv: 0,
        unlock: 0,
        contrib: 0,
        contribEnd: 0,
        wd: 0,
        wdStart: 0,
        wdEnd: 0,
      },
      {
        id: "acc_tfsa",
        name: "TFSA",
        type: "TFSA",
        owner: "A",
        bal: 120000,
        acb: 120000,
        eq: 75,
        mix: { int: 0.2, div: 0.2, cg: 0.6 },
        juris: "ON",
        conv: 0,
        unlock: 0,
        contrib: 0,
        contribEnd: 0,
        wd: 0,
        wdStart: 0,
        wdEnd: 0,
      },
      {
        id: "acc_nonreg",
        name: "Non-registered",
        type: "NONREG",
        owner: "A",
        bal: 250000,
        acb: 180000,
        eq: 60,
        mix: { int: 0.25, div: 0.25, cg: 0.5 },
        juris: "ON",
        conv: 0,
        unlock: 0,
        contrib: 0,
        contribEnd: 0,
        wd: 0,
        wdStart: 0,
        wdEnd: 0,
      },
    ],
    expenses: [
      { id: "exp_vehicle", name: "New vehicle", age: 70, amt: 45000 },
      { id: "exp_roof", name: "Roof / reno", age: 78, amt: 35000 },
    ],
    otherIncome: [],
    lumpSums: [],
    hardAssets: [
      {
        id: "as_home",
        name: "Home",
        val: 750000,
        acb: 750000,
        apr: 0.03,
        sale: 0,
        taxable: false,
        dsAge: 0,
        dsPct: 30,
      },
    ],
    liabilities: [
      { id: "li_mortgage", name: "Mortgage", bal: 220000, rate: 0.045, pay: 28000 },
    ],
  };
}

/**
 * COUPLE GOLDEN FIXTURE — Batch 0A regression anchor.
 *
 * Deliberately lopsided so that pension splitting matters: Person A holds all
 * of the registered money and the only DB pension, Person B has a small CPP
 * and nothing else. A is 66 (so RRIF cash is pension eligible) and B is 64.
 * That combination exercises, in one plan:
 *   - RRIF cash becoming pension eligible at 65+,
 *   - plain-RRSP cash staying non-eligible at every age,
 *   - the 0-50% pension-splitting search actually pushing income to B,
 *   - a bridge benefit that is taxable cash but NOT pension eligible.
 * Any change to eligibility classification or the split search moves this
 * number, which is exactly what makes it a useful anchor.
 */
export function coupleGoldenFixturePlan(): PlanInputs {
  return {
    taxYear: 2026,
    planType: "married",
    endAge: 90,
    inflation: 0.021,
    spendNeed: 80000,
    eqRet: 0.065,
    fiRet: 0.035,
    survivorPct: 0.6,
    strategy: "auto",
    tax: {
      provinceKey: "ON",
      fedBPA: 16452,
      provBPA: 12989,
      oasThresh: 95323,
      lifRate: 6.0,
    },
    people: [
      {
        id: "A",
        firstName: "",
        lastName: "",
        curAge: 66,
        retAge: 66,
        employ: 0,
        deathAge: 0,
        cpp: { amt: 15000, age: 65 },
        oas: { amt: 9024, age: 65 },
        pen: { amt: 24000, age: 65 },
        // Temporary bridge: taxable cash, not pension-income eligible.
        bridge: { amt: 8000, end: 70, sourceClass: "RPP_BRIDGE" },
      },
      {
        id: "B",
        firstName: "",
        lastName: "",
        curAge: 64,
        retAge: 65,
        employ: 40000,
        deathAge: 0,
        cpp: { amt: 6000, age: 65 },
        oas: { amt: 9024, age: 65 },
        pen: { amt: 0, age: 65 },
        bridge: { amt: 0, end: 65 },
      },
    ],
    accounts: [
      {
        id: "acc_rrif_a",
        name: "RRIF",
        type: "RRIF",
        owner: "A",
        bal: 600000,
        acb: 600000,
        eq: 50,
        mix: { int: 1, div: 0, cg: 0 },
        juris: "ON",
        conv: 0,
        unlock: 0,
        contrib: 0,
        contribEnd: 0,
        wd: 0,
        wdStart: 0,
        wdEnd: 0,
      },
      {
        id: "acc_rrsp_b",
        name: "RRSP",
        type: "RRSP",
        owner: "B",
        bal: 120000,
        acb: 120000,
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
      },
      {
        id: "acc_tfsa_a",
        name: "TFSA",
        type: "TFSA",
        owner: "A",
        bal: 90000,
        acb: 90000,
        eq: 70,
        mix: { int: 0.2, div: 0.2, cg: 0.6 },
        juris: "ON",
        conv: 0,
        unlock: 0,
        contrib: 0,
        contribEnd: 0,
        wd: 0,
        wdStart: 0,
        wdEnd: 0,
      },
      {
        id: "acc_nonreg_j",
        name: "Non-registered (joint)",
        type: "NONREG",
        owner: "JOINT",
        bal: 200000,
        acb: 150000,
        eq: 60,
        mix: { int: 0.25, div: 0.25, cg: 0.5 },
        juris: "ON",
        conv: 0,
        unlock: 0,
        contrib: 0,
        contribEnd: 0,
        wd: 0,
        wdStart: 0,
        wdEnd: 0,
      },
    ],
    expenses: [],
    otherIncome: [],
    lumpSums: [],
    hardAssets: [],
    liabilities: [],
  };
}
