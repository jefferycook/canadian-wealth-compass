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
import { summarize, type PlanOutput } from "./summary";
import { normalizeDraft } from "./draft";
import { sustainableSpendFor } from "./levers";
import { isUnlockRuleVerified } from "./registered";
import type { PlanDraft } from "./draft";
import type {
  AccountType,
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

/**
 * Every supported scenario change, in one serializable object.
 * `null`/absent means "leave the baseline answer alone".
 */
export interface ScenarioPatch {
  retireDeferYears?: number;
  cppAge?: number | null;
  oasAge?: number | null;
  /** Absolute retirement spending, MONTHLY (UI unit). */
  retSpendMonthly?: number | null;
  /** Absolute pre-retirement spending, MONTHLY (UI unit). */
  currentSpendMonthly?: number | null;
  /** Extra saving per month on top of what the plan already contributes. */
  extraMonthlySaving?: number;
  savingAccount?: AccountType;
  strategy?: WithdrawalStrategy | null;
  /** Absolute expected equity return, as a fraction. */
  eqRet?: number | null;
  /** Absolute expected fixed-income return, as a fraction. */
  fiRet?: number | null;
  /**
   * Percentage-point adjustment applied to every account's return.
   * The engine models one net return, so this is an investment-return
   * adjustment — it is not a fee calculation.
   */
  returnAdjustment?: number;
  inflation?: number | null;
  oneTimeExpense?: OneTimeExpensePatch | null;
  propertySale?: PropertySalePatch | null;
  /** Locked-in unlocking, only honoured where the rule is VERIFIED. */
  unlockAll?: number | null;
}

export const EMPTY_PATCH: ScenarioPatch = {};

export type ScenarioPatchKey = keyof ScenarioPatch;

/** Changes that count as "active" for isolation and for Δ labelling. */
export const PATCH_LEVERS = [
  "retireDeferYears",
  "cppAge",
  "oasAge",
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
  "unlockAll",
] as const satisfies readonly ScenarioPatchKey[];

export type PatchLeverKey = (typeof PATCH_LEVERS)[number];

export const PATCH_LEVER_LABELS: Record<PatchLeverKey, string> = {
  retireDeferYears: "Retire later",
  cppAge: "CPP start age",
  oasAge: "OAS start age",
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
  unlockAll: "Unlock locked-in money",
};

/** Is this lever actually doing anything, against the baseline draft? */
export function isLeverActive(
  patch: ScenarioPatch,
  key: PatchLeverKey,
  draft: PlanDraft,
): boolean {
  const v = patch[key];
  if (v == null) return false;
  switch (key) {
    case "cppAge":
      return draft.people.some((p) => p.cpp.age !== v);
    case "oasAge":
      return draft.people.some((p) => p.oas.age !== v);
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

  const inputs = normalizeDraft(d);

  if (patch.extraMonthlySaving && patch.extraMonthlySaving > 0) {
    const type = patch.savingAccount ?? "TFSA";
    if (!inputs.accounts.some((a) => a.type === type)) {
      inputs.accounts = [
        ...inputs.accounts,
        {
          id: `scenario_${type}`,
          name: type,
          type,
          owner: "A",
          bal: 0,
          eq: 60,
          acb: 0,
          conv: 0,
          unlock: 0,
          juris: "ON",
          contrib: 0,
          contribEnd: 0,
          wd: 0,
          wdStart: 0,
          wdEnd: 0,
          mix: { int: 0.3, div: 0.3, cg: 0.4 },
        },
      ];
    }
  }

  return inputs;
}

/** Projection-level overrides implied by the patch. */
export function scenarioOverride(patch: ScenarioPatch, inputs: PlanInputs): ProjectionOverride {
  const o: ProjectionOverride = {};

  if (patch.retireDeferYears) o.retAdj = patch.retireDeferYears;
  if (patch.returnAdjustment) o.retDelta = patch.returnAdjustment;
  if (patch.extraMonthlySaving && patch.extraMonthlySaving > 0) {
    o.goalSaves = [
      {
        amt: annualFromMonthly(patch.extraMonthlySaving) ?? 0,
        type: patch.savingAccount ?? "TFSA",
        owner: "A",
      },
    ];
  }
  if (patch.cppAge != null || patch.oasAge != null) {
    const cppAge = patch.cppAge;
    const oasAge = patch.oasAge;
    o.mods = (people) => {
      for (const p of people) {
        if (cppAge != null) p.cpp.age = cppAge;
        if (oasAge != null) p.oas.age = oasAge;
      }
    };
  }
  // Unlocking is only honoured where the governing rule is verified.
  if (patch.unlockAll != null) {
    const allVerified = inputs.accounts
      .filter((a) => a.type === "LIRA" || a.type === "LIF")
      .every((a) => isUnlockRuleVerified(a.juris));
    if (allVerified) o.unlockAll = patch.unlockAll;
  }

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

export interface ScenarioSeriesPoint {
  age: number;
  year: number;
  portfolio: number;
  netWorth: number;
}

export interface ScenarioRun {
  metrics: ScenarioMetrics;
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

  const retAges = inputs.people
    .map((p) => p.retAge + (patch.retireDeferYears ?? 0))
    .filter((a) => a > 0 && a < 999);
  const retirementAge = retAges.length ? Math.min(...retAges) : null;
  const atRet =
    retirementAge != null
      ? (P.rows.find((r) => r.age >= retirementAge) ?? P.rows[P.rows.length - 1])
      : P.rows[0];

  const sustainable = sustainableSpendFor(inputs, P.chosenStrategy, override, inputs.spendNeed);

  return {
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
