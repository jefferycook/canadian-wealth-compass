/**
 * Per-person TFSA / RRSP contribution-room ledgers.
 *
 * Canonical spec v1.2 FINAL + Erratum 2 (opening-year room semantics) and
 * Erratum 3 (spousal RRSPs deferred; Batch 0B models contributor === owner).
 *
 * Two rules govern everything here:
 *
 *   1. The plan-start year (t0) takes the client's entered room VERBATIM. The
 *      figure a client reads off their CRA account already includes this
 *      year's statutory accrual and is already net of contributions made so
 *      far this year, so adding the annual limit again invents room.
 *      Statutory recursion begins on January 1 of t0 + 1.
 *
 *   2. Unknown room (null) is zero verified capacity — never unlimited, and
 *      never the current year's annual limit. Engine-generated contributions
 *      are capped at zero against unknown room; client-asserted contributions
 *      are honoured but flagged `unverifiedRoom`.
 */

import { getTaxYear, LATEST_TAX_YEAR } from "./taxYears";
import type { PersonInput, PersonKey } from "./types";

/** Whether a year's room figure is verified, unverified, or an estimate. */
export type RoomStatus = "KNOWN" | "UNKNOWN" | "APPROXIMATE";

/**
 * Where a contribution came from. The distinction is load-bearing: a
 * client-asserted contribution is a statement of fact about the client's life;
 * an engine-generated one is advice, and the tool never advises a contribution
 * against room it cannot verify.
 */
export type ContributionSource = "asserted" | "generated";

/** Lifetime RRSP over-contribution cushion before the 1%/month penalty. */
export const RRSP_CUSHION = 2000;

/**
 * Statutory annual limits beyond the published tables.
 *
 * APPROXIMATION (reported in the Batch 0B review): only 2026 constants are
 * published in `taxYears.ts`. Later years index the latest published limit by
 * the plan's inflation assumption and round the way CRA does — TFSA to the
 * nearest $500, the RRSP dollar limit to the nearest $10. Both are marked
 * APPROXIMATE on the ledger from the first unpublished year onward.
 */
export function tfsaAnnualLimit(year: number, inflation: number): number {
  const base = getTaxYear(LATEST_TAX_YEAR).tfsaNewRoom;
  if (year <= LATEST_TAX_YEAR) return getTaxYear(year).tfsaNewRoom;
  const raw = base * Math.pow(1 + inflation, year - LATEST_TAX_YEAR);
  return Math.round(raw / 500) * 500;
}

export function rrspDollarLimit(year: number, inflation: number): number {
  const base = getTaxYear(LATEST_TAX_YEAR).rrspLimit;
  if (year <= LATEST_TAX_YEAR) return getTaxYear(year).rrspLimit;
  const raw = base * Math.pow(1 + inflation, year - LATEST_TAX_YEAR);
  return Math.round(raw / 10) * 10;
}

export interface TfsaYearLedger {
  open: number;
  accrual: number;
  withdrawalsRestored: number;
  contributions: number;
  close: number;
  excess: number;
  status: RoomStatus;
  unverifiedRoom: boolean;
}

export interface RrspYearLedger {
  contribRoomOpen: number;
  accrual: number;
  pensionAdjustment: number;
  contributions: number;
  contribRoomClose: number;
  deductionLimitOpen: number;
  deductionClaimed: number;
  deductionLimitClose: number;
  undeductedCarry: number;
  excess: number;
  status: RoomStatus;
  unverifiedRoom: boolean;
  /** True once the owner may no longer contribute to their own RRSP. */
  dormantAfter71: boolean;
}

/** Penalty exposure. Duration is an annual approximation, never a fine number. */
export interface PenaltyExposure {
  tfsaExcess: number;
  rrspExcessOverCushion: number;
  /** 1%/month applied for a full 12 months — an explicit approximation. */
  estimatedPenalty: number;
  approximate: boolean;
}

export interface PersonRoomYear {
  person: PersonKey;
  year: number;
  age: number;
  earnedIncome: number;
  tfsa: TfsaYearLedger;
  rrsp: RrspYearLedger;
  penalty: PenaltyExposure;
  /** True when the tool must not recommend a registered contribution. */
  registeredRecommendationsWithheld: boolean;
  disclosures: string[];
}

export interface RoomLedgerOptions {
  planStartYear: number;
  inflation: number;
  /** Member of a DB/DC pension plan — PA may consume most of the accrual. */
  pensionMember: boolean;
}

/**
 * One person's room ledger, advanced once per projection year before any
 * contribution is applied.
 */
export class PersonRoomLedger {
  readonly person: PersonKey;
  private readonly opts: RoomLedgerOptions;

  private tfsaClose = 0;
  private tfsaStatus: RoomStatus = "KNOWN";
  private tfsaWithdrawalsThisYear = 0;
  private tfsaWithdrawalsPrevYear = 0;

  private rrspRoomClose = 0;
  private rrspDeductionLimitClose = 0;
  private undeductedCarry = 0;
  private rrspStatus: RoomStatus = "KNOWN";

  private paKnown: boolean;
  private paValue: number;
  private roomEverKnown: boolean;

  private started = false;
  private current: PersonRoomYear | null = null;
  private prevEarnedIncome = 0;

  /** Input-contract problems found once, at construction. */
  readonly validationErrors: string[] = [];

  constructor(
    private readonly p: PersonInput,
    opts: RoomLedgerOptions,
  ) {
    this.person = p.id;
    this.opts = opts;
    this.paKnown = p.pensionAdjustment != null;
    this.paValue = p.pensionAdjustment ?? 0;

    const room = p.rrspRoom;
    const undeducted = p.rrspUndeductedContributions;
    const limit = p.rrspDeductionLimitOpen;
    if (room != null && undeducted != null && limit != null) {
      // CRA identity: Deduction Limit = Available Contribution Room + Unused
      // (undeducted) Contributions. Inconsistency is surfaced, never resolved
      // silently in favour of one of the three figures.
      if (Math.abs(limit - (room + undeducted)) > 1) {
        this.validationErrors.push(
          `${p.id}: RRSP figures are inconsistent — deduction limit ${Math.round(
            limit,
          )} should equal contribution room ${Math.round(
            room,
          )} plus undeducted contributions ${Math.round(
            undeducted,
          )}. Check your CRA Notice of Assessment.`,
        );
      }
    }
    this.roomEverKnown = p.tfsaRoom != null || p.rrspRoom != null;
  }

  /** Open a projection year. Must be called before any contribution. */
  openYear(year: number, age: number, earnedIncomeThisYear: number): PersonRoomYear {
    const disclosures: string[] = [];
    const first = !this.started;
    this.started = true;

    const beyondTables = year > LATEST_TAX_YEAR;

    /* ---------------- TFSA ---------------- */
    let tfsaOpen: number;
    let tfsaAccrual = 0;
    let restored = 0;
    if (first) {
      // Erratum 2: entered figure verbatim. No annual-limit addition.
      if (this.p.tfsaRoom != null) {
        tfsaOpen = Math.max(0, this.p.tfsaRoom);
        this.tfsaStatus = "KNOWN";
      } else {
        tfsaOpen = 0;
        this.tfsaStatus = "UNKNOWN";
        disclosures.push(
          "TFSA contribution room is unknown — enter your CRA figure for accuracy. No TFSA contribution is recommended until it is known.",
        );
      }
      // Prior-year withdrawals the client reported are restored on Jan 1 of
      // the plan-start year only when the client supplied them alongside a
      // room figure they say does not already include them.
    } else {
      tfsaAccrual = age >= 18 ? tfsaAnnualLimit(year, this.opts.inflation) : 0;
      restored = this.tfsaWithdrawalsPrevYear;
      tfsaOpen = this.tfsaClose + tfsaAccrual + restored;
      if (this.tfsaStatus === "UNKNOWN") this.tfsaStatus = "APPROXIMATE";
      if (beyondTables && this.tfsaStatus === "KNOWN") this.tfsaStatus = "APPROXIMATE";
    }

    /* ---------------- RRSP ---------------- */
    let rrspOpen: number;
    let rrspAccrual = 0;
    let pa = 0;
    let deductionLimitOpen: number;
    if (first) {
      if (this.p.rrspRoom != null) {
        rrspOpen = Math.max(0, this.p.rrspRoom);
        this.rrspStatus = "KNOWN";
      } else {
        rrspOpen = 0;
        this.rrspStatus = "UNKNOWN";
        disclosures.push(
          "RRSP contribution room is unknown — enter your CRA figure for accuracy. No RRSP contribution is recommended until it is known.",
        );
      }
      this.undeductedCarry = Math.max(0, this.p.rrspUndeductedContributions ?? 0);
      deductionLimitOpen =
        this.p.rrspDeductionLimitOpen != null
          ? Math.max(0, this.p.rrspDeductionLimitOpen)
          : rrspOpen + this.undeductedCarry; // CRA identity
      for (const e of this.validationErrors) disclosures.push(e);
    } else {
      pa = this.paKnown ? this.paValue : 0;
      rrspAccrual = Math.max(
        0,
        Math.min(
          0.18 * this.prevEarnedIncome,
          rrspDollarLimit(year, this.opts.inflation),
        ) - pa,
      );
      rrspOpen = Math.max(0, this.rrspRoomClose + rrspAccrual);
      deductionLimitOpen = this.rrspDeductionLimitClose + rrspAccrual;
      if (this.rrspStatus === "UNKNOWN") this.rrspStatus = "APPROXIMATE";
      if (this.opts.pensionMember && !this.paKnown) {
        this.rrspStatus = "APPROXIMATE";
      }
      if (beyondTables && this.rrspStatus === "KNOWN") this.rrspStatus = "APPROXIMATE";
    }

    if (this.opts.pensionMember && !this.paKnown) {
      disclosures.push(
        "Pension adjustment is unknown and modelled as $0 — an explicit estimate, not a CRA figure. Your RRSP room is reduced by your pension adjustment; enter it from your Notice of Assessment for accuracy.",
      );
    }

    // Withhold registered recommendations only where BOTH room and PA are
    // unknown for a pension-plan member (Erratum 2, PA withholding rule).
    const withheld =
      this.opts.pensionMember && !this.paKnown && !this.roomEverKnown;
    if (withheld) {
      disclosures.push(
        "Registered-contribution recommendations are withheld for this person: both contribution room and pension adjustment are unknown.",
      );
    }

    // A person past 71 may no longer contribute to their own RRSP. Room keeps
    // accruing and stays visible on the ledger — dormant, not deleted.
    const dormant = age > 71;
    if (dormant && rrspOpen > 0) {
      disclosures.push(
        "You are past the year you turned 71, so no further contribution to your own RRSP is possible. Your unused room remains on the ledger.",
      );
    }

    this.tfsaWithdrawalsPrevYear = this.tfsaWithdrawalsThisYear;
    this.tfsaWithdrawalsThisYear = 0;
    this.prevEarnedIncome = earnedIncomeThisYear;

    this.current = {
      person: this.person,
      year,
      age,
      earnedIncome: earnedIncomeThisYear,
      tfsa: {
        open: tfsaOpen,
        accrual: tfsaAccrual,
        withdrawalsRestored: restored,
        contributions: 0,
        close: tfsaOpen,
        excess: 0,
        status: this.tfsaStatus,
        unverifiedRoom: false,
      },
      rrsp: {
        contribRoomOpen: rrspOpen,
        accrual: rrspAccrual,
        pensionAdjustment: pa,
        contributions: 0,
        contribRoomClose: rrspOpen,
        deductionLimitOpen,
        deductionClaimed: 0,
        deductionLimitClose: deductionLimitOpen,
        undeductedCarry: this.undeductedCarry,
        excess: 0,
        status: this.rrspStatus,
        unverifiedRoom: false,
        dormantAfter71: dormant,
      },
      penalty: {
        tfsaExcess: 0,
        rrspExcessOverCushion: 0,
        estimatedPenalty: 0,
        approximate: true,
      },
      registeredRecommendationsWithheld: withheld,
      disclosures,
    };
    return this.current;
  }

  private y(): PersonRoomYear {
    if (!this.current) throw new Error("PersonRoomLedger: openYear() not called");
    return this.current;
  }

  /** Room an engine-generated contribution may use. Unknown room = zero. */
  generatedTfsaCapacity(): number {
    const y = this.y();
    if (y.registeredRecommendationsWithheld) return 0;
    if (y.tfsa.status === "UNKNOWN") return 0;
    return Math.max(0, y.tfsa.close);
  }

  /** RRSP capacity for advice: cushion excluded, and zero past 71. */
  generatedRrspCapacity(): number {
    const y = this.y();
    if (y.registeredRecommendationsWithheld) return 0;
    if (y.rrsp.status === "UNKNOWN") return 0;
    if (y.rrsp.dormantAfter71) return 0;
    return Math.max(0, y.rrsp.contribRoomClose);
  }

  /**
   * Apply a TFSA contribution.
   * @returns the amount actually contributed.
   */
  contributeTfsa(amount: number, source: ContributionSource): number {
    const y = this.y();
    if (amount <= 0) return 0;
    if (source === "generated") {
      const applied = Math.min(amount, this.generatedTfsaCapacity());
      if (applied <= 0) return 0;
      y.tfsa.contributions += applied;
      y.tfsa.close = Math.max(0, y.tfsa.close - applied);
      return applied;
    }
    // Client-asserted: honoured in full. Room unknown → flagged, not reduced.
    y.tfsa.contributions += amount;
    if (y.tfsa.status === "KNOWN" || y.tfsa.status === "APPROXIMATE") {
      const excess = Math.max(0, amount - y.tfsa.close);
      y.tfsa.excess += excess;
      y.tfsa.close = Math.max(0, y.tfsa.close - amount);
    } else {
      y.tfsa.unverifiedRoom = true;
      y.tfsa.close = 0;
    }
    return amount;
  }

  /**
   * Apply an RRSP contribution.
   * A person past 71 cannot contribute to their own plan at all — even an
   * asserted contribution is refused, because the law does not allow it.
   */
  contributeRrsp(amount: number, source: ContributionSource): number {
    const y = this.y();
    if (amount <= 0) return 0;
    if (y.rrsp.dormantAfter71) return 0;
    if (source === "generated") {
      const applied = Math.min(amount, this.generatedRrspCapacity());
      if (applied <= 0) return 0;
      y.rrsp.contributions += applied;
      y.rrsp.contribRoomClose = Math.max(0, y.rrsp.contribRoomClose - applied);
      this.undeductedCarry += applied;
      y.rrsp.undeductedCarry = this.undeductedCarry;
      return applied;
    }
    y.rrsp.contributions += amount;
    if (y.rrsp.status === "KNOWN" || y.rrsp.status === "APPROXIMATE") {
      const excess = Math.max(0, amount - y.rrsp.contribRoomClose);
      y.rrsp.excess += excess;
      y.rrsp.contribRoomClose = Math.max(0, y.rrsp.contribRoomClose - amount);
    } else {
      y.rrsp.unverifiedRoom = true;
      y.rrsp.contribRoomClose = 0;
    }
    this.undeductedCarry += amount;
    y.rrsp.undeductedCarry = this.undeductedCarry;
    return amount;
  }

  /** TFSA withdrawals restore room on January 1 of the FOLLOWING year. */
  recordTfsaWithdrawal(amount: number): void {
    if (amount > 0) this.tfsaWithdrawalsThisYear += amount;
  }

  /**
   * Claim an RRSP deduction for the year.
   *
   * A contribution and a deduction are different events: the claim is capped
   * by the deduction limit, by the undeducted balance, and by the income there
   * is to deduct against. Anything unclaimed persists as undeducted carry.
   */
  claimRrspDeduction(incomeAvailable: number): number {
    const y = this.y();
    const claim = Math.max(
      0,
      Math.min(y.rrsp.deductionLimitOpen, this.undeductedCarry, incomeAvailable),
    );
    y.rrsp.deductionClaimed = claim;
    this.undeductedCarry -= claim;
    y.rrsp.undeductedCarry = this.undeductedCarry;
    y.rrsp.deductionLimitClose = Math.max(0, y.rrsp.deductionLimitOpen - claim);
    return claim;
  }

  /** Finish the year, computing penalty exposure and carrying balances. */
  closeYear(): PersonRoomYear {
    const y = this.y();
    const rrspOver = Math.max(0, y.rrsp.excess - RRSP_CUSHION);
    y.penalty = {
      tfsaExcess: y.tfsa.excess,
      rrspExcessOverCushion: rrspOver,
      // APPROXIMATION: the engine is annual, so the excess is assumed to be
      // outstanding for twelve months. Reported as an approximation.
      estimatedPenalty: (y.tfsa.excess + rrspOver) * 0.12,
      approximate: true,
    };
    if (y.tfsa.excess > 0) {
      y.disclosures.push(
        "A TFSA contribution exceeds your available room. The excess is modelled as an over-contribution; the penalty shown assumes it is outstanding for the full year.",
      );
    }
    if (y.rrsp.excess > 0) {
      y.disclosures.push(
        rrspOver > 0
          ? "An RRSP contribution exceeds your available room by more than the $2,000 lifetime cushion. The penalty shown assumes the excess is outstanding for the full year."
          : "An RRSP contribution exceeds your available room but stays within the $2,000 lifetime cushion, so no penalty applies.",
      );
    }
    this.tfsaClose = y.tfsa.close;
    this.rrspRoomClose = y.rrsp.contribRoomClose;
    this.rrspDeductionLimitClose = y.rrsp.deductionLimitClose;
    this.current = null;
    return y;
  }
}

/**
 * Erratum 3 disclosure: a person past 71 holding unused RRSP room whose spouse
 * is 71 or younger may still be able to use a spousal RRSP — which Batch 0B
 * does not model and must not silently assume.
 */
export function spousalRrspDisclosure(
  years: PersonRoomYear[],
): string | null {
  if (years.length < 2) return null;
  const eligible = years.some((y, i) => {
    const other = years[(i + 1) % years.length];
    return (
      y.rrsp.dormantAfter71 &&
      y.rrsp.contribRoomOpen > 0 &&
      other != null &&
      other.age <= 71
    );
  });
  return eligible
    ? "A spousal RRSP contribution may still be available to you — not modelled in this plan."
    : null;
}
