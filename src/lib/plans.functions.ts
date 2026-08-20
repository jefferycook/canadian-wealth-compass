/**
 * Server functions for saved plans.
 *
 * The projection engine runs here, on the server: the client sends the answers
 * it has collected and receives numbers back. The tax rules and the engine
 * never ship to the browser.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json, TablesUpdate } from "@/integrations/supabase/types";

import { newPlanDraft } from "./planning/defaults";
import type { PlanDraft } from "./planning/draft";
import type {
  GoalProgress,
  NetWorthView,
  Recommendation,
  StrategyRow,
} from "./planning/analysis";
import type { PlanOutput } from "./planning/summary";
import type {
  ScenarioPatch,
  ScenarioRun,
  ScenarioSet,
  StrategyComparison,
} from "./planning/scenario";

import type {
  CashflowView,
  LeverSettings,
  LeverSimulation,
  PlanScore,
  SavingAdvice,
} from "./planning/levers";

export interface PlanAnalysis {
  output: PlanOutput;
  netWorth: NetWorthView;
  strategies: StrategyRow[];
  goal: GoalProgress;
  recommendations: Recommendation[];
  score: PlanScore;
  cashflow: CashflowView;
  advice: SavingAdvice;
}

export interface PlanRow {
  id: string;
  name: string;
  draft: PlanDraft;
  is_complete: boolean;
  updated_at: string;
}

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("plans")
      .select("id, name, is_complete, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("plans")
      .insert({
        user_id: context.userId,
        name: data.name?.trim() || "My plan",
        draft: newPlanDraft() as unknown as Json,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("plans")
      .select("id, name, draft, is_complete, updated_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Plan not found");
    return row as unknown as PlanRow;
  });

export const savePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { id: string; name?: string; draft: PlanDraft; isComplete?: boolean }) => input,
  )
  .handler(async ({ data, context }) => {
    const patch: TablesUpdate<"plans"> = { draft: data.draft as unknown as Json };
    if (data.name !== undefined) patch.name = data.name;
    if (data.isComplete !== undefined) patch.is_complete = data.isComplete;
    const { error } = await context.supabase.from("plans").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Run the projection for a draft and return only the numbers the UI shows. */
export const runProjection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { draft: PlanDraft }) => input)
  .handler(async ({ data }): Promise<PlanOutput> => {
    const [{ normalizeDraft }, { runPlan }, { summarize }] = await Promise.all([
      import("./planning/draft"),
      import("./planning/engine"),
      import("./planning/summary"),
    ]);
    return summarize(runPlan(normalizeDraft(data.draft)));
  });

/**
 * Everything the analysis tabs show: net worth, strategy comparison,
 * recommendations and goal progress. Computed server-side in one pass so the
 * engine and the tax rules never reach the browser.
 */
export const analyzePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { draft: PlanDraft }) => input)
  .handler(async ({ data }): Promise<PlanAnalysis> => {
    const [{ normalizeDraft }, { runPlan }, { summarize }, analysis, levers] = await Promise.all([
      import("./planning/draft"),
      import("./planning/engine"),
      import("./planning/summary"),
      import("./planning/analysis"),
      import("./planning/levers"),
    ]);
    const inputs = normalizeDraft(data.draft);
    const result = runPlan(inputs);
    const strategies = analysis.compareStrategies(inputs, result.chosenStrategy);
    const goal = analysis.goalProgress(inputs, result);
    return {
      output: summarize(result),
      netWorth: analysis.netWorthView(result),
      strategies,
      goal,
      recommendations: analysis.buildRecommendations(inputs, result, strategies, goal),
      score: levers.scorePlan(inputs),
      cashflow: levers.cashflowView(inputs, result),
      advice: levers.recommendSavingsAccount(inputs, result),
    };
  });

/**
 * Re-run the plan with the client's "what if" sliders applied, and report the
 * change each lever makes on its own as well as all of them together.
 */
export const simulatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { draft: PlanDraft; levers: LeverSettings }) => input)
  .handler(async ({ data }): Promise<LeverSimulation> => {
    const [{ normalizeDraft }, levers] = await Promise.all([
      import("./planning/draft"),
      import("./planning/levers"),
    ]);
    return levers.simulateLevers(normalizeDraft(data.draft), data.levers);
  });

/* ------------------------------------------------------------------ */
/* Scenario execution — one path for Strategies, Recommendations, What If */
/* ------------------------------------------------------------------ */

/** Run one scenario patch against a baseline draft and return the real output. */
export const runScenarioFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { draft: PlanDraft; patch: ScenarioPatch }) => input)
  .handler(async ({ data }): Promise<ScenarioRun> => {
    const { runScenario } = await import("./planning/scenario");
    return runScenario(data.draft, data.patch ?? {});
  });

/** Every supported withdrawal order, each re-simulated. */
export const compareStrategiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { draft: PlanDraft }) => input)
  .handler(async ({ data }): Promise<StrategyComparison> => {
    const { runStrategyComparison } = await import("./planning/scenario");
    return runStrategyComparison(data.draft);
  });

/** Baseline, each change isolated, and one combined run of all of them. */
export const simulateScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { draft: PlanDraft; patch: ScenarioPatch }) => input)
  .handler(async ({ data }): Promise<ScenarioSet> => {
    const { runScenarioSet } = await import("./planning/scenario");
    return runScenarioSet(data.draft, data.patch ?? {});
  });

