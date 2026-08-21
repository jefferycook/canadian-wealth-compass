/**
 * Batch 0C — locked-in safety.
 *
 * Canonical spec v1.2 FINAL + Erratum 4 / §13.2a: no Ontario fallback,
 * Manitoba's sequential entitlements with a PRRIF destination, Saskatchewan
 * UNSUPPORTED, Quebec's age-gated maximum, and component-level rule metadata.
 */

import { describe, expect, it } from "vitest";
import { projection } from "./projection";
import {
  ON_LIF_MAX,
  UNLOCK_COMPONENTS,
  UNLOCK_RULES,
  componentStatus,
  lifMaximumFor,
  maxUnlockPctAtAge,
  recordStatus,
  tryUnlockRule,
  unlockRule,
} from "./registered";
import { lockedInGoldenFixturePlan, regressionFixturePlan } from "./fixtures";
import type { AccountInput, JurisdictionKey, PlanInputs } from "./types";

function lockedInPlan(juris: JurisdictionKey, unlockPct: number): PlanInputs {
  const base = regressionFixturePlan();
  const lira: AccountInput = {
    id: "acc_lira",
    name: "LIRA",
    type: "LIRA",
    owner: "A",
    bal: 400000,
    acb: 0,
    eq: 50,
    mix: { int: 1, div: 0, cg: 0 },
    conv: 55,
    unlock: unlockPct,
    juris,
    contrib: 0,
    contribEnd: 0,
    wd: 0,
    wdStart: 0,
    wdEnd: 0,
  };
  return {
    ...base,
    people: [{ ...base.people[0]!, curAge: 54, retAge: 55 }],
    accounts: [lira],
  };
}

describe("Batch 0C — no silent Ontario fallback", () => {
  it("throws for an unknown pension jurisdiction instead of using Ontario", () => {
    expect(() => unlockRule(undefined)).toThrow(/Unsupported pension jurisdiction/);
    expect(() => unlockRule("XX" as JurisdictionKey)).toThrow(
      /Unsupported pension jurisdiction/,
    );
    expect(tryUnlockRule("XX" as JurisdictionKey)).toBeUndefined();
  });

  it("does not resolve an unknown jurisdiction to the Ontario rule", () => {
    expect(tryUnlockRule(undefined)).not.toBe(UNLOCK_RULES.ON);
  });
});

describe("Batch 0C — Manitoba sequential entitlements", () => {
  it("unlocks 50% at 55 and then the remaining balance at 65", () => {
    const P = projection(lockedInPlan("MB", 100));
    const destId = "acc_lira_unlk";
    const rowAt = (age: number) => P.rows.find((r) => r.age === age)!;

    // Before 55 nothing is unlocked.
    expect(rowAt(54).balances[destId] ?? 0).toBe(0);

    const at55 = rowAt(55);
    const locked55 = at55.balances["acc_lira"] ?? 0;
    const unlocked55 = at55.balances[destId] ?? 0;
    expect(unlocked55).toBeGreaterThan(0);
    // Half the locked money moved; the remainder is still locked.
    expect(locked55).toBeGreaterThan(0);
    // Two-sided band. The exact-50% property is asserted structurally by
    // `maxUnlockPctAtAge(UNLOCK_RULES.MB, 55) === 50`; this projection-level
    // check is only a sanity band around it, loose because both sides then
    // grow and pay minimums before year end. A one-sided floor would stay
    // green even if the engine unlocked 90%.
    const share55 = unlocked55 / (locked55 + unlocked55);
    // Observed 0.369: the PRRIF pays its RRIF minimum in the unlock year while
    // the locked side keeps compounding, so the year-end share sits below the
    // statutory 50%. The band is set around that, and the upper bound is the
    // part that matters — it can never be satisfied by a 90% unlock.
    expect(share55).toBeGreaterThan(0.3);
    expect(share55).toBeLessThan(0.45);

    // The age-65 entitlement is a SECOND event: the locked remainder goes to zero.
    const at65 = rowAt(65);
    expect(at65.balances["acc_lira"] ?? 0).toBeLessThan(1);
    expect(at65.balances[destId] ?? 0).toBeGreaterThan(0);
  });

  it("lands unlocked Manitoba money in a PRRIF that forces RRIF minimums before 71", () => {
    const P = projection(lockedInPlan("MB", 50));
    const dest = P.acctMeta.find((a) => a.id === "acc_lira_unlk");
    expect(dest?.type).toBe("PRRIF");
    expect(dest?.name).toContain("PRRIF");

    // A PRRIF pays minimums immediately, so registered income is forced well
    // before the age-71 RRIF conversion.
    const at60 = P.rows.find((r) => r.age === 60)!;
    expect(at60.regWithdraw).toBeGreaterThan(0);
  });

  it("keeps the Manitoba full-unlock entitlement after a partial unlock (no one-shot flag)", () => {
    expect(maxUnlockPctAtAge(UNLOCK_RULES.MB, 55)).toBe(50);
    expect(maxUnlockPctAtAge(UNLOCK_RULES.MB, 65)).toBe(100);
  });
});

describe("Batch 0C — Saskatchewan is UNSUPPORTED", () => {
  it("refuses SK unlocking, withholds the result and substitutes nothing", () => {
    const P = projection(lockedInPlan("SK", 100));
    expect(P.lockedInDisclosures.join(" ")).toMatch(/not yet supported/i);
    // No unlock account was created, and no PRRIF behaviour appeared.
    expect(P.acctMeta.some((a) => a.id === "acc_lira_unlk")).toBe(false);
    expect(P.acctMeta.some((a) => a.type === "PRRIF")).toBe(false);
    // The rest of the projection still runs.
    expect(P.rows.length).toBeGreaterThan(0);
    expect(P.rows.some((r) => r.tax > 0)).toBe(true);
  });

  it("reports every SK component as UNSUPPORTED", () => {
    for (const c of UNLOCK_COMPONENTS) expect(componentStatus("SK", c)).toBe("UNSUPPORTED");
    expect(recordStatus("SK")).toBe("UNSUPPORTED");
    expect(lifMaximumFor("SK", 60, 6).status).toBe("UNSUPPORTED");
    expect(lifMaximumFor("SK", 60, 6).applies).toBe(false);
  });
});

describe("Batch 0C — Quebec maximum is age-gated", () => {
  it("applies a maximum at 54 and none at 55+", () => {
    const at54 = lifMaximumFor("QC", 54, 6);
    const at55 = lifMaximumFor("QC", 55, 6);
    expect(at54.applies).toBe(true);
    expect(at54.pct).toBeGreaterThan(0);
    expect(at55.applies).toBe(false);
  });

  it("flags the under-55 maximum as APPROXIMATE and the 55+ rule as VERIFIED", () => {
    expect(lifMaximumFor("QC", 54, 6).status).toBe("APPROXIMATE");
    expect(lifMaximumFor("QC", 56, 6).status).toBe("VERIFIED");
  });
});

describe("Batch 0C — Ontario LIF maximum", () => {
  it("matches the FSRA table at ages 55, 65, 75 and 85 and is VERIFIED", () => {
    for (const age of [55, 65, 75, 85]) {
      const r = lifMaximumFor("ON", age, 6);
      expect(r.applies).toBe(true);
      expect(r.pct).toBeCloseTo(ON_LIF_MAX[age]!, 6);
      expect(r.status).toBe("VERIFIED");
    }
  });
});

describe("Batch 0C — unlocking follows pension jurisdiction, not residence", () => {
  it("uses Ontario rules for an Ontario LIRA held by a BC resident", () => {
    const plan = lockedInPlan("ON", 100);
    plan.tax = { ...plan.tax, provinceKey: "BC" };
    const P = projection(plan);
    const at56 = P.rows.find((r) => r.age === 56)!;
    const locked = at56.balances["acc_lira"] ?? 0;
    const unlocked = at56.balances["acc_lira_unlk"] ?? 0;
    // Ontario permits 50%; BC (residence) permits none.
    expect(unlocked).toBeGreaterThan(0);
    expect(locked).toBeGreaterThan(0);
    const destType = P.acctMeta.find((a) => a.id === "acc_lira_unlk")?.type;
    expect(destType).toBe("RRSP");
  });

  it("performs no unlock for a BC pension jurisdiction", () => {
    const P = projection(lockedInPlan("BC", 100));
    expect(P.acctMeta.some((a) => a.id === "acc_lira_unlk")).toBe(false);
  });
});

describe("Batch 0C — rule metadata is complete", () => {
  it("gives every rule record a source, verifiedDate and status per component", () => {
    for (const [key, r] of Object.entries(UNLOCK_RULES)) {
      expect(r.name.length, key).toBeGreaterThan(0);
      expect(r.notes.length, key).toBeGreaterThan(0);
      for (const c of UNLOCK_COMPONENTS) {
        const comp = r[c];
        expect(comp.source.title.length, `${key}.${c}.source.title`).toBeGreaterThan(0);
        expect(comp.source.publisher.length, `${key}.${c}.publisher`).toBeGreaterThan(0);
        expect(comp.source.url.length, `${key}.${c}.url`).toBeGreaterThan(0);
        expect(comp.verifiedDate, `${key}.${c}.verifiedDate`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(
          ["VERIFIED", "APPROXIMATE", "UNSUPPORTED"],
          `${key}.${c}.status`,
        ).toContain(comp.status);
      }
    }
  });

  it("carries the federal RLIF procedural metadata", () => {
    const fed = UNLOCK_RULES.FED;
    expect(fed.requiresVehicle).toBe("RLIF");
    expect(fed.transferWindowDays).toBe(60);
    expect(fed.partialPct).toBe(50);
    expect(fed.oneTime).toBe(true);
    expect(fed.notes).toMatch(/no carry-forward/i);
  });

  it("derives recordStatus as the worst component status, for display only", () => {
    expect(recordStatus("ON")).toBe("VERIFIED");
    expect(recordStatus("QC")).toBe("APPROXIMATE");
    expect(recordStatus("SK")).toBe("UNSUPPORTED");
  });
});

describe("Batch 0C — saved-plan compatibility", () => {
  it("migrates a legacy _split flag to unlockedFraction and does not re-unlock", () => {
    const plan = lockedInPlan("ON", 50);
    (plan.accounts[0] as AccountInput & { _split?: boolean })._split = true;
    const P = projection(plan);
    // The legacy flag says the 50% has already been taken, so no new unlock
    // account is created.
    expect(P.acctMeta.some((a) => a.id === "acc_lira_unlk")).toBe(false);
  });

  it("loads an account whose jurisdiction is now unsupported without throwing", () => {
    expect(() => projection(lockedInPlan("SK", 0))).not.toThrow();
  });
});

describe("Batch 0C follow-up — jurisdiction verification, 2026-08-21", () => {
  it("Alberta: 50% from age 50 to an RRSP, VERIFIED against the Superintendent", () => {
    const r = UNLOCK_RULES.AB;
    expect(r.partialPct).toBe(50);
    expect(r.partialMinAge).toBe(50);
    expect(r.destinationType).toBe("RRSP");
    expect(r.oneTime).toBe(true);
    expect(r.unlockEntitlement.status).toBe("VERIFIED");
    expect(r.destinationVehicle.status).toBe("VERIFIED");
    expect(r.unlockEntitlement.source.tier).toBe(1);
    // The maximum table is still an approximation — promotion is component-wise.
    expect(r.lifMaximum.status).toBe("APPROXIMATE");
    expect(r.notes).toMatch(/20% of YMPE/);
    expect(r.notes).toMatch(/LIF\/LITB/);
  });

  it("Nova Scotia: 50% at 55 through a Schedule 4A LIF within 60 days", () => {
    const r = UNLOCK_RULES.NS;
    expect(r.partialPct).toBe(50);
    expect(r.partialMinAge).toBe(55);
    expect(r.requiresVehicle).toBe("ScheduleLIF");
    expect(r.transferWindowDays).toBe(60);
    expect(r.unlockEntitlement.status).toBe("VERIFIED");
    expect(r.destinationVehicle.status).toBe("VERIFIED");
    expect(r.lifMaximum.status).toBe("APPROXIMATE");
  });

  it("British Columbia: a VERIFIED absence of any 50% unlocking entitlement", () => {
    const r = UNLOCK_RULES.BC;
    expect(r.partialPct).toBe(0);
    expect(r.partialMinAge).toBe(999);
    expect(r.unlockEntitlement.status).toBe("VERIFIED");
    expect(r.destinationVehicle.status).toBe("VERIFIED");
    expect(r.unlockEntitlement.source.publisher).toMatch(/BCFSA|BC Financial/);
    expect(maxUnlockPctAtAge(r, 70)).toBe(0);
  });

  it("New Brunswick: withdrawn as UNSUPPORTED, nothing substituted", () => {
    const r = UNLOCK_RULES.NB;
    for (const k of UNLOCK_COMPONENTS) expect(r[k].status).toBe("UNSUPPORTED");
    expect(r.partialPct).toBe(0);
    expect(r.partialMinAge).toBe(999);
    expect(recordStatus("NB")).toBe("UNSUPPORTED");
    expect(lifMaximumFor("NB", 65, 6).status).toBe("UNSUPPORTED");
    expect(r.notes).toMatch(/lesser of three times the annual amount/i);
    expect(r.notes).toMatch(/RRIF/);
  });

  it("New Brunswick withholds the unlock and discloses it rather than throwing", () => {
    const P = projection(lockedInPlan("NB", 50));
    expect(P.lockedInDisclosures.join(" ")).toMatch(/not yet supported/i);
  });

  it("lifMaximumFor reports the component status, not a hard-coded jurisdiction", () => {
    expect(lifMaximumFor("ON", 65, 6).status).toBe(UNLOCK_RULES.ON.lifMaximum.status);
    expect(lifMaximumFor("AB", 65, 6).status).toBe(UNLOCK_RULES.AB.lifMaximum.status);
  });

  it("discloses an APPROXIMATE unlocking entitlement, not only the destination", () => {
    // QC/ON are verified; pick a jurisdiction whose entitlement is still carried.
    const approx = (Object.keys(UNLOCK_RULES) as (keyof typeof UNLOCK_RULES)[]).find(
      (k) =>
        UNLOCK_RULES[k].unlockEntitlement.status === "APPROXIMATE" &&
        UNLOCK_RULES[k].partialPct > 0,
    );
    if (!approx) return; // every entitlement verified — nothing to disclose.
    const P = projection(lockedInPlan(approx, 50));
    expect(P.lockedInDisclosures.join(" ")).toMatch(
      /unlocking percentage .* have not been confirmed with the regulator/i,
    );
  });
});

/**
 * Phase 0 exit criterion 2 (§12) requires a locked-in golden alongside the
 * single, couple and accumulation anchors. Pinned 2026-08-21.
 */
describe("Batch 0C — locked-in golden fixture (Phase 0 exit #2)", () => {
  const LOCKEDIN_GOLDEN_TAX = 111905;
  const LOCKEDIN_GOLDEN_TERMINAL = 144512;

  it("reproduces the locked-in lifetime-tax and terminal-portfolio anchors", () => {
    const r = projection(lockedInGoldenFixturePlan());
    const lifetime = r.rows.reduce((s, x) => s + x.tax, 0);
    expect(Math.round(lifetime)).toBe(LOCKEDIN_GOLDEN_TAX);
    expect(Math.round(r.rows[r.rows.length - 1]!.totalPortfolio)).toBe(
      LOCKEDIN_GOLDEN_TERMINAL,
    );
  });

  it("is a funded plan, so the anchor measures rules and not a failure mode", () => {
    const r = projection(lockedInGoldenFixturePlan());
    expect(r.rows.some((x) => x.fundingShortfall)).toBe(false);
    expect(r.rows.some((x) => x.lifBound)).toBe(false);
    expect(r.rows.length).toBe(37);
  });

  it("takes Manitoba's two entitlements sequentially, 50% at 55 then the balance at 65", () => {
    const r = projection(lockedInGoldenFixturePlan());
    const at = (age: number) => r.rows.find((x) => x.age === age)!;
    const locked = (age: number) => at(age).balances["acc_lira"] ?? 0;
    const unlocked = (age: number) => at(age).balances["acc_lira_unlk"] ?? 0;

    // 54: still a LIRA, nothing unlocked — the conversion age has not arrived.
    expect(unlocked(54)).toBe(0);
    // 55: exactly half of the year's locked balance moves.
    expect(unlocked(55)).toBeGreaterThan(0);
    expect(unlocked(55) / (unlocked(55) + locked(55))).toBeCloseTo(0.5, 6);
    // 56-64: the 50% cap holds; the second entitlement is not yet available.
    expect(locked(64)).toBeGreaterThan(0);
    // 65: the remainder moves as an INCREMENT on the same account. A one-shot
    // flag would leave this money locked for life.
    expect(locked(65)).toBeCloseTo(0, 6);
    expect(unlocked(65)).toBeGreaterThan(unlocked(64));
  });

  it("routes unlocked Manitoba money to a PRRIF, not an RRSP", () => {
    const r = projection(lockedInGoldenFixturePlan());
    expect(r.acctMeta.find((a) => a.id === "acc_lira_unlk")?.type).toBe("PRRIF");
    // The source account is a LIF by then, not still a LIRA.
    expect(r.acctMeta.find((a) => a.id === "acc_lira")?.type).toBe("LIF");
  });

  it("is load-bearing: withholding the 65 entitlement moves the anchor", () => {
    const p = lockedInGoldenFixturePlan();
    const capped: PlanInputs = {
      ...p,
      accounts: p.accounts.map((a) =>
        a.id === "acc_lira" ? { ...a, unlock: 50 } : a,
      ),
    };
    const lifetime = projection(capped).rows.reduce((s, x) => s + x.tax, 0);
    expect(Math.round(lifetime)).not.toBe(LOCKEDIN_GOLDEN_TAX);
    // Directional, not just different: leaving money locked defers tax.
    expect(lifetime).toBeLessThan(LOCKEDIN_GOLDEN_TAX);
  });
});
