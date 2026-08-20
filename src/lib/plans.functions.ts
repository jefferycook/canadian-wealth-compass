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
  ScenarioMetrics,
  ScenarioPatch,
  ScenarioRun,
  ScenarioSet,
  StrategyComparison,
} from "./planning/scenario";
import type { Opportunity } from "./planning/opportunities";

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


/** The changes a client can test. Proposals only — impacts come from re-runs. */
export const planOpportunities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { draft: PlanDraft }) => input)
  .handler(async ({ data }): Promise<Opportunity[]> => {
    const { buildOpportunities } = await import("./planning/opportunities");
    return buildOpportunities(data.draft);
  });


/* ------------------------------------------------------------------ */
/* Saved scenarios (UX Batch 2)                                        */
/* ------------------------------------------------------------------ */

export interface SavedScenario {
  id: string;
  name: string;
  schemaVersion: number;
  /** Null when the stored patch could not be read safely. */
  patch: ScenarioPatch | null;
  /** Why the scenario could not be read, when patch is null. */
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioComparison {
  baseline: ScenarioMetrics;
  scenarios: { id: string; name: string; metrics: ScenarioMetrics }[];
  /** Scenarios that could not be read back safely. */
  skipped: { id: string; name: string; error: string }[];
}

type ScenarioRowShape = {
  id: string;
  name: string;
  overrides: unknown;
  schema_version: number;
  created_at: string;
  updated_at: string;
};

async function toSaved(row: ScenarioRowShape): Promise<SavedScenario> {
  const { parseStoredScenario } = await import("./planning/scenario-persist");
  const parsed = parseStoredScenario(row.overrides, row.schema_version);
  return {
    id: row.id,
    name: row.name,
    schemaVersion: row.schema_version,
    patch: parsed.ok ? parsed.patch : null,
    error: parsed.ok ? null : parsed.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SCENARIO_COLUMNS = "id, name, overrides, schema_version, created_at, updated_at";

export const listScenarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string }) => input)
  .handler(async ({ data, context }): Promise<SavedScenario[]> => {
    const { data: rows, error } = await context.supabase
      .from("plan_scenarios")
      .select(SCENARIO_COLUMNS)
      .eq("plan_id", data.planId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return Promise.all(((rows ?? []) as ScenarioRowShape[]).map(toSaved));
  });

export const createScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; name: string; patch: ScenarioPatch }) => input)
  .handler(async ({ data, context }): Promise<SavedScenario> => {
    const { serializeScenarioPatch, SCENARIO_SCHEMA_VERSION } = await import(
      "./planning/scenario-persist"
    );
    const { data: row, error } = await context.supabase
      .from("plan_scenarios")
      .insert({
        plan_id: data.planId,
        user_id: context.userId,
        name: data.name.trim() || "Untitled scenario",
        overrides: serializeScenarioPatch(data.patch ?? {}) as unknown as Json,
        schema_version: SCENARIO_SCHEMA_VERSION,
      })
      .select(SCENARIO_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return toSaved(row as ScenarioRowShape);
  });

/** Rename and/or overwrite a scenario's patch. The plan itself is untouched. */
export const updateScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name?: string; patch?: ScenarioPatch }) => input)
  .handler(async ({ data, context }): Promise<SavedScenario> => {
    const { serializeScenarioPatch, SCENARIO_SCHEMA_VERSION } = await import(
      "./planning/scenario-persist"
    );
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch['name'] = data.name.trim() || "Untitled scenario";
    if (data.patch !== undefined) {
      patch['overrides'] = serializeScenarioPatch(data.patch);
      patch['schema_version'] = SCENARIO_SCHEMA_VERSION;
    }
    const { data: row, error } = await context.supabase
      .from("plan_scenarios")
      .update(patch as TablesUpdate<"plan_scenarios">)
      .eq("id", data.id)
      .select(SCENARIO_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return toSaved(row as ScenarioRowShape);
  });

export const deleteScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("plan_scenarios").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const duplicateScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name?: string }) => input)
  .handler(async ({ data, context }): Promise<SavedScenario> => {
    const { data: src, error } = await context.supabase
      .from("plan_scenarios")
      .select("plan_id, name, overrides, schema_version")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!src) throw new Error("Scenario not found");
    const { data: row, error: insErr } = await context.supabase
      .from("plan_scenarios")
      .insert({
        plan_id: src.plan_id,
        user_id: context.userId,
        name: data.name?.trim() || `${src.name} (copy)`,
        overrides: src.overrides,
        schema_version: (src as { schema_version: number }).schema_version,
      })
      .select(SCENARIO_COLUMNS)
      .single();
    if (insErr) throw new Error(insErr.message);
    return toSaved(row as ScenarioRowShape);
  });

/**
 * Compare saved scenarios against the baseline. Every number here comes from a
 * fresh engine run of `baseline draft + stored patch`; no result is stored.
 */
export const compareScenarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; scenarioIds: string[] }) => input)
  .handler(async ({ data, context }): Promise<ScenarioComparison> => {
    const { data: plan, error: planErr } = await context.supabase
      .from("plans")
      .select("draft")
      .eq("id", data.planId)
      .maybeSingle();
    if (planErr) throw new Error(planErr.message);
    if (!plan) throw new Error("Plan not found");

    const { data: rows, error } = await context.supabase
      .from("plan_scenarios")
      .select(SCENARIO_COLUMNS)
      .eq("plan_id", data.planId)
      .in("id", data.scenarioIds.length ? data.scenarioIds : ["00000000-0000-0000-0000-000000000000"]);
    if (error) throw new Error(error.message);

    const { runScenario } = await import("./planning/scenario");
    const draft = plan.draft as unknown as PlanDraft;
    const saved = await Promise.all(((rows ?? []) as ScenarioRowShape[]).map(toSaved));

    const scenarios: ScenarioComparison["scenarios"] = [];
    const skipped: ScenarioComparison["skipped"] = [];
    for (const s of saved) {
      if (!s.patch) {
        skipped.push({ id: s.id, name: s.name, error: s.error ?? "Unreadable scenario" });
        continue;
      }
      scenarios.push({ id: s.id, name: s.name, metrics: runScenario(draft, s.patch).metrics });
    }
    return { baseline: runScenario(draft, {}).metrics, scenarios, skipped };
  });

/**
 * The one and only way a saved scenario changes the baseline plan. The client
 * asks for it explicitly and confirms it; nothing else writes the draft.
 */
export const promoteScenarioToBaseline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; scenarioId: string; confirm: true }) => input)
  .handler(async ({ data, context }) => {
    if (data.confirm !== true) throw new Error("This change must be confirmed.");
    const [{ patchToDraft }, { parseStoredScenario }] = await Promise.all([
      import("./planning/scenario"),
      import("./planning/scenario-persist"),
    ]);

    const { data: plan, error: planErr } = await context.supabase
      .from("plans")
      .select("draft")
      .eq("id", data.planId)
      .maybeSingle();
    if (planErr) throw new Error(planErr.message);
    if (!plan) throw new Error("Plan not found");

    const { data: row, error } = await context.supabase
      .from("plan_scenarios")
      .select(SCENARIO_COLUMNS)
      .eq("id", data.scenarioId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Scenario not found");

    const parsed = parseStoredScenario(
      (row as ScenarioRowShape).overrides,
      (row as ScenarioRowShape).schema_version,
    );
    if (!parsed.ok) throw new Error(parsed.reason);

    const promoted = patchToDraft(plan.draft as unknown as PlanDraft, parsed.patch);
    const { error: upErr } = await context.supabase
      .from("plans")
      .update({ draft: promoted.draft as unknown as Json })
      .eq("id", data.planId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true as const, unsupported: promoted.unsupported };
  });
