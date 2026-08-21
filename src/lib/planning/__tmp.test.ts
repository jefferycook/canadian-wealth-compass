import { describe, it } from "vitest";
import { regressionFixturePlan } from "./fixtures";
import { projection } from "./projection";
describe("tmp", () => { it("x", () => {
  const i = regressionFixturePlan();
  const o = { spendAdj: -40000 } as any;
  const b = projection(i, o);
  const s = projection(i, { ...o, goalSaves: [{ amt: 12000, type: "TFSA", owner: "A" }] } as any);
  const sy = (P:any)=>P.rows.filter((r:any)=>r.fundingShortfall).length;
  const swept=(P:any)=>Math.round(P.rows.reduce((a:number,r:any)=>a+(r.surplusSwept||0),0));
  const last=(P:any)=>P.rows[P.rows.length-1];
  for (const [n,P] of [["base",b],["saver",s]] as any) console.log(n, sy(P), swept(P), Math.round(last(P).totalPortfolio), Math.round(last(P).balances["acc_tfsa"]??0));
});});
