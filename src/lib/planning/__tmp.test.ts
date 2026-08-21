import { describe, it } from "vitest";
import { regressionFixturePlan } from "./fixtures";
import { projection } from "./projection";
describe("tmp", () => { it("x", () => {
  const i = regressionFixturePlan();
  const b = projection(i, {});
  const s = projection(i, { goalSaves: [{ amt: 12000, type: "TFSA", owner: "A" }] } as any);
  const sy = (P:any)=>P.rows.filter((r:any)=>r.fundingShortfall).length;
  const est = (P:any)=>P.rows[P.rows.length-1].afterTaxEstate ?? P.rows[P.rows.length-1].totalPortfolio;
  const fs = (P:any)=>P.rows.find((r:any)=>r.fundingShortfall)?.age;
  console.log("base", sy(b), fs(b), Math.round(est(b)));
  console.log("saver", sy(s), fs(s), Math.round(est(s)));
  console.log("swept base", Math.round(b.rows.reduce((a:number,r:any)=>a+(r.surplusSwept||0),0)));
  console.log("swept saver", Math.round(s.rows.reduce((a:number,r:any)=>a+(r.surplusSwept||0),0)));
});});
