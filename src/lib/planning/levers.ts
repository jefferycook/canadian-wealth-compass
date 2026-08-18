/**
 * "What if I..." levers.
 *
 * Every recommendation the client can act on is expressed as an adjustment to
 * the plan, scored by re-running the projection. Nothing here defines a
 * statutory number: it only re-runs the engine with different answers and
 * reports the difference.
 *
 * The headline measure is how much after-tax spending the plan can sustain
 * through retirement. Progress is that sustainable amount against what the
 * client says they want to spend.
 */

import { afterTaxEstate, depletionAge, lifetimeTax, runPlan, shortfallYears } from "./engine";
import { projection } from "./projection";
import type {
  AccountType,
  PlanInputs,
  ProjectionOverride,
  ProjectionResult,
  WithdrawalStrategy,
} from "./types";

export interface LeverSettings {
  /** Extra saving per month, on top of what the accounts already contribute. */
  extraMonthlySaving: number;
  savingAccount: AccountType;
  /** Years everyone defers retirement by. */
  retireDeferYears: number;
  /** Monthly cut to spending while still working. */
  preRetSpendCutMonthly: number;
  /** Monthly cut to retirement spending. */
  retSpendCutMonthly: number;
  /** Start ages for CPP and OAS. Null keeps what the plan already says. */
  cppAge: number | null;
  oasAge: number | null;
}

export const NO_LEVERS: LeverSettings = {
  extraMonthlySaving: 0,
  savingAccount: "TFSA",
  retireDeferYears: 0,
  preRetSpendCutMonthly: 0,
  retSpendCutMonthly: 0,
  cppAge: null,
  oasAge: null,
};

export interface PlanScore {
  /** Household after-tax spending the plan can sustain every year. */
  sustainableSpend: number;
  sustainableMonthly: number;
  /** Retirement spending target under this scenario. */
  spendTarget: number;
  /** Sustainable spending over the target, 0-2. */
  progress: number;
  shortfallYears: number;
  depletionAge: number | null;
  lifetimeTax: number;
  afterTaxEstate: number;
  finalNetWorth: number;
}

/** Add a zero-balance account so a saving lever always has somewhere to go. */
function withAccount(inputs: PlanInputs, type: AccountType): PlanInputs {
  if (inputs.accounts.some((a) => a.type === type)) return inputs;
  return {
    ...inputs,
    accounts: [
      ...inputs.accounts,
      {
        id: `lever_${type}`,
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
    ],
  };
}

/** Turn the client's slider positions into an engine override. */
export function leverOverride(levers: LeverSettings): ProjectionOverride {
  const o: ProjectionOverride = {};
  if (levers.extraMonthlySaving > 0) {
    o.goalSaves = [
      { amt: levers.extraMonthlySaving * 12, type: levers.savingAccount, owner: "A" },
    ];
  }
  if (levers.retireDeferYears) o.retAdj = levers.retireDeferYears;
  if (levers.preRetSpendCutMonthly) o.currentSpendAdj = -levers.preRetSpendCutMonthly * 12;
  if (levers.retSpendCutMonthly) o.spendAdj = -levers.retSpendCutMonthly * 12;
  if (levers.cppAge != null || levers.oasAge != null) {
    const cppAge = levers.cppAge;
    const oasAge = levers.oasAge;
    o.mods = (people) => {
      for (const p of people) {
        if (cppAge != null) p.cpp.age = cppAge;
        if (oasAge != null) p.oas.age = oasAge;
      }
    };
  }
  return o;
}

function lasts(P: ProjectionResult): boolean {
  return shortfallYears(P) === 0 && depletionAge(P) == null;
}

/**
 * The most the household could spend after tax, every year, and still have the
 * plan last. Found by bisection on the spending target.
 */
function sustainableSpend(
  inputs: PlanInputs,
  strategy: WithdrawalStrategy,
  override: ProjectionOverride,
  target: number,
): number {
  const run = (spend: number) =>
    lasts(projection(inputs, { ...override, strategy, spendSet: spend }));

  let hi = Math.max(target, 12000) * 1.5;
  let guard = 0;
  while (run(hi) && guard++ < 8) hi *= 1.6;
  if (guard === 0 && !run(0)) return 0;
  let lo = 0;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (run(mid)) lo = mid;
    else hi = mid;
  }
  return Math.round(lo);
}

/** Score the plan under a set of levers. */
export function scorePlan(inputs: PlanInputs, levers: LeverSettings = NO_LEVERS): PlanScore {
  const base = withAccount(inputs, levers.savingAccount);
  const override = leverOverride(levers);
  const P = runPlan(base, override);
  const strategy = P.chosenStrategy;
  const spendTarget = Math.max(0, inputs.spendNeed - levers.retSpendCutMonthly * 12);
  const sustainable = sustainableSpend(base, strategy, override, spendTarget);
  const last = P.rows[P.rows.length - 1];
  return {
    sustainableSpend: sustainable,
    sustainableMonthly: Math.round(sustainable / 12),
    spendTarget: Math.round(spendTarget),
    progress: spendTarget > 0 ? Math.min(2, sustainable / spendTarget) : 1,
    shortfallYears: shortfallYears(P),
    depletionAge: depletionAge(P),
    lifetimeTax: Math.round(lifetimeTax(P)),
    afterTaxEstate: Math.round(afterTaxEstate(P)),
    finalNetWorth: Math.round(last?.netWorth ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/* Cash flow and the account a surplus should go to                    */
/* ------------------------------------------------------------------ */

export interface CashflowView {
  /** After-tax household income in the first year of the plan. */
  afterTaxIncome: number;
  /** What the client says they spend today. Null when unanswered. */
  currentSpend: number | null;
  /** Contributions the plan already makes. */
  contributions: number;
  /** Money left over each year, or null when spending is unanswered. */
  surplus: number | null;
  surplusMonthly: number | null;
}

export function cashflowView(inputs: PlanInputs, P: ProjectionResult): CashflowView {
  const r = P.rows[0];
  const afterTaxIncome = Math.round(r?.afterTax ?? 0);
  const contributions = Math.round(r?.contribTotal ?? 0);
  const currentSpend = inputs.currentSpend ?? null;
  const surplus =
    currentSpend == null ? null : Math.round(afterTaxIncome - currentSpend - contributions);
  return {
    afterTaxIncome,
    currentSpend,
    contributions,
    surplus,
    surplusMonthly: surplus == null ? null : Math.round(surplus / 12),
  };
}

export interface SavingAdvice {
  type: AccountType;
  label: string;
  reason: string;
  roomAvailable: number;
}

/**
 * Where a surplus dollar should go, decided from contribution room and the
 * marginal rate the projection actually shows in the first year.
 */
export function recommendSavingsAccount(inputs: PlanInputs, P: ProjectionResult): SavingAdvice {
  const tfsaRoom = inputs.people.reduce((s, p) => s + (p.tfsaRoom ?? 0), 0);
  const rrspRoom = inputs.people.reduce((s, p) => s + (p.rrspRoom ?? 0), 0);
  const marginal = P.rows[0]?.margRate ?? 0;
  const ratePct = `${(marginal * 100).toFixed(0)}%`;

  if (rrspRoom > 0 && marginal >= 0.3) {
    return {
      type: "RRSP",
      label: "RRSP",
      reason: `You are taxed at about ${ratePct} today and have RRSP room, so a contribution refunds tax now and comes out at a lower rate in retirement.`,
      roomAvailable: rrspRoom,
    };
  }
  if (tfsaRoom > 0) {
    return {
      type: "TFSA",
      label: "TFSA",
      reason:
        marginal >= 0.3
          ? `TFSA room comes first once RRSP room is used: growth is tax-free and withdrawals never count against OAS.`
          : `At about ${ratePct} today an RRSP deduction is worth little, so TFSA room is the better home — tax-free growth and no clawback later.`,
      roomAvailable: tfsaRoom,
    };
  }
  if (rrspRoom > 0) {
    return {
      type: "RRSP",
      label: "RRSP",
      reason: "RRSP room is the only registered room left, and the deduction still defers tax.",
      roomAvailable: rrspRoom,
    };
  }
  return {
    type: "NONREG",
    label: "Non-registered account",
    reason:
      "With no registered room left, extra savings go to a taxable account — favour Canadian dividends and capital gains, which are taxed more lightly than interest.",
    roomAvailable: 0,
  };
}
