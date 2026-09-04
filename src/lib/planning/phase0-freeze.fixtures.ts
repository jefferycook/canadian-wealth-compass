/**
 * Protected Phase 0 verification inputs.
 *
 * These values were copied from the approved golden fixtures at canonical base
 * 575e31f35b1060bb07afa435a4e7834bfe3d4b08. Keep them independent from
 * fixtures.ts so ordinary fixture maintenance cannot silently move the Phase 0
 * economic freezes.
 */
import type { PlanInputs } from "./types";

// Copied from regressionFixturePlan() at canonical base
// 575e31f35b1060bb07afa435a4e7834bfe3d4b08.
const REGRESSION_JSON = String.raw`{"taxYear":2026,"planType":"single","endAge":95,"inflation":0.021,"spendNeed":60000,"eqRet":0.065,"fiRet":0.035,"survivorPct":0.6,"strategy":"auto","tax":{"provinceKey":"ON","fedBPA":16452,"provBPA":12989,"oasThresh":95323,"lifRate":6},"people":[{"id":"A","firstName":"","lastName":"","curAge":60,"retAge":65,"employ":0,"deathAge":0,"cpp":{"amt":14000,"age":65},"oas":{"amt":9024,"age":65},"pen":{"amt":0,"age":65},"bridge":{"amt":0,"end":65}}],"accounts":[{"id":"acc_rrif","name":"RRIF","type":"RRIF","owner":"A","bal":450000,"acb":450000,"eq":55,"mix":{"int":1,"div":0,"cg":0},"juris":"ON","conv":0,"unlock":0,"contrib":0,"contribEnd":0,"wd":0,"wdStart":0,"wdEnd":0},{"id":"acc_lif","name":"LIF (from LIRA)","type":"LIF","owner":"A","bal":180000,"acb":180000,"eq":55,"mix":{"int":1,"div":0,"cg":0},"juris":"ON","conv":0,"unlock":0,"contrib":0,"contribEnd":0,"wd":0,"wdStart":0,"wdEnd":0},{"id":"acc_tfsa","name":"TFSA","type":"TFSA","owner":"A","bal":120000,"acb":120000,"eq":75,"mix":{"int":0.2,"div":0.2,"cg":0.6},"juris":"ON","conv":0,"unlock":0,"contrib":0,"contribEnd":0,"wd":0,"wdStart":0,"wdEnd":0},{"id":"acc_nonreg","name":"Non-registered","type":"NONREG","owner":"A","bal":250000,"acb":180000,"eq":60,"mix":{"int":0.25,"div":0.25,"cg":0.5},"juris":"ON","conv":0,"unlock":0,"contrib":0,"contribEnd":0,"wd":0,"wdStart":0,"wdEnd":0}],"expenses":[{"id":"exp_vehicle","name":"New vehicle","age":70,"amt":45000},{"id":"exp_roof","name":"Roof / reno","age":78,"amt":35000}],"otherIncome":[],"lumpSums":[],"hardAssets":[{"id":"as_home","name":"Home","val":750000,"acb":750000,"apr":0.03,"sale":0,"taxable":false,"dsAge":0,"dsPct":30}],"liabilities":[{"id":"li_mortgage","name":"Mortgage","bal":220000,"rate":0.045,"pay":28000}]}`;

// Copied from coupleGoldenFixturePlan() at canonical base
// 575e31f35b1060bb07afa435a4e7834bfe3d4b08.
const COUPLE_JSON = String.raw`{"taxYear":2026,"planType":"married","endAge":90,"inflation":0.021,"spendNeed":80000,"eqRet":0.065,"fiRet":0.035,"survivorPct":0.6,"strategy":"auto","tax":{"provinceKey":"ON","fedBPA":16452,"provBPA":12989,"oasThresh":95323,"lifRate":6},"people":[{"id":"A","firstName":"","lastName":"","curAge":66,"retAge":66,"employ":0,"deathAge":0,"cpp":{"amt":15000,"age":65},"oas":{"amt":9024,"age":65},"pen":{"amt":24000,"age":65},"bridge":{"amt":8000,"end":70,"sourceClass":"RPP_BRIDGE"}},{"id":"B","firstName":"","lastName":"","curAge":64,"retAge":65,"employ":40000,"deathAge":0,"cpp":{"amt":6000,"age":65},"oas":{"amt":9024,"age":65},"pen":{"amt":0,"age":65},"bridge":{"amt":0,"end":65}}],"accounts":[{"id":"acc_rrif_a","name":"RRIF","type":"RRIF","owner":"A","bal":600000,"acb":600000,"eq":50,"mix":{"int":1,"div":0,"cg":0},"juris":"ON","conv":0,"unlock":0,"contrib":0,"contribEnd":0,"wd":0,"wdStart":0,"wdEnd":0},{"id":"acc_rrsp_b","name":"RRSP","type":"RRSP","owner":"B","bal":120000,"acb":120000,"eq":60,"mix":{"int":1,"div":0,"cg":0},"juris":"ON","conv":0,"unlock":0,"contrib":0,"contribEnd":0,"wd":0,"wdStart":0,"wdEnd":0},{"id":"acc_tfsa_a","name":"TFSA","type":"TFSA","owner":"A","bal":90000,"acb":90000,"eq":70,"mix":{"int":0.2,"div":0.2,"cg":0.6},"juris":"ON","conv":0,"unlock":0,"contrib":0,"contribEnd":0,"wd":0,"wdStart":0,"wdEnd":0},{"id":"acc_nonreg_j","name":"Non-registered (joint)","type":"NONREG","owner":"JOINT","bal":200000,"acb":150000,"eq":60,"mix":{"int":0.25,"div":0.25,"cg":0.5},"juris":"ON","conv":0,"unlock":0,"contrib":0,"contribEnd":0,"wd":0,"wdStart":0,"wdEnd":0}],"expenses":[],"otherIncome":[],"lumpSums":[],"hardAssets":[],"liabilities":[]}`;

// Copied from accumulationGoldenFixturePlan() at canonical base
// 575e31f35b1060bb07afa435a4e7834bfe3d4b08.
const ACCUMULATION_JSON = String.raw`{"taxYear":2026,"planType":"married","endAge":90,"inflation":0.021,"spendNeed":72000,"currentSpend":84000,"eqRet":0.065,"fiRet":0.035,"survivorPct":0.6,"strategy":"auto","tax":{"provinceKey":"ON","fedBPA":16452,"provBPA":12989,"oasThresh":95323,"lifRate":6},"people":[{"id":"A","firstName":"","lastName":"","curAge":45,"retAge":65,"employ":120000,"deathAge":0,"cpp":{"amt":15000,"age":65},"oas":{"amt":9024,"age":65},"pen":{"amt":0,"age":65},"bridge":{"amt":0,"end":65},"tfsaRoom":30000,"rrspRoom":40000,"rrspUndeductedContributions":0,"rrspDeductionLimitOpen":40000,"pensionAdjustment":9000},{"id":"B","firstName":"","lastName":"","curAge":43,"retAge":65,"employ":70000,"deathAge":0,"cpp":{"amt":11000,"age":65},"oas":{"amt":9024,"age":65},"pen":{"amt":0,"age":65},"bridge":{"amt":0,"end":65},"tfsaRoom":12000,"rrspRoom":25000,"rrspUndeductedContributions":0,"rrspDeductionLimitOpen":25000,"pensionAdjustment":null}],"accounts":[{"id":"acc_rrsp_a","name":"RRSP","type":"RRSP","owner":"A","bal":210000,"acb":210000,"eq":70,"mix":{"int":1,"div":0,"cg":0},"juris":"ON","conv":0,"unlock":0,"contrib":12000,"contribEnd":65,"wd":0,"wdStart":0,"wdEnd":0},{"id":"acc_tfsa_a","name":"TFSA","type":"TFSA","owner":"A","bal":45000,"acb":45000,"eq":80,"mix":{"int":0.2,"div":0.2,"cg":0.6},"juris":"ON","conv":0,"unlock":0,"contrib":7000,"contribEnd":65,"wd":0,"wdStart":0,"wdEnd":0},{"id":"acc_rrsp_b","name":"RRSP","type":"RRSP","owner":"B","bal":95000,"acb":95000,"eq":70,"mix":{"int":1,"div":0,"cg":0},"juris":"ON","conv":0,"unlock":0,"contrib":6000,"contribEnd":65,"wd":0,"wdStart":0,"wdEnd":0},{"id":"acc_tfsa_b","name":"TFSA","type":"TFSA","owner":"B","bal":20000,"acb":20000,"eq":80,"mix":{"int":0.2,"div":0.2,"cg":0.6},"juris":"ON","conv":0,"unlock":0,"contrib":4000,"contribEnd":65,"wd":0,"wdStart":0,"wdEnd":0},{"id":"acc_nonreg_j","name":"Non-registered (joint)","type":"NONREG","owner":"JOINT","bal":60000,"acb":55000,"eq":60,"mix":{"int":0.25,"div":0.25,"cg":0.5},"juris":"ON","conv":0,"unlock":0,"contrib":0,"contribEnd":0,"wd":0,"wdStart":0,"wdEnd":0}],"expenses":[],"otherIncome":[],"lumpSums":[],"hardAssets":[],"liabilities":[]}`;

// Copied from lockedInGoldenFixturePlan() at canonical base
// 575e31f35b1060bb07afa435a4e7834bfe3d4b08.
const LOCKED_JSON = String.raw`{"taxYear":2026,"planType":"single","endAge":90,"inflation":0.021,"spendNeed":36000,"eqRet":0.065,"fiRet":0.035,"survivorPct":0.6,"strategy":"auto","tax":{"provinceKey":"ON","fedBPA":16452,"provBPA":12989,"oasThresh":95323,"lifRate":6},"people":[{"id":"A","firstName":"","lastName":"","curAge":54,"retAge":55,"employ":0,"deathAge":0,"cpp":{"amt":14000,"age":65},"oas":{"amt":9024,"age":65},"pen":{"amt":0,"age":65},"bridge":{"amt":0,"end":65}}],"accounts":[{"id":"acc_lira","name":"LIRA (Manitoba)","type":"LIRA","owner":"A","bal":400000,"acb":0,"eq":50,"mix":{"int":1,"div":0,"cg":0},"juris":"MB","conv":55,"unlock":100,"contrib":0,"contribEnd":0,"wd":0,"wdStart":0,"wdEnd":0},{"id":"acc_tfsa","name":"TFSA","type":"TFSA","owner":"A","bal":60000,"acb":60000,"eq":75,"mix":{"int":0.2,"div":0.2,"cg":0.6},"juris":"ON","conv":0,"unlock":0,"contrib":0,"contribEnd":0,"wd":0,"wdStart":0,"wdEnd":0},{"id":"acc_nonreg","name":"Non-registered","type":"NONREG","owner":"A","bal":150000,"acb":120000,"eq":60,"mix":{"int":0.25,"div":0.25,"cg":0.5},"juris":"ON","conv":0,"unlock":0,"contrib":0,"contribEnd":0,"wd":0,"wdStart":0,"wdEnd":0}],"expenses":[],"otherIncome":[],"lumpSums":[],"hardAssets":[],"liabilities":[]}`;

// Copied from survivorGoldenFixturePlan() at canonical base
// 575e31f35b1060bb07afa435a4e7834bfe3d4b08.
const SURVIVOR_JSON = String.raw`{"taxYear":2026,"planType":"married","endAge":95,"inflation":0.021,"indexationRate":null,"spendNeed":72000,"currentSpend":null,"eqRet":0.065,"fiRet":0.035,"survivorPct":0.6,"strategy":"nonreg_reg_tfsa","tax":{"provinceKey":"ON","fedBPA":16452,"provBPA":12989,"oasThresh":95323,"lifRate":6},"people":[{"id":"A","firstName":"Survivor","lastName":"GoldenA","curAge":70,"retAge":999,"employ":0,"deathAge":78,"cpp":{"amt":16000,"age":70},"oas":{"amt":8900,"age":65},"pen":{"amt":30000,"age":65},"bridge":{"amt":0,"end":65}},{"id":"B","firstName":"Survivor","lastName":"GoldenB","curAge":68,"retAge":999,"employ":0,"deathAge":0,"cpp":{"amt":11000,"age":65},"oas":{"amt":8900,"age":65},"pen":{"amt":0,"age":65},"bridge":{"amt":0,"end":65}}],"accounts":[{"id":"surv-nonreg","name":"B non-registered","type":"NONREG","owner":"B","bal":400000,"acb":400000,"eq":40,"mix":{"int":0.3,"div":0.3,"cg":0.4},"juris":"ON","conv":0,"unlock":0,"contrib":0,"contribEnd":0,"wd":0,"wdStart":0,"wdEnd":0}],"expenses":[],"otherIncome":[],"lumpSums":[],"hardAssets":[],"liabilities":[]}`;

function copiedPlan(json: string): PlanInputs {
  return JSON.parse(json) as PlanInputs;
}

export const frozenRegressionPlan = () => copiedPlan(REGRESSION_JSON);
export const frozenCouplePlan = () => copiedPlan(COUPLE_JSON);
export const frozenAccumulationPlan = () => copiedPlan(ACCUMULATION_JSON);
export const frozenLockedInPlan = () => copiedPlan(LOCKED_JSON);
export const frozenSurvivorPlan = () => copiedPlan(SURVIVOR_JSON);

/** Copied from retentionLossPlan() at canonical base 575e31f35b1060bb07afa435a4e7834bfe3d4b08. */
export function frozenRetentionLossPlan(): PlanInputs {
  const plan = frozenRegressionPlan();
  return {
    ...plan,
    inflation: 0,
    indexationRate: 0,
    eqRet: -0.5,
    fiRet: -0.5,
    spendNeed: 0,
    currentSpend: 0,
    strategy: "nonreg_reg_tfsa",
    endAge: 68,
    people: [
      {
        ...plan.people[0]!,
        curAge: 66,
        retAge: 66,
        cpp: { amt: 0, age: 65 },
        oas: { amt: 0, age: 65 },
      },
    ],
    accounts: [
      {
        id: "lif",
        name: "MB LIF",
        type: "LIF",
        owner: "A",
        bal: 400000,
        acb: 0,
        eq: 0,
        mix: { int: 1, div: 0, cg: 0 },
        juris: "MB",
        conv: 55,
        unlock: 100,
        contrib: 0,
        contribEnd: 0,
        wd: 0,
        wdStart: 0,
        wdEnd: 0,
      },
    ],
    expenses: [],
    hardAssets: [],
    liabilities: [],
  };
}

/** Copied from goalSolverDivergencePlan() at canonical base 575e31f35b1060bb07afa435a4e7834bfe3d4b08. */
export function frozenGoalDivergencePlan(): PlanInputs {
  const plan = frozenRegressionPlan();
  const account = plan.accounts[0]!;
  return {
    ...plan,
    endAge: 60,
    spendNeed: 25000,
    currentSpend: 25000,
    people: [
      {
        ...plan.people[0]!,
        retAge: 60,
        cpp: { amt: 0, age: 65 },
        oas: { amt: 0, age: 65 },
      },
    ],
    accounts: [
      {
        ...account,
        id: "tfsa",
        name: "TFSA",
        type: "TFSA",
        bal: 10000,
        acb: 10000,
      },
      {
        ...account,
        id: "rrsp",
        name: "RRSP",
        type: "RRSP",
        bal: 10000,
        acb: 0,
      },
    ],
    expenses: [],
    hardAssets: [],
    liabilities: [],
  };
}
