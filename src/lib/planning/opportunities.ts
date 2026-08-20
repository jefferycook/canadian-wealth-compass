/**
 * Planning opportunities to test.
 *
 * This module proposes *changes*, never impacts. Every dollar figure a client
 * sees comes from running the proposed `ScenarioPatch` through `runScenario`.
 * Nothing here scores, ranks or aggregates: tax, estate, spending capacity and
 * timing are different objectives, and the largest number is not automatically
 * the best choice.
 */

import type { PlanDraft, PersonDraft } from "./draft";
import { unlockRule } from "./registered";
import { extraSavingTargets, isExtraSavingSupported, type ScenarioPatch } from "./scenario";
import { monthlyFromAnnual } from "./units";

/** How a person is referred to in opportunity copy. */
function personLabel(p: PersonDraft): string {
  return p.firstName?.trim() || (p.id === "A" ? "Person A" : "Person B");
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
  const single = people.length < 2;

  out.push({
    id: "retire-later",
    theme: "Timing",
    title: "Work two more years before retiring",
    why: "Two more years of earnings, two fewer years of drawdown, and two more years of compounding all act on the same portfolio.",
    change: "Retirement pushed back by 2 years for everyone in the plan.",
    tradeoffs: "Two fewer years of retirement, and it assumes the work is available and wanted.",
    patch: { retireDeferYears: 2 },
  });

  // UX1-FIX F: one opportunity per person. Each patch moves only that
  // person's start age; testing combinations is an optimizer's job, not a
  // recommendation's, and no start age is described as optimal.
  for (const p of people) {
    if ((p.cpp.age ?? 65) < 70) {
      const who = personLabel(p);
      out.push({
        id: `cpp-70-${p.id}`,
        theme: "Timing",
        title: single ? "Start CPP at 70 instead" : `Test ${who} starting CPP at 70`,
        why: "CPP is permanently larger the later it starts, and it is indexed and paid for life, so it can carry more of late-retirement spending.",
        change: single
          ? "CPP start age set to 70."
          : `CPP start age set to 70 for ${who} only. Everyone else keeps their current start age.`,
        tradeoffs:
          "The portfolio funds the gap years instead, so early balances fall. Poor health or a short life expectancy usually argues the other way.",
        patch: { cppAgeByPerson: { [p.id]: 70 } },
      });
    }
  }

  for (const p of people) {
    if ((p.oas.age ?? 65) < 70) {
      const who = personLabel(p);
      out.push({
        id: `oas-70-${p.id}`,
        theme: "Timing",
        title: single ? "Start OAS at 70 instead" : `Test ${who} starting OAS at 70`,
        why: "Deferring OAS raises the monthly amount permanently and can move income out of clawback years.",
        change: single
          ? "OAS start age set to 70."
          : `OAS start age set to 70 for ${who} only. Everyone else keeps their current start age.`,
        tradeoffs: "No OAS between 65 and 70; the portfolio covers that spending instead.",
        patch: { oasAgeByPerson: { [p.id]: 70 } },
      });
    }
  }

  // UX1-FIX G: the destination owner is never chosen silently. With one
  // eligible non-registered owner the destination is unambiguous; with two,
  // one owner-specific opportunity is offered for each.
  const savingOwners = extraSavingTargets(draft);
  if (isExtraSavingSupported(draft)) {
    for (const owner of savingOwners) {
      const p = people.find((x) => x.id === owner);
      const who = p ? personLabel(p) : owner === "A" ? "Person A" : "Person B";
      const suffix = savingOwners.length > 1 ? ` into ${who}'s account` : "";
      out.push({
        id: savingOwners.length > 1 ? `save-more-${owner}` : "save-more",
        theme: "Funding",
        title: `Save $500 / month more until retirement${suffix}`,
        why: "Extra saving before retirement changes both the balance at retirement and the years it has to last.",
        change: `An extra $500 / month contributed to ${
          savingOwners.length > 1 ? `${who}'s` : "your"
        } non-registered account until retirement.`,
        tradeoffs:
          "$500 / month less to spend today. Extra TFSA and RRSP saving is not offered yet: contribution-room enforcement is still pending in the engine, so a registered result would be unreliable.",
        patch: { extraMonthlySaving: 500, savingAccount: "NONREG", savingOwner: owner },
      });
    }
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
    const names = [
      ...new Set(locked.map((a) => (a.juris ? unlockRule(a.juris).name : "not yet specified"))),
    ].join(", ");
    out.push({
      id: "unlock",
      theme: "Locked-in money",
      title: "Unlocking locked-in money (informational)",
      why: "Unlocking can remove the annual maximum-withdrawal limit that applies to a LIF, but the mechanism is set by the pension jurisdiction, not by a general rule.",
      change: "No change is applied.",
      tradeoffs: `Pension jurisdiction on file: ${names}. Manitoba, Federal, Ontario and Quebec differ materially in the destination vehicle (for example a prescribed RRIF versus an RRSP), the qualifying ages, the percentage limits and whether the right can be used more than once. Until each jurisdiction's exact mechanism is implemented and tested in this app, unlocking is shown for information only and is never simulated as a generic percentage.`,
    });
  }


  return out;
}
