/**
 * The year-by-year retirement projection engine.
 *
 * This is the heart of the tool, ported from the original with one structural
 * change: it takes a typed `PlanInputs` object instead of reading the DOM.
 * That inversion is what makes the engine testable, storable and reusable for
 * scenarios. The financial logic itself is unchanged.
 *
 * Each simulated year, in order:
 *   1. Roll a deceased spouse's accounts to the survivor
 *   2. Unlock eligible locked-in money into an RRSP
 *   3. Compute guaranteed income (CPP, OAS, pensions, bridge, survivor benefits)
 *   4. Grow accounts and accrue non-registered yield
 *   5. Apply contributions and lump-sum inflows
 *   6. Take mandatory RRIF/LIF minimums, then scheduled withdrawals
 *   7. Appreciate hard assets; handle downsizes and sales
 *   8. Accrue liability interest and apply payments
 *   9. Solve for the discretionary draw that meets the after-tax spending target
 */

import { cppFactor, cppSurvivorBenefit, oasFactor } from "./benefits";
import {
  lifMaximumFor,
  maxUnlockPctAtAge,
  rrifMinFactor,
  tryUnlockRule,
} from "./registered";
import { approxMarginal, householdTax } from "./tax";
import {
  getTaxYear,
  indexationFactor,
  LATEST_TAX_YEAR,
  type TaxYear,
} from "./taxYears";
import { strategyOrder } from "./strategy";
import { bridgeIsPensionEligible } from "./types";
import {
  PersonRoomLedger,
  spousalRrspDisclosure,
  type PersonRoomYear,
} from "./room";

import type {

  AccountInput,
  AccountType,
  IncomeComponents,

  PersonInput,
  PlanInputs,
  ProjectionOverride,
  ProjectionResult,
  ProjectionRow,
  WorkingAccount,
  WorkingAsset,
} from "./types";

/** Resolve an account's blended expected return from its equity allocation. */
function accountReturn(a: AccountInput, eqRet: number, fiRet: number): number {
  if (a.retOverride != null && Number.isFinite(a.retOverride)) return a.retOverride;
  const eq = Math.max(0, Math.min(100, a.eq)) / 100;
  return eq * eqRet + (1 - eq) * fiRet;
}

/** Whether the plan is a two-person household. */
export function isCouple(inputs: PlanInputs): boolean {
  return inputs.planType !== "single" && inputs.people.length > 1;
}

/**
 * Married and common-law partners are spouses for pension income splitting and
 * for the CPP survivor's pension. "Partners" get neither.
 */
export function spousalRights(inputs: PlanInputs): {
  couple: boolean;
  canSplit: boolean;
  cppSurvEligible: boolean;
} {
  const couple = isCouple(inputs);
  const spousal = couple && inputs.planType !== "partners";
  return { couple, canSplit: spousal, cppSurvEligible: spousal };
}

export function projection(
  inputs: PlanInputs,
  override: ProjectionOverride = {},
): ProjectionResult {
  // Batch 0D: the indexation rate defaults to the plan's inflation assumption
  // and is overridable per plan. Published tax years are never indexed.
  const idxRate =
    inputs.indexationRate != null && Number.isFinite(inputs.indexationRate)
      ? inputs.indexationRate
      : inputs.inflation;
  const ty: TaxYear = getTaxYear(inputs.taxYear, idxRate);
  const goalSaves =
    override.goalSaves ?? (override.goalSave ? [override.goalSave] : []);

  const infl = inputs.inflation;
  const provinceKey = inputs.tax.provinceKey;
  const spend0 =
    override.spendSet != null
      ? override.spendSet
      : inputs.spendNeed + (override.spendAdj ?? 0);
  const fiRetGlobal = inputs.fiRet;
  // Spending while still working. Null means the client never told us, so the
  // retirement figure is used for every year, as it always was.
  const curSpend0 =
    inputs.currentSpend != null
      ? Math.max(0, inputs.currentSpend + (override.currentSpendAdj ?? 0))
      : null;
  const shocks = override.shocks ?? [];
  const strategy = override.strategy ?? inputs.strategy;
  const opts = inputs.tax;

  const { couple, canSplit, cppSurvEligible } = spousalRights(inputs);

  // Deep-copy people so scenario hooks and the run itself cannot mutate inputs.
  const people: PersonInput[] = inputs.people
    .slice(0, couple ? 2 : 1)
    .map((p) => ({
      ...p,
      cpp: { ...p.cpp },
      oas: { ...p.oas },
      pen: { ...p.pen },
      bridge: { ...p.bridge },
      deathAge: couple ? p.deathAge : 0,
    }));

  if (override.retAdj) {
    for (const p of people) {
      if (p.retAge < 900) p.retAge = Math.max(p.curAge, p.retAge + override.retAdj);
    }
  }
  override.mods?.(people);

  const pIndex: Record<string, number> = {};
  people.forEach((p, i) => {
    pIndex[p.id] = i;
  });

  const accts: WorkingAccount[] = inputs.accounts.map((a) => {
    // Saved-plan compatibility (Batch 0C): the retired one-shot `_split`
    // boolean becomes a cumulative unlocked fraction. `true` means the
    // account's previous unlock percentage was already taken (1.0 when the
    // percentage is not recoverable); absent/false means nothing is unlocked.
    const legacySplit = (a as AccountInput & { _split?: boolean })._split === true;
    const unlockedFraction = legacySplit
      ? a.unlock > 0
        ? Math.min(1, a.unlock / 100)
        : 1
      : 0;
    return {
      ...a,
      mix: { ...a.mix },
      ret: accountReturn(a, inputs.eqRet, inputs.fiRet),
      owner: couple && (a.owner === "B" || a.owner === "JOINT") ? a.owner : "A",
      unlockedFraction,
    };
  });
  override.acctMod?.(accts);

  /** Owner index into the people/P arrays. */
  const oi = (a: WorkingAccount) => pIndex[a.owner] ?? 0;

  /**
   * Joint non-registered accounts split taxable income 50/50 between spouses;
   * everything else belongs to a single owner.
   */
  const splitOf = (a: WorkingAccount): [number, number][] =>
    a.type === "NONREG" && a.owner === "JOINT" && couple && people.length === 2
      ? [
          [0, 0.5],
          [1, 0.5],
        ]
      : [[pIndex[a.owner] ?? 0, 1]];

  /** RRSP converts to a RRIF by 71; LIRA/DC convert to a LIF at retirement. */
  const convAgeOf = (a: WorkingAccount) =>
    a.conv > 0
      ? a.conv
      : a.type === "RRSP"
        ? 71
        : people[pIndex[a.owner] ?? 0]!.retAge || 71;

  const expenses = inputs.expenses;
  const otherInc = inputs.otherIncome;
  const lumps = inputs.lumpSums;
  const assets: WorkingAsset[] = inputs.hardAssets.map((a) => ({
    ...a,
    sold: false,
  }));
  override.assetMod?.(assets);
  const liabs = inputs.liabilities.map((l) => ({ ...l }));

  const curAgeA = people[0]!.curAge;
  const endAge = inputs.endAge;
  const startYear = new Date().getFullYear();

  /* --- Batch 0B: per-person TFSA / RRSP room ledgers --- */
  const ledgers = people.map(
    (p) =>
      new PersonRoomLedger(p, {
        planStartYear: startYear,
        inflation: infl,
        // Membership in a workplace plan means a pension adjustment consumes
        // RRSP room; PA is never silently assumed to be zero. A LIRA is NOT
        // evidence of membership — it is locked-in money from a FORMER
        // employer, and by itself implies no current-year PA.
        // LIMITATION: the input model records a DB pension amount and an
        // employer DC account, but has no explicit "currently a member of a
        // registered pension plan" flag, so a DB pension entitlement that has
        // already stopped accruing is still treated as membership here.
        pensionMember:
          p.pen.amt > 0 || accts.some((a) => a.owner === p.id && a.type === "DCPP"),

      }),
  );
  const roomDisclosures = new Set<string>();
  /** Batch 0C locked-in disclosures (withheld / approximate), point-of-use. */
  const lockedInDisclosures = new Set<string>();
  const taxYearDisclosures = new Set<string>();
  /** The most recent closed year of each person's ledger. */
  let lastClosedRoom: PersonRoomYear[] = [];
  const roomValidationErrors = ledgers.flatMap((l) => l.validationErrors);

  const rows: ProjectionRow[] = [];
  // Whether the household has ever held investable assets. A plan that starts
  // with nothing invested cannot "run out" of investments — that is an intake
  // state, not a failure.
  let everHadPortfolio = accts.reduce((s, a) => s + Math.max(0, a.bal), 0) > 1;


  for (let off = 0; off <= endAge - curAgeA; off++) {
    const yr = startYear + off;
    const infFac = Math.pow(1 + infl, off);
    // Batch 0D: statutory amounts are indexed past the last published table
    // rather than frozen, so a flat-real income does not drift into higher
    // brackets over a 30-year projection.
    const tyY = getTaxYear(yr, idxRate);
    const idxFac = indexationFactor(LATEST_TAX_YEAR, yr, idxRate);
    // The client's own statutory overrides (BPA, OAS threshold) are amounts
    // that index in law, so they index with the table they were taken from.
    const optsY: TaxSettings =
      idxFac === 1
        ? opts
        : {
            ...opts,
            fedBPA: opts.fedBPA * idxFac,
            provBPA: opts.provBPA * idxFac,
            oasThresh: opts.oasThresh * idxFac,
          };
    if (tyY.derivedFrom != null) {
      taxYearDisclosures.add(
        `Tax years after ${tyY.derivedFrom} are indexed from the published ${tyY.derivedFrom} table at ${(idxRate * 100).toFixed(1)}% per year (APPROXIMATE): brackets, personal amounts, the age and pension amounts and the OAS recovery threshold. Published years are exact.`,
      );
    }
    const ages = people.map((p) => p.curAge + off);
    const alive = people.map((p) => !(p.deathAge > 0 && p.curAge + off >= p.deathAge));

    /* --- 1. Spousal rollover at the year of passing (tax-free) --- */
    let deathBenefit = 0;
    if (couple) {
      people.forEach((p, i) => {
        if (p.deathAge > 0 && p.curAge + off === p.deathAge) {
          if (cppSurvEligible && p.cpp.amt > 0) deathBenefit += ty.cppDeathBenefit;
          const survId = people[(i + 1) % 2]!.id;
          // The deceased's accounts roll to the survivor; joint accounts pass
          // wholly by right of survivorship.
          for (const a of accts) {
            if (a.owner === p.id || a.owner === "JOINT") a.owner = survId;
          }
        }
      });
    }

    /* --- 2. LIRA/LIF unlock, governed by the money's pension jurisdiction --- */
    // Batch 0C: entitlements are SEQUENTIAL. Each year every locked-in account
    // is re-evaluated against the age-appropriate maximum and only the
    // incremental fraction is moved, so Manitoba's 50%-at-55 and its
    // balance-at-65 are both available to the same client.
    for (const a of [...accts]) {
      if (!(a.type === "LIRA" || a.type === "DCPP" || a.type === "LIF")) continue;
      const jr = tryUnlockRule(a.juris);
      // No silent Ontario default. An unknown jurisdiction, or one whose
      // unlocking entitlement is UNSUPPORTED, has its unlock WITHHELD — the
      // rest of the client's projection and tax are unaffected (§13.2a).
      if (!jr || jr.unlockEntitlement.status === "UNSUPPORTED") {
        if ((override.unlockAll ?? a.unlock ?? 0) > 0 || !jr) {
          lockedInDisclosures.add(
            `Pension jurisdiction ${a.juris ?? "(not specified)"} is not yet supported: unlocking for "${
              a.name || a.type
            }" is withheld. No other jurisdiction's rule is substituted.`,
          );
        }
        continue;
      }
      const idx = pIndex[a.owner] ?? 0;
      const ageNow = people[idx]!.curAge + off;
      const maxPct = maxUnlockPctAtAge(jr, ageNow);
      if (maxPct <= 0) continue;
      const desired = override.unlockAll != null ? override.unlockAll : a.unlock || 0;
      if (desired <= 0) continue;
      // Cumulative target fraction of the ORIGINAL locked-in money.
      const target = Math.min(desired, maxPct) / 100;
      const already = a.unlockedFraction ?? 0;
      if (target <= already + 1e-9) continue;
      const uAge =
        a.type === "LIF"
          ? Math.max(jr.partialMinAge, people[idx]!.curAge)
          : Math.max(jr.partialMinAge, convAgeOf(a));
      if (ageNow < uAge) continue;

      // The incremental share is taken from what remains locked. Moving from
      // `already` to `target` of the original balance means taking
      // (target - already) / (1 - already) of the CURRENT locked balance.
      const remainingFrac = Math.max(0, 1 - already);
      const takeFrac =
        remainingFrac <= 1e-9 ? 0 : Math.min(1, (target - already) / remainingFrac);
      const moved = a.bal * takeFrac;
      if (moved <= 0.01) {
        a.unlockedFraction = target;
        continue;
      }
      a.bal -= moved;
      a.unlockedFraction = target;
      if (jr.destinationVehicle.status === "APPROXIMATE") {
        lockedInDisclosures.add(
          `${jr.name}: the destination vehicle for unlocked locked-in money is modelled as an ${jr.destinationType} but has not been verified against the regulator.`,
        );
      }
      const dest = accts.find((d) => d.id === a._unlockDestId);
      if (dest) {
        dest.bal += moved;
        dest.acb += moved;
      } else {
        const destId = a.id + "_unlk";
        a._unlockDestId = destId;
        accts.push({
          id: destId,
          name:
            (a.name || "LIRA") +
            (jr.destinationType === "PRRIF"
              ? " (unlocked\u2192PRRIF)"
              : " (unlocked\u2192RRSP)"),
          type: jr.destinationType,
          owner: a.owner,
          bal: moved,
          acb: moved,
          ret: a.ret,
          eq: a.eq,
          mix: a.mix ?? { int: 0.25, div: 0.25, cg: 0.5 },
          juris: a.juris,
          conv: 0,
          unlock: 0,
          contrib: 0,
          contribEnd: 0,
          wd: 0,
          wdStart: 0,
          wdEnd: 0,
          unlockedFraction: 0,
        });
      }
      if (a.type !== "LIF") a.type = "LIF"; // the still-locked remainder
    }

    /* --- 3. Raw per-person guaranteed income, as if alive --- */
    const raw = people.map((p, i) => {
      const age = ages[i]!;
      // Amounts are entered as the age-65 entitlement and adjusted for start age.
      const rawCpp =
        age >= p.cpp.age
          ? p.cpp.amt * cppFactor(p.cpp.age) * Math.pow(1 + infl, age - p.cpp.age)
          : 0;
      let rawOas = 0;
      if (age >= p.oas.age) {
        let base = p.oas.amt * oasFactor(p.oas.age); // deferral bonus
        if (age >= 75) base *= 1.1; // 10% boost at 75+
        rawOas = base * Math.pow(1 + infl, age - p.oas.age);
      }
      const rawPen =
        age >= p.pen.age ? p.pen.amt * Math.pow(1 + infl, age - p.pen.age) : 0;
      const base65 = p.cpp.amt * infFac; // survivor-benefit basis
      const employInc = age < (p.retAge || 999) ? p.employ * infFac : 0;
      // Bridge benefit runs from retirement until it ends, usually at 65.
      const bridgeInc =
        p.bridge && p.bridge.amt > 0 && age >= (p.retAge || 999) && age < (p.bridge.end || 65)
          ? p.bridge.amt * infFac
          : 0;
      return { rawCpp, rawOas, rawPen, base65, employInc, bridgeInc };
    });

    interface Accum {
      age: number;
      cppInc: number;
      oasFull: number;
      penInc: number;
      employInc: number;
      bridgeInc: number;
      nonregInterest: number;
      nonregDiv: number;
      /** Mandatory RRIF/LIF minimums. Always RRIF-status cash by construction. */
      mandatoryTaxable: number;
      /** Scheduled withdrawals from accounts in RRIF/LIF status this year. */
      schedRrifCash: number;
      /** Scheduled registered withdrawals that are NOT RRIF-status (plain RRSP, etc.). */
      schedRrspCash: number;

      schedTfsaCash: number;
      schedNonregCash: number;
      schedNonregGain: number;
    }

    // A deceased person has no personal income. The survivor keeps a share of
    // the deceased's DB pension and the CPP survivor's pension; OAS ends.
    const P: Accum[] = people.map((_p, i) => {
      const base: Accum = {
        age: ages[i]!,
        cppInc: 0,
        oasFull: 0,
        penInc: 0,
        employInc: 0,
        bridgeInc: 0,
        nonregInterest: 0,
        nonregDiv: 0,
        mandatoryTaxable: 0,
        schedRrifCash: 0,
        schedRrspCash: 0,

        schedTfsaCash: 0,
        schedNonregCash: 0,
        schedNonregGain: 0,
      };
      if (!alive[i]) return base;
      let cppInc = raw[i]!.rawCpp;
      let penInc = raw[i]!.rawPen;
      if (couple) {
        const j = (i + 1) % 2;
        if (!alive[j]) {
          if (cppSurvEligible) {
            cppInc += cppSurvivorBenefit(
              raw[j]!.base65,
              ages[i]!,
              raw[i]!.rawCpp,
              infFac,
              ty,
            );
          }
          penInc += inputs.survivorPct * raw[j]!.rawPen;
        }
      }
      return {
        ...base,
        cppInc,
        oasFull: raw[i]!.rawOas,
        penInc,
        employInc: raw[i]!.employInc,
        bridgeInc: raw[i]!.bridgeInc,
      };
    });

    /* --- 4. Grow accounts and accrue non-registered yield --- */
    // During a market shock the equity share earns the shock return instead of
    // the expected return.
    const activeShock = shocks.find(
      (s) => ages[0]! >= s.age && ages[0]! < s.age + (s.years || 1),
    );
    const retDelta = override.retDelta ?? 0;
    for (const a of accts) {
      let rate = a.ret + retDelta;
      if (activeShock) {
        const eq = (a.eq || 0) / 100;
        rate = eq * (activeShock.pct / 100) + (1 - eq) * fiRetGlobal + retDelta;
      }
      const growth = a.bal * rate;
      if (a.type === "NONREG" && growth > 0) {
        const i = growth * a.mix.int;
        const d = growth * a.mix.div;
        for (const [idx, fr] of splitOf(a)) {
          P[idx]!.nonregInterest += i * fr;
          P[idx]!.nonregDiv += d * fr;
        }
        a.acb += i + d;
        a.bal += growth;
      } else {
        // In loss years no taxable yield accrues; the loss stays unrealized.
        a.bal += growth;
      }
    }

    /* --- 5. Room ledgers, contributions and lump sums --- */
    // The ledger opens before any contribution is applied. Earned income for
    // the year creates room on January 1 of the FOLLOWING year, never this one.
    ledgers.forEach((l, i) => l.openYear(yr, ages[i]!, alive[i] ? raw[i]!.employInc : 0));

    /** Place money in an account through the owner's room ledger. */
    const placeInAccount = (
      a: WorkingAccount,
      amount: number,
      source: "asserted" | "generated",
      countAsContribution: boolean,
    ): number => {
      const idx = oi(a);
      const led = ledgers[idx];
      let applied = amount;
      if (led) {
        if (a.type === "TFSA") applied = led.contributeTfsa(amount, source);
        else if (a.type === "RRSP") applied = led.contributeRrsp(amount, source);
      }
      if (applied <= 0) return 0;
      a.bal += applied;
      if (a.type === "NONREG") a.acb += applied;
      if (countAsContribution) {
        contribTotal += applied;
        contribBy[a.id] = (contribBy[a.id] ?? 0) + applied;
      }
      return applied;
    };

    /** Apply a contribution through the owner's ledger, and return what stuck. */
    const applyContribution = (
      a: WorkingAccount,
      amount: number,
      source: "asserted" | "generated",
    ): number => placeInAccount(a, amount, source, true);

    let contribTotal = 0;
    const contribBy: Record<string, number> = {};
    for (const a of accts) {
      if (a.contrib > 0 && (a.contribEnd === 0 || ages[oi(a)]! <= a.contribEnd)) {
        // Client-asserted: a statement of fact about the client's own life.
        // Honoured even when room is unknown; flagged, never silently re-routed.
        applyContribution(a, a.contrib * infFac, "asserted");
      }
    }
    // Engine-generated saving (goal solver, levers, recommendations). These are
    // advice, so they may only use KNOWN legal room, and overflow cascades
    // TFSA -> RRSP -> non-registered.
    const CASCADE: readonly AccountType[] = ["TFSA", "RRSP", "NONREG"];
    /** Walk the approved cascade from `startType`, returning what is left. */
    const cascadePlace = (
      ownerIdx: number,
      startType: AccountType,
      amount: number,
      source: "asserted" | "generated",
      countAsContribution: boolean,
    ): number => {
      const start = CASCADE.indexOf(startType);
      const order: AccountType[] =
        start >= 0 ? [...CASCADE.slice(start)] : [startType, "NONREG"];
      let remaining = amount;
      for (const type of order) {
        if (remaining <= 0.005) break;
        const tgt =
          accts.find((a) => a.type === type && oi(a) === ownerIdx) ??
          (type === "NONREG"
            ? accts.find((a) => a.type === "NONREG" && a.owner === "JOINT")
            : undefined);
        if (!tgt) continue;
        remaining -= placeInAccount(tgt, remaining, source, countAsContribution);
      }
      return Math.max(0, remaining);
    };

    for (const gs of goalSaves) {
      if (!(gs.amt > 0)) continue;
      const ownerIdx = pIndex[gs.owner] ?? 0;
      if (ages[ownerIdx]! >= (people[ownerIdx]!.retAge || 999)) continue;
      const remaining = cascadePlace(
        ownerIdx,
        gs.type,
        gs.amt * infFac,
        "generated",
        true,
      );
      if (remaining > 1) {
        roomDisclosures.add(
          "Part of the extra saving could not be placed: the registered room available is smaller than the amount, and there is no non-registered account to receive the remainder.",
        );
      }
    }


    let lumpCash = 0;
    const lumpTaxInc = people.map(() => 0);
    for (const ls of lumps) {
      const idx = pIndex[ls.owner] ?? 0;
      if (ls.age > 0 && ages[idx] === ls.age && ls.amt > 0) {
        const amt = ls.amt * infFac;
        if (ls.taxable) lumpTaxInc[idx]! += amt; // e.g. severance
        if (ls.dest === "TFSA" || ls.dest === "RRSP") {
          // A lump sum directed at a registered plan is a PLANNED allocation,
          // not a completed contribution, so it may only use known legal room.
          // Whatever will not fit cascades on to the next destination; any
          // final remainder is spendable cash rather than money that vanishes.
          const left = cascadePlace(idx, ls.dest, amt, "generated", false);
          if (left > 0.005) lumpCash += left;
          continue;
        }
        const tgt =
          accts.find((a) => a.type === ls.dest && a.owner === ls.owner) ??
          accts.find((a) => a.type === ls.dest);
        if (tgt) {
          tgt.bal += amt;
          if (tgt.type === "NONREG") tgt.acb += amt;
        } else {
          lumpCash += amt; // no matching account: spendable cash this year
        }
      }
    }


    /* --- 6a. Mandatory RRIF/LIF minimums --- */
    // A LIRA/LIF unlock moves that share to RRIF treatment, so no maximum
    // applies to the unlocked portion.
    const lifCapRemaining: Record<string, number> = {};
    // A PRRIF is in RRIF status from the moment it is created: minimums start
    // immediately, and no maximum applies to it.
    const isRRIFnow = (a: WorkingAccount, age: number) =>
      a.type === "RRIF" ||
      a.type === "LIF" ||
      a.type === "PRRIF" ||
      ((a.type === "RRSP" || a.type === "LIRA" || a.type === "DCPP") &&
        age >= convAgeOf(a));
    const isLockedIn = (a: WorkingAccount, age: number) =>
      a.type === "LIF" ||
      ((a.type === "LIRA" || a.type === "DCPP") && age >= convAgeOf(a));

    for (const a of accts) {
      const age = ages[oi(a)]!;
      if (isRRIFnow(a, age)) {
        const minF = rrifMinFactor(age) / 100;
        let minW = a.bal * minF;
        if (isLockedIn(a, age)) {
          // Point-of-use gating (§13.2a): Quebec applies NO maximum from 55
          // (verified) but still applies one below 55; Ontario reads the FSRA
          // table; everywhere else the annuity approximation is flagged.
          const lm = lifMaximumFor(a.juris, age, opts.lifRate);
          if (lm.status === "UNSUPPORTED") {
            lockedInDisclosures.add(
              `Pension jurisdiction ${a.juris ?? "(not specified)"} is not yet supported: the LIF maximum for "${
                a.name || a.type
              }" is withheld and no other jurisdiction's table is substituted.`,
            );
          } else if (lm.applies) {
            if (lm.status === "APPROXIMATE") {
              lockedInDisclosures.add(
                `LIF maximum for ${a.juris} is an approximation (annuity formula at the reference rate), not the published table.`,
              );
            }
            const maxF = lm.pct / 100;
            lifCapRemaining[a.id] = Math.max(0, a.bal * maxF - minW);
          }
        }
        minW = Math.min(minW, a.bal);
        a.bal -= minW;
        P[oi(a)]!.mandatoryTaxable += minW;
      }
    }

    /* --- 6b. Scheduled withdrawals, by owner age --- */
    for (const a of accts) {
      const age = ages[oi(a)]!;
      if (a.wd > 0 && age >= a.wdStart && age <= (a.wdEnd || 999) && a.bal > 0) {
        const w = Math.min(a.wd * infFac, a.bal);
        const p = P[oi(a)]!;
        if (a.type === "TFSA") {
          p.schedTfsaCash += w;
        } else if (a.type === "NONREG") {
          const gf = a.bal > 0 ? Math.max(0, (a.bal - a.acb) / a.bal) : 0;
          const gain = w * gf;
          a.acb -= w - gain;
          for (const [idx, fr] of splitOf(a)) P[idx]!.schedNonregGain += gain * fr;
          p.schedNonregCash += w;
        } else {
          // Source-aware: only cash out of an account that is actually in
          // RRIF/LIF status this year can ever be pension-income eligible.
          if (isRRIFnow(a, age)) p.schedRrifCash += w;
          else p.schedRrspCash += w;

        }
        a.bal -= w;
      }
    }

    /* --- 7. Hard assets: appreciate, downsize, sell --- */
    let saleGainTaxA = 0;
    let saleCashInflow = 0;
    let purchaseCash = 0;
    for (const as of assets) {
      if (as.sold) continue;
      const buyAge = as.buyAge ?? 0;
      // A future purchase does not exist on the balance sheet until it is
      // bought, and the purchase itself is a cash outflow in that year.
      if (buyAge > 0 && ages[0]! < buyAge) continue;
      if (buyAge > 0 && ages[0]! === buyAge) {
        const cost = (as.buyCost ?? as.val) * infFac;
        as.val = cost;
        as.acb = cost;
        purchaseCash += cost;
        continue;
      }
      as.val *= 1 + as.apr;
      if (as.dsAge && !as.dsDone && ages[0] === as.dsAge) {
        const dpct = Math.min(100, Math.max(0, as.dsPct || 30)) / 100;
        const freed = as.val * dpct;
        // 50% inclusion on the gain attributable to the sold share
        if (as.taxable) saleGainTaxA += Math.max(0, as.val - as.acb) * dpct * 0.5;
        as.val -= freed;
        as.acb *= 1 - dpct;
        as.dsDone = true;
        const dtgt =
          accts.find((a) => a.type === "NONREG" && oi(a) === 0) ??
          accts.find((a) => a.type === "NONREG");
        if (dtgt) {
          dtgt.bal += freed;
          dtgt.acb += freed;
        } else {
          saleCashInflow += freed;
        }
      }
      if (as.sale && ages[0] === as.sale) {
        // Selling costs come off the cheque and off the taxable gain.
        const cost = Math.min(as.val, (as.sellCost ?? 0) * infFac);
        const proceeds = as.val - cost;
        if (as.taxable) saleGainTaxA += Math.max(0, as.val - as.acb - cost) * 0.5;
        const target =
          accts.find((a) => a.type === "NONREG" && oi(a) === 0) ??
          accts.find((a) => a.type === "NONREG");
        if (target) {
          target.bal += proceeds;
          target.acb += proceeds;
        } else {
          saleCashInflow += proceeds;
        }
        as.val = 0;
        as.sold = true;
      }
    }

    /* --- 8. Liabilities: accrue interest, apply the annual payment --- */
    let liabPay = 0;
    for (const li of liabs) {
      if (li.bal <= 0.01) {
        li.bal = 0;
        continue;
      }
      li.bal *= 1 + li.rate;
      const pay = Math.min(li.pay, li.bal);
      li.bal -= pay;
      liabPay += pay;
    }

    // One-off expenses are keyed to Person A's age.
    let expense = 0;
    for (const e of expenses) if (e.age === ages[0]) expense += e.amt * infFac;
    // Someone still working spends what they spend today; the retirement
    // figure only takes over once everyone who is alive has retired.
    const stillWorking = people.some(
      (p, i) => alive[i] && ages[i]! < (p.retAge || 999),
    );
    const baseSpend = curSpend0 != null && stillWorking ? curSpend0 : spend0;
    const spendTarget = Math.max(
      0,
      baseSpend * infFac +
        expense +
        purchaseCash +
        liabPay -
        saleCashInflow -
        lumpCash -
        deathBenefit,
    );

    /* --- Other income streams, per person --- */
    const otherTax = people.map(() => 0);
    const otherNon = people.map(() => 0);
    for (const s of otherInc) {
      // Joint income (e.g. a rental in both names) is keyed to Person A's age
      // and taxed 50/50, or wholly to the survivor once one partner has passed.
      if (s.owner === "JOINT" && couple && people.length === 2) {
        const liv = [0, 1].filter((i) => alive[i]);
        if (liv.length && ages[0]! >= s.start && ages[0]! <= (s.end || 999)) {
          const amt = (s.indexed ? s.amt * infFac : s.amt) / liv.length;
          for (const idx of liv) {
            if (s.taxable) otherTax[idx]! += amt;
            else otherNon[idx]! += amt;
          }
        }
        continue;
      }
      const idx = pIndex[s.owner] ?? 0;
      if (!alive[idx]) continue;
      const age = ages[idx]!;
      if (age >= s.start && age <= (s.end || 999)) {
        const amt = s.indexed ? s.amt * infFac : s.amt;
        if (s.taxable) otherTax[idx]! += amt;
        else otherNon[idx]! += amt;
      }
    }

    // Per-person fixed (non-discretionary) pieces. Non-registered interest and
    // dividends are taxable but reinvested, so they are income without cash.
    //
    // Pension-income eligibility (canonical spec v1.2 FINAL + Erratum 1):
    //   pensionEligibleAnyAge  = rppLifetimePension
    //                          + (bridgeEligibleAffirmed ? bridgeInc : 0)
    //   pensionEligible65Plus  = (age >= 65 ? rrifEligibleCash : 0)
    // Erratum 5 splits the former single scalar in two so that a T1032
    // transferee applies their OWN age test to the RRIF-sourced portion.
    // Plain RRSP cash is never eligible; RRIF/LIF cash (including mandatory
    // minimums) is eligible only from 65. This single value feeds both the
    // pension income credit and the household splitting optimizer.
    const fixed = P.map((p, i) => {
      const rrifEligibleCash = p.mandatoryTaxable + p.schedRrifCash;
      const rrspNonEligibleCash = p.schedRrspCash;
      const bridgeElig = bridgeIsPensionEligible(people[i]?.bridge);
      return {
        ordinary:
          p.employInc +
          p.cppInc +
          p.oasFull +
          p.penInc +
          p.bridgeInc +
          otherTax[i]! +
          lumpTaxInc[i]! +
          rrifEligibleCash +
          rrspNonEligibleCash +
          p.nonregInterest,
        div: p.nonregDiv,
        gainTax: p.schedNonregGain * 0.5,
        // Erratum 5: two typed streams instead of one scalar.
        pensionEligAnyAge: p.penInc + (bridgeElig ? p.bridgeInc : 0),
        pensionElig65Plus: p.age >= 65 ? rrifEligibleCash : 0,
        oas: p.oasFull,
        age: p.age,
        cash:
          p.employInc +
          p.cppInc +
          p.oasFull +
          p.penInc +
          p.bridgeInc +
          otherTax[i]! +
          otherNon[i]! +
          rrifEligibleCash +
          rrspNonEligibleCash +
          p.schedTfsaCash +
          p.schedNonregCash,
      };
    });

    const fixedCash = fixed.reduce((s, f) => s + f.cash, 0);
    if (saleGainTaxA) fixed[0]!.gainTax += saleGainTaxA;

    // RRSP deduction for the year. Claimed against income that exists
    // independently of the discretionary draw, so the deduction does not move
    // while the draw solver iterates. Unclaimed contributions stay in the
    // undeducted carry-forward and remain deductible in a later year.
    const rrspDeductions = fixed.map((f, i) =>
      alive[i] ? (ledgers[i]?.claimRrspDeduction(Math.max(0, f.ordinary)) ?? 0) : 0,
    );


    /* --- 9. Solve the discretionary draw --- */
    // Locked-in DC/LIRA money before conversion is not drawable; converted LIF
    // accounts are capped at the LIF maximum.
    const order = strategyOrder(accts, strategy);
    const locked = (a: WorkingAccount) =>
      (a.type === "DCPP" || a.type === "LIRA") && ages[oi(a)]! < convAgeOf(a);

    const drawable = order
      .filter((a) => a.bal > 0.01 && !locked(a))
      .map((a) => {
        let cap = a.bal;
        if (lifCapRemaining[a.id] != null) cap = Math.min(cap, lifCapRemaining[a.id]!);
        const gf =
          a.type === "NONREG" && a.bal > 0 ? Math.max(0, (a.bal - a.acb) / a.bal) : 0;
        return {
          a,
          cap: Math.max(0, cap),
          gf,
          type: a.type,
          owner: oi(a),
          split: splitOf(a),
          // Classified once, from the account's actual status this year.
          rrifStatus: isRRIFnow(a, ages[oi(a)]!),
        };
      })
      .filter((d) => d.cap > 0.01);
    const totalDrawable = drawable.reduce((s, d) => s + d.cap, 0);

    /** Per-person incomes produced by drawing a gross budget G, in order. */
    function incomesForG(G: number): { incs: IncomeComponents[]; drawCash: number } {
      const add = P.map(() => ({
        ord: 0,
        gainTax: 0,
        tfsa: 0,
        nonreg: 0,
        reg: 0,
        /** Registered draw from an account in RRIF/LIF status this year. */
        regRrif: 0,
      }));
      let rem = G;
      for (const d of drawable) {
        const take = Math.min(d.cap, rem);
        if (take <= 0) break;
        rem -= take;
        const x = add[d.owner]!;
        if (d.type === "TFSA") {
          x.tfsa += take;
        } else if (d.type === "NONREG") {
          for (const [idx, fr] of d.split) add[idx]!.gainTax += take * d.gf * 0.5 * fr;
          x.nonreg += take;
        } else {
          x.ord += take;
          x.reg += take;
          if (d.rrifStatus) x.regRrif += take;
        }
      }
      const incs: IncomeComponents[] = fixed.map((f, i) => ({
        ordinary: f.ordinary + add[i]!.ord,
        eligDiv: f.div,
        capGainsTaxable: f.gainTax + add[i]!.gainTax,
        pensionEligibleAnyAge: f.pensionEligAnyAge,
        pensionEligible65Plus:
          f.pensionElig65Plus + (P[i]!.age >= 65 ? add[i]!.regRrif : 0),
        oasReceived: f.oas,
        age: f.age,
        // Deducted this year. It reduces the net-income base that the
        // BPA/age-credit phase-outs and the OAS recovery tax are measured on.
        rrspDeduction: rrspDeductions[i] ?? 0,
      }));


      const drawCash = add.reduce((s, x) => s + x.reg + x.nonreg + x.tfsa, 0);
      return { incs, drawCash };
    }

    // Household after-tax cash is monotonic in G, so a binary search converges.
    const livingIdx = people.map((_, i) => i).filter((i) => alive[i]);
    const evalG = (G: number) => {
      const { incs, drawCash } = incomesForG(G);
      const ht = householdTax(
        livingIdx.map((i) => incs[i]!),
        opts,
        canSplit,
        ty,
      );
      return { cash: fixedCash + drawCash - ht.tax, ht };
    };

    let G: number;
    if (evalG(totalDrawable).cash <= spendTarget) G = totalDrawable;
    else if (evalG(0).cash >= spendTarget) G = 0;
    else {
      let lo = 0;
      let hi = totalDrawable;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (evalG(mid).cash < spendTarget) lo = mid;
        else hi = mid;
      }
      G = hi;
    }

    // Apply the chosen draw to the real balances.
    let rem = G;
    const drawn = { reg: 0, tfsa: 0, nonreg: 0 };
    /** Discretionary TFSA cash taken, per owner — it restores room next Jan 1. */
    const tfsaTakenBy = people.map(() => 0);
    for (const d of drawable) {
      const take = Math.min(d.cap, rem);
      if (take <= 0) break;
      rem -= take;
      const a = d.a;
      if (d.type === "TFSA") {
        drawn.tfsa += take;
        tfsaTakenBy[d.owner] = (tfsaTakenBy[d.owner] ?? 0) + take;
      } else if (d.type === "NONREG") {
        const gain = take * d.gf;
        a.acb -= take - gain;
        drawn.nonreg += take;
      } else {
        drawn.reg += take;
      }
      a.bal -= take;
    }


    const ht = evalG(G).ht;
    const tax = ht.tax;
    const taxable = ht.perPerson.reduce((s, r) => s + r.taxable, 0);
    const oasClaw = ht.perPerson.reduce((s, r) => s + r.oasClawback, 0);
    const grossCash = fixedCash + drawn.reg + drawn.nonreg + drawn.tfsa;
    const afterTax = grossCash - tax;
    const shortfall = Math.max(0, spendTarget - afterTax);
    const totalPortfolio = accts.reduce((s, a) => s + Math.max(0, a.bal), 0);
    const assetTotal = assets.reduce((s, a) => s + Math.max(0, a.val), 0);
    const liabTotal = liabs.reduce((s, l) => s + Math.max(0, l.bal), 0);
    const netWorth = totalPortfolio + assetTotal - liabTotal;
    const lifRemaining = accts
      .filter((a) => a.type === "LIF")
      .reduce((s, a) => s + Math.max(0, a.bal), 0);
    const lifBound =
      shortfall > 1 && totalPortfolio > 1 && lifRemaining > 0.5 * totalPortfolio;

    // Effective household marginal rate is approximately the lower living
    // spouse's marginal rate, since a tax-aware plan taps them next.
    const finalIncs = incomesForG(G).incs;
    const margRate = livingIdx.length
      ? Math.min(...livingIdx.map((i) => approxMarginal(finalIncs[i]!, opts, ty)))
      : 0;

    // TFSA withdrawals restore room on January 1 of the FOLLOWING year, so they
    // are recorded now and only released by next year's openYear().
    ledgers.forEach((l, i) => {
      const out = P[i]!.schedTfsaCash + (tfsaTakenBy[i] ?? 0);
      if (out > 0) l.recordTfsaWithdrawal(out);
    });

    const closedRoom = ledgers.map((l) => l.closeYear());
    lastClosedRoom = closedRoom;
    for (const ry of closedRoom) for (const d of ry.disclosures) roomDisclosures.add(d);


    rows.push({
      roomLedger: closedRoom,
      rrspDeduction: rrspDeductions.reduce((s, v) => s + v, 0),


      off,
      yr,
      infFac,
      ages,
      lifRemaining,
      lifBound,
      age: ages[0]!,
      balances: Object.fromEntries(accts.map((a) => [a.id, Math.max(0, a.bal)])),
      contribTotal,
      contribBy,
      totalPortfolio,
      assetTotal,
      liabTotal,
      netWorth,
      liabPay,
      cpp: P.reduce((s, p) => s + p.cppInc, 0),
      oas: P.reduce((s, p) => s + p.oasFull, 0),
      pen: P.reduce((s, p) => s + p.penInc + p.bridgeInc, 0),
      employ: P.reduce((s, p) => s + p.employInc, 0),
      other:
        otherTax.reduce((s, v) => s + v, 0) + otherNon.reduce((s, v) => s + v, 0),
      regWithdraw:
        P.reduce((s, p) => s + p.mandatoryTaxable + p.schedRrifCash + p.schedRrspCash, 0) +
        drawn.reg,

      tfsaWithdraw: P.reduce((s, p) => s + p.schedTfsaCash, 0) + drawn.tfsa,
      nonregWithdraw: P.reduce((s, p) => s + p.schedNonregCash, 0) + drawn.nonreg,
      taxable,
      tax,
      oasClaw,
      splitAmt: ht.splitAmt || 0,
      anyDeceased: alive.some((a) => !a),
      perPerson: people.map((pp, i) => {
        const li = livingIdx.indexOf(i);
        const rr = li >= 0 ? ht.perPerson[li] : null;
        return {
          name: pp.firstName || pp.id,
          age: P[i]!.age,
          alive: alive[i]!,
          taxable: rr ? rr.taxable : 0,
          tax: rr ? rr.tax : 0,
        };
      }),
      avgRate: taxable > 0 ? tax / taxable : 0,
      margRate,
      afterTax,
      spendTarget,
      shortfall,
      fundingShortfall: shortfall > 1,
      portfolioEmpty: totalPortfolio <= 1,
      portfolioExhausted: totalPortfolio <= 1 && everHadPortfolio,
    });
    if (totalPortfolio > 1) everHadPortfolio = true;
  }

  const spousalNote =
    couple && lastClosedRoom.length === 2 ? spousalRrspDisclosure(lastClosedRoom) : null;

  return {
    rows,
    roomDisclosures: [...roomDisclosures, ...(spousalNote ? [spousalNote] : [])],
    lockedInDisclosures: [...lockedInDisclosures],
    roomValidationErrors,


    hadInvestableAssets: everHadPortfolio,
    acctMeta: accts.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    opts,
    taxYear: ty.year,
    curAge: curAgeA,
    endAge,
    couple,
    people,
  };
}
