/**
 * Planning opportunities to test.
 *
 * This module proposes *changes*, never impacts. Every dollar figure a client
 * sees comes from running the proposed `ScenarioPatch` through `runScenario`.
 * Nothing here scores, ranks or aggregates: tax, estate, spending capacity and
 * timing are different objectives, and the largest number is not automatically
 * the best choice.
 */

import type { PlanDraft } from "./draft";
import { unlockRule } from "./registered";
import { isExtraSavingSupported, type ByPerson, type ScenarioPatch } from "./scenario";
import { monthlyFromAnnual } from "./units";

/** The same age for every person in the plan, expressed per person. */
function byPerson(draft: PlanDraft, age: number): ByPerson {
  const out: ByPerson = {};
  for (const p of draft.people) out[p.id] = age;
  return out;
}


export type OpportunityTheme = "Funding" | "Timing" | "Tax" | "Assumptions" | "Locked-in money";

export interface Opportunity {
  id: string;
  theme: OpportunityTheme;
  title: string;
  /** Why this may help — never a promise. */
  why: string;
  /** The exact proposed change, in plain language. */
  change: string;
  tradeoffs: string;
  /** Present only when the engine supports the lever; drives [Preview]. */
  patch?: ScenarioPatch;
}

/** Build the list of testable changes for a draft. Pure; no engine run. */
export function buildOpportunities(draft: PlanDraft): Opportunity[] {
  const out: Opportunity[] = [];
  const people = draft.people;
  const retMonthly = monthlyFromAnnual(draft.spendNeed);

  out.push({
    id: "retire-later",
    theme: "Timing",
    title: "Work two more years before retiring",
    why: "Two more years of earnings, two fewer years of drawdown, and two more years of compounding all act on the same portfolio.",
    change: "Retirement pushed back by 2 years for everyone in the plan.",
    tradeoffs: "Two fewer years of retirement, and it assumes the work is available and wanted.",
    patch: { retireDeferYears: 2 },
  });

  if (people.some((p) => (p.cpp.age ?? 65) < 70)) {
    out.push({
      id: "cpp-70",
      theme: "Timing",
      title: "Start CPP at 70 instead",
      why: "CPP is permanently larger the later it starts, and it is indexed and paid for life, so it can carry more of late-retirement spending.",
      change: "CPP start age set to 70 for everyone in the plan.",
      tradeoffs:
        "The portfolio funds the gap years instead, so early balances fall. Poor health or a short life expectancy usually argues the other way.",
      patch: { cppAgeByPerson: byPerson(draft, 70) },
    });
  }

  if (people.some((p) => (p.oas.age ?? 65) < 70)) {
    out.push({
      id: "oas-70",
      theme: "Timing",
      title: "Start OAS at 70 instead",
      why: "Deferring OAS raises the monthly amount permanently and can move income out of clawback years.",
      change: "OAS start age set to 70 for everyone in the plan.",
      tradeoffs: "No OAS between 65 and 70; the portfolio covers that spending instead.",
      patch: { oasAgeByPerson: byPerson(draft, 70) },
    });
  }

  if (isExtraSavingSupported(draft)) {
    out.push({
      id: "save-more",
      theme: "Funding",
      title: "Save $500 / month more until retirement",
      why: "Extra saving before retirement changes both the balance at retirement and the years it has to last.",
      change: "An extra $500 / month contributed to your non-registered account until retirement.",
      tradeoffs:
        "$500 / month less to spend today. Extra TFSA and RRSP saving is not offered yet: contribution-room enforcement is still pending in the engine, so a registered result would be unreliable.",
      patch: { extraMonthlySaving: 500, savingAccount: "NONREG" },
    });
  } else {
    out.push({
      id: "save-more",
      theme: "Funding",
      title: "Save more each month (not testable yet)",
      why: "Extra saving before retirement changes both the balance at retirement and the years it has to last.",
      change: "No change is applied.",
      tradeoffs:
        "Extra TFSA and RRSP saving is disabled until contribution-room enforcement lands in the engine, and there is no non-registered account in this plan to receive the money. Add one to test this change.",
    });
  }


  if (retMonthly != null && retMonthly > 0) {
    const trimmed = Math.round(retMonthly * 0.9);
    out.push({
      id: "spend-less",
      theme: "Funding",
      title: "Test retirement spending 10% lower",
      why: "Spending is the single largest lever in most plans, and a modest trim can remove shortfall years entirely.",
      change: `Retirement spending set to $${trimmed.toLocaleString("en-CA")} / month.`,
      tradeoffs: "A permanently lower standard of living in retirement.",
      patch: { retSpendMonthly: trimmed },
    });
  }

  out.push({
    id: "withdrawal-order",
    theme: "Tax",
    title: "Test a different withdrawal order",
    why: "Which account is drawn first changes taxable income each year, and with it lifetime tax, OAS clawback and what is left in the estate.",
    change: "Registered money drawn before non-registered.",
    tradeoffs:
      "Higher tax early in retirement in exchange for smaller mandatory RRIF income later. The Strategies page compares every supported order side by side.",
    patch: { strategy: "reg_nonreg_tfsa" },
  });

  out.push({
    id: "return-stress",
    theme: "Assumptions",
    title: "Stress-test returns one point lower",
    why: "Knowing how the plan behaves on a weaker market path matters more than the single expected-return number.",
    change: "Investment-return adjustment of −1.0 percentage point on every account.",
    tradeoffs:
      "This is an adjustment to the modelled net return. The engine models one net return, so this is not a fee calculation.",
    patch: { returnAdjustment: -1 },
  });

  out.push({
    id: "inflation-stress",
    theme: "Assumptions",
    title: "Stress-test higher inflation",
    why: "Spending needs are indexed, so a persistently higher inflation rate raises every future year's target.",
    change: `Inflation set to ${((draft.inflation + 0.01) * 100).toFixed(1)}%.`,
    tradeoffs: "Nothing to act on directly — it tests how much headroom the plan has.",
    patch: { inflation: draft.inflation + 0.01 },
  });

  const locked = draft.accounts.filter((a) => a.type === "LIRA" || a.type === "LIF");
  if (locked.length > 0) {
    const verified = locked.every((a) => isUnlockRuleVerified(a.juris));
    out.push({
      id: "unlock",
      theme: "Locked-in money",
      title: verified
        ? "Test unlocking part of your locked-in money"
        : "Unlocking locked-in money (informational)",
      why: "Unlocked money moves to an RRSP or RRIF, which removes the annual maximum-withdrawal limit that applies to a LIF.",
      change: verified
        ? "50% of locked-in balances unlocked where the governing rule permits it."
        : "No change is applied.",
      tradeoffs: verified
        ? "Unlocking is a one-time right in most jurisdictions and gives up creditor protection features of locked-in money."
        : "The unlocking rule for this pension jurisdiction has not been verified against current statute in this app, so it is shown for information only and cannot be tested as a change.",
      ...(verified ? { patch: { unlockAll: 50 } as ScenarioPatch } : {}),
    });
  }

  return out;
}
