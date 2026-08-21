import { it } from "vitest";
import { runPlan } from "./engine";
import { regressionFixturePlan, accumulationGoldenFixturePlan } from "./fixtures";
const lt = (r:any)=>r.rows.reduce((s:number,x:any)=>s+x.tax,0);
it("attr", () => {
  const a = regressionFixturePlan();
  console.log("single idx0", Math.round(lt(runPlan({...a, indexationRate: 0}))));
  console.log("single idx", Math.round(lt(runPlan(a))));
  const b = accumulationGoldenFixturePlan();
  console.log("acc idx0", Math.round(lt(runPlan({...b, indexationRate: 0}))));
  console.log("acc idx", Math.round(lt(runPlan(b))));
});
