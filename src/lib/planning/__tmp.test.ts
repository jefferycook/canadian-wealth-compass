import { describe, it } from "vitest";
import { regressionFixturePlan } from "./fixtures";
import { projection } from "./projection";
describe("t", () => { it("x", () => {
  const base = regressionFixturePlan();
  const p:any = { ...base, planType:"single", endAge:51, currentSpend:60000, spendNeed:60000, indexationRate:0, inflation:0, eqRet:0, fiRet:0,
    people:[{...base.people[0], curAge:50, retAge:65, employInc:150000, cpp:{amt:0,age:65}, oas:{amt:0,age:65}}],
    accounts:[{id:"acc_tfsa",name:"t",type:"TFSA",owner:"A",bal:0,acb:0,eq:100,mix:{int:1,div:0,cg:0},yields:{interest:0,eligDiv:0,cgDist:0,roc:0},juris:"ON",conv:0,unlock:0,contrib:15000,contribEnd:99,wd:0,wdStart:0,wdEnd:0}],
    expenses:[],hardAssets:[],liabilities:[],goalSaves:[]};
  const r = projection(p);
  const row:any = r.rows[0];
  console.log("ROWS", r.rows.length, "contrib", row.contribTotal, "swept", row.surplusSwept, "spendT", row.spendTarget, "tax", Math.round(row.tax), "bal", row.balances);
  console.log("PERSON", JSON.stringify(base.people[0]).slice(0,300));
});});
