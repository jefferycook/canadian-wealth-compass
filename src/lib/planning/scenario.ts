/**
 * Scenario execution — the single path every "what if" number comes from.
 *
 * A ScenarioPatch is a serializable description of the changes a client is
 * testing. It is applied to the baseline draft, normalized, and run through
 * the real engine. Strategies, Recommendations and What If all call in here;
 * nothing computes a financial impact anywhere else.
 *
 * No statutory number and no methodology lives in this file. It only re-runs
 * `runPlan` with different answers and reports what came back.
 */

import { runPlan } from "./engine";
import { summarize, strategyLabel, type PlanOutput } from "./summary";
import { FIXED_STRATEGIES } from "./strategy";
import { normalizeDraft } from "./draft";
import { sustainableSpendFor } from "./levers";
import type { PlanDraft } from "./draft";
import type {
  PersonKey,
  PlanInputs,
  ProjectionOverride,
  WithdrawalStrategy,
} from "./types";
import { annualFromMonthly } from "./units";


/* ------------------------------------------------------------------ */
/* The patch                                                           */
/* ------------------------------------------------------------------ */

export interface OneTimeExpensePatch {
  /** Person A's age when the cost lands. */
  age: number;
  /** Amount in today's dollars. */
  amt: number;
  name?: string;
}

export interface PropertySalePatch {
  /** Index into the baseline draft's hard assets. */
  index: number;
  /** Person A's age at sale. */
  saleAge: number;
}

/** Per-person timing, keyed by the person's slot in the plan. */
export type ByPerson = Partial<Record<PersonKey, number>>;

/**
 * The only extra-saving destination the scenario layer currently supports.
 *
 * TFSA and RRSP extra saving is deliberately NOT offered: contribution-room
 * enforcement is still a pending engine item, so a registered "save more"
 * result would be knowingly wrong. Non-registered saving has no room limit,
 * so it is the one destination whose tax treatment is valid today.
 */
export type SavingAccountType = "NONREG";

/**
 * Every supported scenario change, in one serializable object.
 * `null`/absent means "leave the baseline answer alone".
 */
export interface ScenarioPatch {
  retireDeferYears?: number;
  /** Per-person retirement age, absolute. Overrides retireDeferYears for that person. */
  retireAgeByPerson?: ByPerson | null;
  /** Per-person CPP start age. */
  cppAgeByPerson?: ByPerson | null;
  /** Per-person OAS start age. */
  oasAgeByPerson?: ByPerson | null;
  /** Absolute retirement spending, MONTHLY (UI unit). */
  retSpendMonthly?: number | null;
  /** Absolute pre-retirement spending, MONTHLY (UI unit). */
  currentSpendMonthly?: number | null;
  /** Extra saving per month, into an existing non-registered account only. */
  extraMonthlySaving?: number;
  savingAccount?: SavingAccountType;
  /** Whose non-registered account receives the extra saving. */
  savingOwner?: PersonKey;
  strategy?: WithdrawalStrategy | null;
  /** Absolute expected equity return, as a fraction. */
  eqRet?: number | null;
  /** Absolute expected fixed-income return, as a fraction. */
  fiRet?: number | null;
  /**
   * Percentage-POINT adjustment applied to every account's return
   * (+1 means +1.00 pp). Converted to the engine's decimal fraction at the
   * scenario boundary. The engine models one net return, so this is an
   * investment-return adjustment — it is not a fee calculation.
   */
  returnAdjustment?: number;
  inflation?: number | null;
  oneTimeExpense?: OneTimeExpensePatch | null;
  propertySale?: PropertySalePatch | null;
}

export const EMPTY_PATCH: ScenarioPatch = {};

export type ScenarioPatchKey = keyof ScenarioPatch;

/** Changes that count as "active" for isolation and for Δ labelling. */
export const PATCH_LEVERS = [
  "retireDeferYears",
  "retireAgeByPerson",
  "cppAgeByPerson",
  "oasAgeByPerson",
  "retSpendMonthly",
  "currentSpendMonthly",
  "extraMonthlySaving",
  "strategy",
  "eqRet",
  "fiRet",
  "returnAdjustment",
  "inflation",
  "oneTimeExpense",
  "propertySale",
] as const satisfies readonly ScenarioPatchKey[];

export type PatchLeverKey = (typeof PATCH_LEVERS)[number];

export const PATCH_LEVER_LABELS: Record<PatchLeverKey, string> = {
  retireDeferYears: "Retire later",
  retireAgeByPerson: "Retirement age",
  cppAgeByPerson: "CPP start age",
  oasAgeByPerson: "OAS start age",
  retSpendMonthly: "Retirement spending",
  currentSpendMonthly: "Spending before retirement",
  extraMonthlySaving: "Save more each month",
  strategy: "Withdrawal order",
  eqRet: "Equity return",
  fiRet: "Fixed-income return",
  returnAdjustment: "Investment-return adjustment",
  inflation: "Inflation",
  oneTimeExpense: "One-time future expense",
  propertySale: "Property sale",
};

/** Percentage points -> the decimal fraction the engine's retDelta expects. */
export function returnAdjustmentFraction(pp: number | undefined | null): number {
  return (pp ?? 0) / 100;
}

/**
 * Extra saving is only offered where a real non-registered account already
 * exists to receive it. The scenario layer never manufactures an account, and
 * never invents a pension jurisdiction.
 */
export function extraSavingTargets(draft: PlanDraft): PersonKey[] {
  const owners = draft.accounts
    .filter((a) => a.type === "NONREG")
    .map((a) => a.owner)
    .filter((o): o is PersonKey => o === "A" || o === "B");
  return [...new Set(owners)];
}

export function isExtraSavingSupported(draft: PlanDraft): boolean {
  return extraSavingTargets(draft).length > 0;
}

function byPersonDiffers(v: ByPerson, read: (id: PersonKey) => number | null | undefined,
  draft: PlanDraft): boolean {
  return draft.people.some((p) => {
    const want = v[p.id];
    return want != null && want !== read(p.id);
  });
}

/** Is this lever actually doing anything, against the baseline draft? */
export function isLeverActive(
  patch: ScenarioPatch,
  key: PatchLeverKey,
  draft: PlanDraft,
): boolean {
  const v = patch[key];
  if (v == null) return false;
  switch (key) {
    case "cppAgeByPerson":
      return byPersonDiffers(
        v as ByPerson,
        (id) => draft.people.find((p) => p.id === id)?.cpp.age,
        draft,
      );
    case "oasAgeByPerson":
      return byPersonDiffers(
        v as ByPerson,
        (id) => draft.people.find((p) => p.id === id)?.oas.age,
        draft,
      );
    case "retireAgeByPerson":
      return byPersonDiffers(
        v as ByPerson,
        (id) => draft.people.find((p) => p.id === id)?.retAge,
        draft,
      );
    case "strategy":
      return v !== draft.strategy;
    case "eqRet":
      return v !== draft.eqRet;
    case "fiRet":
      return v !== draft.fiRet;
    case "inflation":
      return v !== draft.inflation;
    case "retSpendMonthly":
      return annualFromMonthly(v as number) !== draft.spendNeed;
    case "currentSpendMonthly":
      return annualFromMonthly(v as number) !== draft.currentSpend;
    case "oneTimeExpense":
      return (v as OneTimeExpensePatch).amt > 0;
    case "propertySale":
      return true;
    case "extraMonthlySaving": {
      if (!((v as number) > 0)) return false;
      const owners = extraSavingTargets(draft);
      if (owners.length === 0) return false;
      // More than one eligible owner: an explicit choice is required.
      return owners.length === 1 || (patch.savingOwner != null && owners.includes(patch.savingOwner));
    }
    default:
      return typeof v === "number" && v !== 0;
  }
}

export function activeLevers(patch: ScenarioPatch, draft: PlanDraft): PatchLeverKey[] {
  return PATCH_LEVERS.filter((k) => isLeverActive(patch, k, draft));
}

/** The same patch with every lever but one returned to neutral. */
export function isolatePatch(patch: ScenarioPatch, key: PatchLeverKey): ScenarioPatch {
  const out: ScenarioPatch = {};
  if (patch.savingAccount) out.savingAccount = patch.savingAccount;
  if (patch.savingOwner) out.savingOwner = patch.savingOwner;
  // Index assignment is safe: key is a literal key of ScenarioPatch.
  (out as Record<string, unknown>)[key] = patch[key];
  return out;
}


/* ------------------------------------------------------------------ */
/* Applying the patch                                                  */
/* ------------------------------------------------------------------ */

/** Draft-level edits, then normalization. Units cross the boundary here only. */
export function scenarioInputs(draft: PlanDraft, patch: ScenarioPatch): PlanInputs {
  const d: PlanDraft = { ...draft };

  if (patch.retSpendMonthly != null) d.spendNeed = annualFromMonthly(patch.retSpendMonthly);
  if (patch.currentSpendMonthly != null)
    d.currentSpend = annualFromMonthly(patch.currentSpendMonthly);
  if (patch.strategy != null) d.strategy = patch.strategy;
  if (patch.eqRet != null) d.eqRet = patch.eqRet;
  if (patch.fiRet != null) d.fiRet = patch.fiRet;
  if (patch.inflation != null) d.inflation = patch.inflation;

  if (patch.oneTimeExpense && patch.oneTimeExpense.amt > 0) {
    d.expenses = [
      ...draft.expenses,
      {
        id: "scenario_expense",
        name: patch.oneTimeExpense.name || "Scenario one-time expense",
        age: patch.oneTimeExpense.age,
        amt: patch.oneTimeExpense.amt,
      },
    ];
  }

  if (patch.propertySale) {
    const { index, saleAge } = patch.propertySale;
    d.hardAssets = draft.hardAssets.map((a, i) => (i === index ? { ...a, sale: saleAge } : a));
  }

  // The scenario layer never manufactures an account and never assigns a
  // pension jurisdiction. Extra saving only lands in an account the client
  // actually has (see extraSavingTargets).
  return normalizeDraft(d);
}

/** Projection-level overrides implied by the patch. */
export function scenarioOverride(patch: ScenarioPatch, inputs: PlanInputs): ProjectionOverride {
  const o: ProjectionOverride = {};

  if (patch.retireDeferYears) o.retAdj = patch.retireDeferYears;
  // retDelta is a decimal fraction; the control is in percentage points.
  if (patch.returnAdjustment) o.retDelta = returnAdjustmentFraction(patch.returnAdjustment);

  if (patch.extraMonthlySaving && patch.extraMonthlySaving > 0) {
    const owners = [
      ...new Set(
        inputs.accounts
          .filter((a) => a.type === "NONREG")
          .map((a) => a.owner)
          .filter((ow): ow is PersonKey => ow === "A" || ow === "B"),
      ),
    ];
    // UX1-FIX G: never silently pick an owner. One eligible owner is an
    // unambiguous destination; more than one requires an explicit choice, or
    // the change is not applied at all.
    const owner =
      patch.savingOwner && owners.includes(patch.savingOwner)
        ? patch.savingOwner
        : owners.length === 1
          ? owners[0]
          : undefined;
    // No eligible (or no chosen) non-registered account → not applied.
    if (owner) {
      o.goalSaves = [
        { amt: annualFromMonthly(patch.extraMonthlySaving) ?? 0, type: "NONREG", owner },
      ];
    }
  }


  const cppBy = patch.cppAgeByPerson ?? undefined;
  const oasBy = patch.oasAgeByPerson ?? undefined;
  const retBy = patch.retireAgeByPerson ?? undefined;
  if (cppBy || oasBy || retBy) {
    o.mods = (people) => {
      for (const p of people) {
        const cpp = cppBy?.[p.id];
        const oas = oasBy?.[p.id];
        const ret = retBy?.[p.id];
        if (cpp != null) p.cpp.age = cpp;
        if (oas != null) p.oas.age = oas;
        if (ret != null) p.retAge = ret;
      }
    };
  }

  // Unlocking locked-in money is INFORMATIONAL ONLY. A generic percentage
  // override is not a lawful mechanism: Manitoba, Federal, Ontario and Quebec
  // differ in destination vehicle, age conditions and limits. No unlocking
  // scenario is applied until the jurisdiction-specific mechanisms from the
  // canonical specification are implemented and tested.

  return o;
}


/* ------------------------------------------------------------------ */
/* Running                                                             */
/* ------------------------------------------------------------------ */

export interface ScenarioMetrics {
  /** Last age spending is fully funded (the end of the plan when never short). */
  fundedToAge: number;
  firstShortfallAge: number | null;
  shortfallYears: number;
  /** Sustainable household after-tax spending, ANNUAL engine figure. */
  sustainableSpend: number;
  /** The retirement spending target under this scenario, ANNUAL. */
  spendTarget: number;
  portfolioAtRetirement: number;
  retirementAge: number | null;
  lifetimeTax: number;
  afterTaxEstate: number;
  endingAssets: number;
  lifetimeOasClawback: number;
  strategy: WithdrawalStrategy;
  autoSelected: boolean;
}

/** A read-only view of one person as the engine ran them. */
export interface ExecutedPerson {
  id: PersonKey;
  curAge: number;
  retAge: number;
  cppAge: number;
  oasAge: number;
}

export interface ScenarioSeriesPoint {
  age: number;
  year: number;
  portfolio: number;
  netWorth: number;
}

export interface ScenarioRun {
  metrics: ScenarioMetrics;
  /** The people the engine actually ran, after every override was applied. */
  people: ExecutedPerson[];
  output: PlanOutput;
  series: ScenarioSeriesPoint[];
}

/** Run one scenario, end to end. This is the only place a scenario is run. */
export function runScenario(draft: PlanDraft, patch: ScenarioPatch = {}): ScenarioRun {
  const inputs = scenarioInputs(draft, patch);
  const override = scenarioOverride(patch, inputs);
  const P = runPlan(inputs, override);
  const output = summarize(P);
  const s = output.summary;

  // UX1-FIX E: retirement metrics come from the people the engine actually
  // ran (retAdj and every per-person override already applied), never from a
  // second reconstruction of the baseline draft.
  //
  // Household convention: the household is treated as retired at the FIRST
  // retirement in it, reported on person A's age timeline (the timeline every
  // projection row uses).
  const offsets = P.people
    .filter((p) => p.retAge > 0 && p.retAge < 900)
    .map((p) => Math.max(0, p.retAge - p.curAge));
  const ageA = P.people[0]?.curAge ?? P.curAge;
  const retirementAge = offsets.length ? ageA + Math.min(...offsets) : null;
  const atRet =
    retirementAge != null
      ? (P.rows.find((r) => r.age >= retirementAge) ?? P.rows[P.rows.length - 1])
      : P.rows[0];


  const sustainable = sustainableSpendFor(inputs, P.chosenStrategy, override, inputs.spendNeed);

  return {
    people: P.people.map((p) => ({
      id: p.id,
      curAge: p.curAge,
      retAge: p.retAge,
      cppAge: p.cpp.age,
      oasAge: p.oas.age,
    })),
    metrics: {
      fundedToAge: s.firstShortfallAge != null ? s.firstShortfallAge - 1 : s.endAge,
      firstShortfallAge: s.firstShortfallAge,
      shortfallYears: s.shortfallYears,
      sustainableSpend: sustainable,
      spendTarget: Math.round(atRet?.spendTarget ?? inputs.spendNeed),
      portfolioAtRetirement: Math.round(atRet?.totalPortfolio ?? 0),
      retirementAge,
      lifetimeTax: s.lifetimeTax,
      afterTaxEstate: s.afterTaxEstate,
      endingAssets: s.finalNetWorth,
      lifetimeOasClawback: s.lifetimeOasClawback,
      strategy: P.chosenStrategy,
      autoSelected: P.autoSelected,
    },
    output,
    series: output.chart.map((c) => ({
      age: c.age,
      year: c.year,
      portfolio: c.portfolio,
      netWorth: c.netWorth,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Strategy comparison                                                 */
/* ------------------------------------------------------------------ */

export const AUTO_RULE_TEXT =
  "Selected from the currently supported withdrawal strategies using the engine's current scoring rule: fewest years of unfunded spending, then the largest estate after income tax.";

export interface StrategyCard {
  key: WithdrawalStrategy;
  label: string;
  metrics: ScenarioMetrics;
  /** True for the ordering the plan is currently running. */
  current: boolean;
}

export interface StrategyComparison {
  /** The run the plan is on today. */
  current: StrategyCard;
  /** Every supported ordering, plus Auto, each re-run. */
  cards: StrategyCard[];
  autoRule: string;
  currentSeries: ScenarioSeriesPoint[];
}

/* ------------------------------------------------------------------ */
/* Scenario sets: baseline, isolated effects, combined                 */
/* ------------------------------------------------------------------ */

export interface IsolatedEffect {
  key: PatchLeverKey;
  label: string;
  metrics: ScenarioMetrics;
}

export interface ScenarioSet {
  baseline: ScenarioMetrics;
  baselineSeries: ScenarioSeriesPoint[];
  combined: ScenarioMetrics;
  combinedSeries: ScenarioSeriesPoint[];
  combinedOutput: PlanOutput;
  /** Each change re-run on its own. These are NOT additive. */
  isolated: IsolatedEffect[];
}

export function runScenarioSet(draft: PlanDraft, patch: ScenarioPatch): ScenarioSet {
  const base = runScenario(draft, {});
  const combined = runScenario(draft, patch);
  const keys = activeLevers(patch, draft);
  const isolated =
    keys.length > 1
      ? keys.map((key) => ({
          key,
          label: PATCH_LEVER_LABELS[key],
          metrics: runScenario(draft, isolatePatch(patch, key)).metrics,
        }))
      : [];
  return {
    baseline: base.metrics,
    baselineSeries: base.series,
    combined: combined.metrics,
    combinedSeries: combined.series,
    combinedOutput: combined.output,
    isolated,
  };
}

/**
 * Every supported withdrawal order, each re-run through the same path, plus
 * the plan's current run. No ordering is labelled optimal: Auto is reported as
 * the engine's current selection under the rule stated above.
 */
export function runStrategyComparison(draft: PlanDraft): StrategyComparison {
  const currentRun = runScenario(draft, {});
  const current: StrategyCard = {
    key: draft.strategy,
    label: draft.strategy === "auto" ? "Current Auto selection" : strategyLabel(draft.strategy),
    metrics: currentRun.metrics,
    current: true,
  };

  const keys: WithdrawalStrategy[] = [...FIXED_STRATEGIES, "auto"];
  const cards = keys.map<StrategyCard>((key) => ({
    key,
    label: key === "auto" ? "Auto (engine-selected)" : strategyLabel(key),
    metrics: key === draft.strategy ? currentRun.metrics : runScenario(draft, { strategy: key }).metrics,
    current: key === draft.strategy,
  }));

  return { current, cards, autoRule: AUTO_RULE_TEXT, currentSeries: currentRun.series };
}
