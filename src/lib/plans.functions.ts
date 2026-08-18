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

export interface PlanAnalysis {
  output: PlanOutput;
  netWorth: NetWorthView;
  strategies: StrategyRow[];
  goal: GoalProgress;
  recommendations: Recommendation[];
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
    const [{ normalizeDraft }, { runPlan }, { summarize }, analysis] = await Promise.all([
      import("./planning/draft"),
      import("./planning/engine"),
      import("./planning/summary"),
      import("./planning/analysis"),
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
    };
  });
