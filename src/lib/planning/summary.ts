/**
 * Presentation-layer summaries derived from a projection.
 *
 * Nothing here calculates tax or benefits — it only reads a `PlanResult` and
 * reduces it to the handful of numbers and series a chart or headline needs.
 */

import { afterTaxEstate, depletionAge, lifetimeTax, shortfallYears } from "./engine";
import type { PlanResult } from "./types";

export interface PlanChartPoint {
  age: number;
  year: number;
  portfolio: number;
  netWorth: number;
  afterTax: number;
  spendTarget: number;
  tax: number;
  shortfall: number;
  registered: number;
  tfsa: number;
  nonreg: number;
}

/**
 * The full year-by-year detail the projection already computes.
 *
 * The chart series above is deliberately small; this is the ledger behind it,
 * and it is what the tax, cash-flow and details views read.
 */
export interface PlanYearDetail {
  age: number;
  ages: number[];
  year: number;
  /** Guaranteed income */
  cpp: number;
  oas: number;
  pension: number;
  employment: number;
  otherIncome: number;
  /** Portfolio withdrawals by tax treatment */
  registeredWithdraw: number;
  tfsaWithdraw: number;
  nonregWithdraw: number;
  /** Tax detail */
  taxableIncome: number;
  tax: number;
  oasClawback: number;
  splitAmount: number;
  averageRate: number;
  marginalRate: number;
  /** Cash flow */
  afterTax: number;
  spendTarget: number;
  shortfall: number;
  contributions: number;
  debtPayment: number;
  /** Balance sheet */
  portfolio: number;
  assetTotal: number;
  liabTotal: number;
  netWorth: number;
  /** Flags */
  lifRemaining: number;
  lifBound: boolean;
  depleted: boolean;
  anyDeceased: boolean;
  /** Closing balance per account id. */
  balances: Record<string, number>;
}


export interface PlanSummary {
  /** Age money runs out, or null when the plan lasts. */
  depletionAge: number | null;
  /** Years the plan cannot fund the spending target. */
  shortfallYears: number;
  lifetimeTax: number;
  afterTaxEstate: number;
  finalNetWorth: number;
  strategy: string;
  autoSelected: boolean;
  startAge: number;
  endAge: number;
  /** Total OAS clawed back over the plan. */
  lifetimeOasClawback: number;
  /** Highest marginal rate the plan ever hits, as a fraction. */
  peakMarginalRate: number;
}

export interface PlanOutput {
  summary: PlanSummary;
  chart: PlanChartPoint[];
  /** The full ledger behind the chart. */
  years: PlanYearDetail[];
  accounts: AccountMeta[];
}


const STRATEGY_LABEL: Record<string, string> = {
  nonreg_reg_tfsa: "Non-registered first, then registered, TFSA last",
  reg_nonreg_tfsa: "Registered first, then non-registered, TFSA last",
  tfsa_nonreg_reg: "TFSA first, then non-registered, registered last",
  prorata: "Proportional across all accounts",
  auto: "Chosen automatically",
};

export function strategyLabel(key: string): string {
  return STRATEGY_LABEL[key] ?? key;
}

export function summarize(P: PlanResult): PlanOutput {
  const typeById: Record<string, string> = {};
  for (const a of P.acctMeta) typeById[a.id] = a.type;

  const chart: PlanChartPoint[] = P.rows.map((r) => {
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
      portfolio: Math.round(r.totalPortfolio),
      netWorth: Math.round(r.netWorth),
      afterTax: Math.round(r.afterTax),
      spendTarget: Math.round(r.spendTarget),
      tax: Math.round(r.tax),
      shortfall: Math.round(r.shortfall),
      registered: Math.round(registered),
      tfsa: Math.round(tfsa),
      nonreg: Math.round(nonreg),
    };
  });

  const last = P.rows[P.rows.length - 1];
  const first = P.rows[0];

  return {
    summary: {
      depletionAge: depletionAge(P),
      shortfallYears: shortfallYears(P),
      lifetimeTax: Math.round(lifetimeTax(P)),
      afterTaxEstate: Math.round(afterTaxEstate(P)),
      finalNetWorth: Math.round(last?.netWorth ?? 0),
      strategy: P.chosenStrategy,
      autoSelected: P.autoSelected,
      startAge: first?.age ?? 0,
      endAge: last?.age ?? 0,
      lifetimeOasClawback: Math.round(P.rows.reduce((s, r) => s + r.oasClaw, 0)),
      peakMarginalRate: P.rows.reduce((m, r) => Math.max(m, r.margRate), 0),
    },
    chart,
  };
}
