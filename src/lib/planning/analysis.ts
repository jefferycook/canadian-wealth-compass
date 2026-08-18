/**
 * Analysis derived from a completed projection.
 *
 * Everything here reads the engine's output (and re-runs it for comparisons).
 * No statutory number is defined in this file — the rules layer owns those.
 */

import { afterTaxEstate, depletionAge, lifetimeTax, runPlan, shortfallYears } from "./engine";
import { FIXED_STRATEGIES } from "./strategy";
import { strategyLabel } from "./summary";
import type { PlanInputs, PlanResult, ProjectionResult, WithdrawalStrategy } from "./types";

/* ------------------------------------------------------------------ */
/* Net worth                                                           */
/* ------------------------------------------------------------------ */

export interface NetWorthPoint {
  age: number;
  year: number;
  registered: number;
  tfsa: number;
  nonreg: number;
  property: number;
  debt: number;
  netWorth: number;
}

export interface NetWorthView {
  today: NetWorthPoint;
  peak: NetWorthPoint;
  final: NetWorthPoint;
  series: NetWorthPoint[];
}

function pointFrom(P: ProjectionResult, index: number): NetWorthPoint {
  const r = P.rows[index]!;
  const typeById: Record<string, string> = {};
  for (const a of P.acctMeta) typeById[a.id] = a.type;
  let registered = 0;
  let tfsa = 0;
  let nonreg = 0;
  for (const [id, bal] of Object.entries(r.balances)) {
    const t = typeById[id];
    if (t === "TFSA") tfsa += bal;
    else if (t === "NONREG") nonreg += bal;
    else registered += bal;
  }
  return {
    age: r.age,
    year: r.yr,
    registered: Math.round(registered),
    tfsa: Math.round(tfsa),
    nonreg: Math.round(nonreg),
    property: Math.round(r.assetTotal ?? 0),
    debt: Math.round(r.liabTotal ?? 0),
    netWorth: Math.round(r.netWorth),
  };
}

export function netWorthView(P: ProjectionResult): NetWorthView {
  const series = P.rows.map((_, i) => pointFrom(P, i));
  const peak = series.reduce((m, p) => (p.netWorth > m.netWorth ? p : m), series[0]!);
  return { today: series[0]!, peak, final: series[series.length - 1]!, series };
}

/* ------------------------------------------------------------------ */
/* Strategy comparison                                                 */
/* ------------------------------------------------------------------ */

export interface StrategyRow {
  key: WithdrawalStrategy;
  label: string;
  shortfallYears: number;
  depletionAge: number | null;
  lifetimeTax: number;
  oasClawback: number;
  afterTaxEstate: number;
  chosen: boolean;
  /** Estate difference against the strategy the plan is using. */
  estateDelta: number;
}

export function compareStrategies(inputs: PlanInputs, chosen: WithdrawalStrategy): StrategyRow[] {
  const rows = FIXED_STRATEGIES.map((s) => {
    const P = runPlan({ ...inputs, strategy: s });
    return {
      key: s,
      label: strategyLabel(s),
      shortfallYears: shortfallYears(P),
      depletionAge: depletionAge(P),
      lifetimeTax: Math.round(lifetimeTax(P)),
      oasClawback: Math.round(P.rows.reduce((t, r) => t + r.oasClaw, 0)),
      afterTaxEstate: Math.round(afterTaxEstate(P)),
      chosen: s === chosen,
      estateDelta: 0,
    };
  });
  const base = rows.find((r) => r.chosen)?.afterTaxEstate ?? 0;
  for (const r of rows) r.estateDelta = r.afterTaxEstate - base;
  return rows.sort((a, b) => a.shortfallYears - b.shortfallYears || b.afterTaxEstate - a.afterTaxEstate);
}

/* ------------------------------------------------------------------ */
/* Goal progress                                                       */
/* ------------------------------------------------------------------ */

export interface GoalProgress {
  retirementAge: number | null;
  yearsToRetirement: number | null;
  currentSavings: number;
  /** Savings at retirement on the current path. */
  projectedAtRetirement: number;
  /** Savings the plan would need at today's balances to fund every year. */
  requiredToday: number;
  /** 0-1: how much of the required capital is already in place. */
  fundedRatio: number;
  onTrack: boolean;
  firstShortfallAge: number | null;
  annualSpendTarget: number;
  guaranteedIncomeAtRetirement: number;
}

/**
 * How far along the plan is, measured by scaling today's balances until the
 * projection funds every year. A factor of 1.2 means the client needs 20%
 * more capital than they hold today; 0.8 means they are 25% ahead.
 */
export function goalProgress(inputs: PlanInputs, P: PlanResult): GoalProgress {
  const scaled = (f: number) =>
    runPlan({ ...inputs, accounts: inputs.accounts.map((a) => ({ ...a, bal: a.bal * f })) });

  const currentSavings = inputs.accounts.reduce((s, a) => s + a.bal, 0);
  const funds = (f: number) => {
    const R = scaled(f);
    return shortfallYears(R) === 0 && depletionAge(R) == null;
  };

  let factor: number;
  if (funds(1)) {
    // Already funded: find how little capital would still do it.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (funds(mid)) hi = mid;
      else lo = mid;
    }
    factor = hi;
  } else {
    let hi = 2;
    let guard = 0;
    while (!funds(hi) && guard++ < 6) hi *= 2;
    let lo = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (funds(mid)) hi = mid;
      else lo = mid;
    }
    factor = hi;
  }

  const retAges = inputs.people.map((p) => p.retAge).filter((a) => a > 0 && a < 999);
  const retirementAge = retAges.length ? Math.min(...retAges) : null;
  const primary = inputs.people[0];
  const yearsToRetirement =
    retirementAge != null && primary ? Math.max(0, retirementAge - primary.curAge) : null;

  const atRet =
    retirementAge != null
      ? (P.rows.find((r) => r.age >= retirementAge) ?? P.rows[P.rows.length - 1])
      : P.rows[0];

  const requiredToday = Math.round(currentSavings * factor);
  const fundedRatio = requiredToday > 0 ? Math.min(1.5, currentSavings / requiredToday) : 1;

  return {
    retirementAge,
    yearsToRetirement,
    currentSavings: Math.round(currentSavings),
    projectedAtRetirement: Math.round(atRet?.totalPortfolio ?? 0),
    requiredToday,
    fundedRatio,
    onTrack: shortfallYears(P) === 0 && depletionAge(P) == null,
    firstShortfallAge: P.rows.find((r) => r.shortfall > 1)?.age ?? null,
    annualSpendTarget: Math.round(atRet?.spendTarget ?? 0),
    guaranteedIncomeAtRetirement: Math.round(
      (atRet?.cpp ?? 0) + (atRet?.oas ?? 0) + (atRet?.pen ?? 0),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Recommendations                                                     */
/* ------------------------------------------------------------------ */

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  /** Quantified effect where one can be measured. */
  impact?: string;
  severity: "high" | "medium" | "info";
}

/**
 * Plain-language actions a client can take, each tied to something the
 * projection actually shows. Nothing here is generic advice: every item is
 * generated only when the numbers trigger it.
 */
export function buildRecommendations(
  inputs: PlanInputs,
  P: PlanResult,
  strategies: StrategyRow[],
  goal: GoalProgress,
): Recommendation[] {
  const out: Recommendation[] = [];
  const short = shortfallYears(P);
  const dep = depletionAge(P);

  if (short > 0 || dep != null) {
    out.push({
      id: "shortfall",
      title: dep != null ? `Savings run out at age ${dep}` : `${short} years fall short`,
      detail:
        "On the current path the plan cannot fund your spending target every year. Closing it takes some combination of retiring later, spending less, or saving more before retirement.",
      impact: `About ${money(Math.max(0, goal.requiredToday - goal.currentSavings))} more capital today would fund the plan in full.`,
      severity: "high",
    });
  } else {
    out.push({
      id: "funded",
      title: "The plan funds every year",
      detail:
        "Your spending target is met in full through the whole projection, with money left over at the end.",
      impact: `Estate after tax: ${money(Math.round(afterTaxEstate(P)))}.`,
      severity: "info",
    });
  }

  const best = strategies[0];
  const current = strategies.find((s) => s.chosen);
  if (best && current && best.key !== current.key && best.estateDelta > 5000) {
    out.push({
      id: "strategy",
      title: `Draw from ${best.label.toLowerCase()} instead`,
      detail:
        "Changing the order accounts are drawn down changes how much tax you pay and how long the money lasts.",
      impact: `Worth about ${money(best.estateDelta)} more after tax, and ${money(current.lifetimeTax - best.lifetimeTax)} less lifetime tax.`,
      severity: "medium",
    });
  }

  const claw = P.rows.reduce((t, r) => t + r.oasClaw, 0);
  if (claw > 500) {
    out.push({
      id: "oas",
      title: "OAS is being clawed back",
      detail:
        "Taxable income crosses the OAS recovery threshold in at least one year. Drawing registered money earlier, before OAS starts, usually flattens income and keeps more of the benefit.",
      impact: `${money(Math.round(claw))} of OAS is lost over the plan.`,
      severity: "medium",
    });
  }

  for (const p of inputs.people) {
    if (p.cpp.amt > 0 && p.cpp.age < 70 && (dep == null || dep > 80)) {
      out.push({
        id: `cpp-${p.id}`,
        title: `Consider starting CPP later than ${p.cpp.age} for ${p.firstName || "you"}`,
        detail:
          "CPP rises 0.7% for every month it is deferred past 65, and the higher amount is indexed for life. Deferring is strongest when other savings can bridge the gap and you expect a long life.",
        severity: "info",
      });
    }
  }

  const tfsaRoom = inputs.people.reduce((s, p) => s + (p.tfsaRoom ?? 0), 0);
  const nonreg = inputs.accounts.filter((a) => a.type === "NONREG").reduce((s, a) => s + a.bal, 0);
  if (tfsaRoom > 5000 && nonreg > 5000) {
    out.push({
      id: "tfsa",
      title: "Unused TFSA room alongside taxable savings",
      detail:
        "Moving taxable investments into the TFSA removes the tax on their growth and keeps the income out of the OAS clawback calculation.",
      impact: `${money(Math.min(tfsaRoom, nonreg))} could be sheltered.`,
      severity: "medium",
    });
  }

  const peakRate = P.rows.reduce((m, r) => Math.max(m, r.margRate), 0);
  if (peakRate > 0.43) {
    out.push({
      id: "bracket",
      title: "The plan hits a high marginal rate",
      detail:
        "At least one year pushes into a top bracket, usually because RRIF minimums stack on top of pensions and benefits. Melting down registered money in low-income years before that point smooths the rate.",
      impact: `Peak marginal rate: ${(peakRate * 100).toFixed(1)}%.`,
      severity: "medium",
    });
  }

  const debt = inputs.liabilities.reduce((s, l) => s + l.bal, 0);
  if (debt > 0) {
    const worst = inputs.liabilities.reduce((m, l) => (l.rate > m.rate ? l : m));
    if (worst.rate > inputs.fiRet) {
      out.push({
        id: "debt",
        title: `Paying down ${worst.name || "debt"} beats the fixed-income return`,
        detail: `That debt costs ${(worst.rate * 100).toFixed(1)}% while the fixed-income sleeve is assumed to earn ${(inputs.fiRet * 100).toFixed(1)}%. Retiring it is a guaranteed, tax-free return.`,
        severity: "medium",
      });
    }
  }

  if (inputs.people.length > 1) {
    const splitYears = P.rows.filter((r) => r.splitAmt > 0).length;
    if (splitYears > 0) {
      out.push({
        id: "split",
        title: "Pension income splitting is already helping",
        detail:
          "The projection moves eligible pension income to the lower-income spouse where it reduces household tax. Keep filing the joint election each year.",
        impact: `Applied in ${splitYears} year${splitYears === 1 ? "" : "s"}.`,
        severity: "info",
      });
    }
  }

  return out;
}

function money(n: number) {
  return n.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });
}
