import { it } from "vitest";
import { runPlan } from "./engine";
import { regressionFixturePlan, accumulationGoldenFixturePlan } from "./fixtures";
const lt = (r:any)=>r.rows.reduce((s:number,x:any)=>s+x.tax,0);
it("attr", () => {
  for (const [n,p] of [["single",regressionFixturePlan()],["acc",accumulationGoldenFixturePlan()]] as any) {
    const r = runPlan({...p, indexationRate: 0});
    console.log(n, "tax", Math.round(lt(r)),
      "swept", Math.round(r.rows.reduce((s:number,x:any)=>s+x.surplusSwept,0)),
      "dist", Math.round(r.rows.reduce((s:number,x:any)=>s+x.distributionsTaxable,0)));
  }
});
