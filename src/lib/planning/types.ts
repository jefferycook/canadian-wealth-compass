/**
 * Typed plan inputs for the Canadian retirement & tax projection engine.
 *
 * These types are the contract that replaced the original tool's DOM scraping.
 * The engine is pure: it reads a `PlanInputs` object and returns a
 * `ProjectionResult`. Nothing here touches the browser, storage, or network.
 */

import type { PersonRoomYear } from "./room";


export type ProvinceKey =
  | "AB"
  | "BC"
  | "MB"
  | "NB"
  | "NL"
  | "NS"
  | "NT"
  | "NU"
  | "ON"
  | "PE"
  | "QC"
  | "SK"
  | "YT"
  | "CUSTOM";

/** Pension jurisdiction governing locked-in (LIRA/LIF) money. */
export type JurisdictionKey =
  | "ON"
  | "FED"
  | "AB"
  | "MB"
  | "NS"
  | "NB"
  | "BC"
  | "QC"
  /** Saskatchewan is UNSUPPORTED in Batch 0C (Erratum 4); saved plans must still load. */
  | "SK";

export type AccountType =
  | "RRSP"
  | "RRIF"
  | "LIRA"
  | "LIF"
  | "DCPP"
  /** Manitoba prescribed RRIF: RRIF minimums, no maximum, pension-eligible at 65+. */
  | "PRRIF"
  | "TFSA"
  | "NONREG";

/** 'A' and 'B' are the two people; 'JOINT' is owned together. */
export type OwnerKey = "A" | "B" | "JOINT";

export type PersonKey = "A" | "B";

/**
 * Relationship status. Married and common-law partners are spouses for
 * income-splitting, spousal rollovers and the CPP survivor's pension.
 * 'partners' get none of the three. 'single' is a one-person plan.
 */
export type PlanType = "single" | "married" | "commonlaw" | "partners";

export type WithdrawalStrategy =
  | "auto"
  | "nonreg_reg_tfsa"
  | "reg_nonreg_tfsa"
  | "tfsa_nonreg_reg"
  | "prorata";

/** A dated benefit stream entered as the age-65 entitlement. */
export interface BenefitInput {
  /** Annual amount in today's dollars, as the age-65 entitlement. */
  amt: number;
  /** Age the benefit starts. */
  age: number;
}

/**
 * Source classification for a bridge-style benefit.
 *
 * CRA treats bridging benefits as *temporary* benefits, distinct from RPP
 * lifetime retirement benefits, so a payment is not pension-income-credit
 * eligible merely because it is labelled "bridge" or paid by an RPP.
 * Only a stream classified as an RPP lifetime retirement benefit may be
 * affirmed as eligible; RCA/SERP/non-registered supplements never can be.
 */
export type BridgeSourceClass =
  | "RPP_BRIDGE"
  | "RPP_LIFETIME"
  | "RCA"
  | "SERP"
  | "NONREG"
  | "OTHER";

export interface BridgeInput {
  /** Annual bridge benefit in today's dollars. */
  amt: number;
  /** Age the bridge ends (usually 65, when CPP/OAS begin). */
  end: number;
  /**
   * Optional source classification. Absent on plans saved before this field
   * existed; absent is treated as "RPP_BRIDGE" (temporary, not eligible).
   */
  sourceClass?: BridgeSourceClass;
  /**
   * Explicit affirmation that the stream is an RPP lifetime retirement
   * benefit. Defaults to false; never inferred. Not yet user-facing — a future
   * batch must add the input and its disclosure text.
   */
  eligibleAffirmed?: boolean;
}

/**
 * A bridge stream enters the pension income credit and pension splitting only
 * when it is explicitly affirmed AND its source class permits affirmation.
 */
export function bridgeIsPensionEligible(b: BridgeInput | undefined): boolean {
  if (!b) return false;
  return b.eligibleAffirmed === true && b.sourceClass === "RPP_LIFETIME";
}


export interface PersonInput {
  id: PersonKey;
  firstName: string;
  lastName: string;
  /** Date of birth, ISO yyyy-mm-dd. Optional; `curAge` is what the engine uses. */
  dob?: string;
  /** Current age in whole years. */
  curAge: number;
  /** Retirement age. Use 999 for "already retired / never works". */
  retAge: number;
  /** Pre-retirement employment income, today's dollars. */
  employ: number;
  /** Age at death for survivor modelling. 0 = not modelled. */
  deathAge: number;
  cpp: BenefitInput;
  oas: BenefitInput;
  /** Defined-benefit workplace pension. */
  pen: BenefitInput;
  bridge: BridgeInput;
  gender?: string;
  /**
   * Current available TFSA contribution room at the plan start date, as shown
   * by CRA. Used verbatim in the plan-start year (Erratum 2) — it already
   * includes this year's dollar limit. Null means unknown, which is zero
   * verified capacity, never the annual limit and never unlimited.
   */
  tfsaRoom?: number | null;
  /** Current available RRSP *contribution room* at the plan start date. */
  rrspRoom?: number | null;
  /**
   * RRSP deduction limit from the Notice of Assessment. Optional; when absent
   * it is derived from the CRA identity
   * `deduction limit = contribution room + undeducted contributions`.
   */
  rrspDeductionLimitOpen?: number | null;
  /** Contributions already made but not yet deducted. */
  rrspUndeductedContributions?: number | null;
  /**
   * Pension adjustment for the plan-start year. Null means unknown; for a
   * pension-plan member a zero PA is only ever a disclosed estimate.
   */
  pensionAdjustment?: number | null;
  /** TFSA withdrawals in the year before the plan starts, if reported. */
  tfsaWithdrawalsPriorYear?: number | null;
  /** Earned income history, most recent last. Optional. */
  earnedIncomeHistory?: number[];

}

/** Non-registered return mix, as fractions summing to 1. */
export interface ReturnMix {
  int: number;
  div: number;
  cg: number;
}

export interface AccountInput {
  id: string;
  name: string;
  type: AccountType;
  owner: OwnerKey;
  /** Current balance. */
  bal: number;
  /** Equity allocation percent, 0-100. */
  eq: number;
  /** Adjusted cost base (non-registered). */
  acb: number;
  /** Explicit conversion age. 0 = auto (RRSP at 71, LIRA/DC at retirement). */
  conv: number;
  /** Percent of a LIRA/LIF to unlock into an RRSP. 0 = none. */
  unlock: number;
  juris: JurisdictionKey;
  /**
   * Expected return for this account as a fraction, overriding the blend
   * implied by the equity allocation. Null/undefined means "use the blend".
   */
  retOverride?: number | null;
  /** Annual contribution in today's dollars. */
  contrib: number;
  /** Contribute until this owner age. 0 = no end. */
  contribEnd: number;
  /** Scheduled annual withdrawal in today's dollars. */
  wd: number;
  wdStart: number;
  wdEnd: number;
  mix: ReturnMix;
  /**
   * Batch 0D (§6.1). Optional explicit distribution yields, as non-negative
   * fractions of the balance. When absent the legacy `mix` convention applies,
   * so saved plans need no migration. Non-eligible dividends are deliberately
   * absent: §6.2 remains an open gap in the verified rules layer.
   */
  yields?: {
    interest?: number | null;
    eligDiv?: number | null;
    cgDist?: number | null;
    roc?: number | null;
  } | null;
}

export interface ExpenseInput {
  /** Stable row id, used as a UI key. */
  id?: string;
  name: string;
  /** Person A's age when the expense lands. */
  age: number;
  /** Amount in today's dollars. */
  amt: number;
}

export interface OtherIncomeInput {
  /** Stable row id, used as a UI key. */
  id?: string;
  name: string;
  /** Annual amount in today's dollars. */
  amt: number;
  owner: OwnerKey;
  start: number;
  end: number;
  taxable: boolean;
  indexed: boolean;
}

export interface LumpSumInput {
  /** Stable row id, used as a UI key. */
  id?: string;
  name: string;
  /** Owner's age when it arrives. */
  age: number;
  amt: number;
  dest: AccountType;
  owner: PersonKey;
  taxable: boolean;
}

export interface HardAssetInput {
  /** Stable row id, used as a UI key. */
  id?: string;
  name: string;
  /** Current value. */
  val: number;
  /** Annual appreciation as a fraction (0.03 = 3%). */
  apr: number;
  /** Person A's age at full sale. 0 = never. */
  sale: number;
  /** Person A's age at a future purchase. 0 = already owned. */
  buyAge?: number;
  /** Purchase price in today's dollars, for a future purchase. */
  buyCost?: number;
  /** Person A's age at downsize. 0 = never. */
  dsAge: number;
  /** Percent of value freed by the downsize. */
  dsPct: number;
  /** Whether a gain on sale is taxable (a principal residence is not). */
  taxable: boolean;
  acb: number;
  /** Selling costs (commission, legal, staging) in today's dollars. */
  sellCost?: number;
}

export interface LiabilityInput {
  /** Stable row id, used as a UI key. */
  id?: string;
  name: string;
  bal: number;
  /** Annual interest rate as a fraction. */
  rate: number;
  /** Annual payment. The UI collects a monthly figure and multiplies by 12. */
  pay: number;
  /**
   * Years left to pay the loan off. Presentation only — the projection runs
   * off balance, rate and payment — but it lets the tool calculate a payment.
   */
  amortYears?: number;
}

/** Tax settings that the original tool exposed as editable advanced fields. */
export interface TaxSettings {
  provinceKey: ProvinceKey;
  /** Federal basic personal amount (maximum, before phase-out). */
  fedBPA: number;
  /** Provincial basic personal amount. */
  provBPA: number;
  /** OAS recovery-tax threshold. */
  oasThresh: number;
  /** LIF maximum reference rate, percent. */
  lifRate: number;
}

export interface PlanInputs {
  /** Tax year whose constants apply. */
  taxYear: number;
  planType: PlanType;
  /** Project to Person A's age. */
  endAge: number;
  /** Annual inflation as a fraction. */
  inflation: number;
  /** Household after-tax spending need in retirement, today's dollars. */
  spendNeed: number;
  /**
   * Household after-tax spending today, while still working. Null means the
   * client has not said, and retirement spending is used throughout.
   */
  currentSpend?: number | null;
  /** Expected equity return as a fraction. */
  eqRet: number;
  /** Expected fixed-income return as a fraction. */
  fiRet: number;
  /** Share of a deceased's DB pension continuing to the survivor, as a fraction. */
  survivorPct: number;
  strategy: WithdrawalStrategy;
  tax: TaxSettings;
  people: PersonInput[];
  accounts: AccountInput[];
  expenses: ExpenseInput[];
  otherIncome: OtherIncomeInput[];
  lumpSums: LumpSumInput[];
  hardAssets: HardAssetInput[];
  liabilities: LiabilityInput[];
}

/* ------------------------------------------------------------------ */
/* Tax engine shapes                                                   */
/* ------------------------------------------------------------------ */

export interface IncomeComponents {
  ordinary: number;
  eligDiv: number;
  capGainsTaxable: number;
  /**
   * @deprecated Erratum 5 — legacy single scalar. Still accepted, and treated
   * as `pensionEligibleAnyAge`, so hand-built inputs keep their meaning.
   */
  pensionEligible?: number;
  /**
   * Erratum 5: RPP lifetime retirement benefits (plus a bridge affirmed as
   * RPP_LIFETIME). Credit-eligible at ANY age, for the pensioner and for a
   * transferee who receives it through a T1032 split.
   */
  pensionEligibleAnyAge?: number;
  /**
   * Erratum 5: RRIF / LIF / PRRIF cash. Already gated to 65+ for the holder by
   * Erratum 1; for a transferee it counts only if the TRANSFEREE is 65+.
   */
  pensionEligible65Plus?: number;
  oasReceived: number;
  age: number;
  /**
   * RRSP deduction claimed this year. A Division C style deduction: it reduces
   * both taxable income and the net-income base that credits and the OAS
   * recovery tax are measured against.
   */
  rrspDeduction?: number;
}


export interface TaxResult {
  tax: number;
  taxable: number;
  netIncome: number;
  oasClawback: number;
  /** Tax before the OAS recovery tax, used for marginal-rate probing. */
  marginalBase: number;
}

export interface HouseholdTaxResult {
  tax: number;
  perPerson: TaxResult[];
  /** Amount of pension income shifted between spouses. */
  splitAmt: number;
  /** Index of the person who transferred income, or -1. */
  dir: number;
}

/* ------------------------------------------------------------------ */
/* Projection output                                                   */
/* ------------------------------------------------------------------ */

export interface PerPersonRow {
  name: string;
  age: number;
  alive: boolean;
  taxable: number;
  tax: number;
}

export interface ProjectionRow {
  /** Years from the start of the projection. */
  off: number;
  /** Calendar year. */
  yr: number;
  /** Cumulative inflation factor at this offset. */
  infFac: number;
  ages: number[];
  /** Person A's age; the timeline reference. */
  age: number;
  balances: Record<string, number>;
  contribTotal: number;
  contribBy: Record<string, number>;
  totalPortfolio: number;
  assetTotal: number;
  liabTotal: number;
  netWorth: number;
  liabPay: number;
  cpp: number;
  oas: number;
  pen: number;
  employ: number;
  other: number;
  regWithdraw: number;
  tfsaWithdraw: number;
  nonregWithdraw: number;
  taxable: number;
  tax: number;
  oasClaw: number;
  splitAmt: number;
  anyDeceased: boolean;
  perPerson: PerPersonRow[];
  avgRate: number;
  margRate: number;
  afterTax: number;
  spendTarget: number;
  shortfall: number;
  /**
   * Plan-status flags. These are deliberately separate concepts:
   *
   * - `fundingShortfall` — after-tax resources could not fund the year's
   *   spending need. This is the plan-failure signal.
   * - `portfolioEmpty` — the investable portfolio is ~zero. A balance-sheet
   *   state, not by itself a failure.
   * - `portfolioExhausted` — investable assets existed earlier and have now
   *   been drawn to ~zero.
   */
  fundingShortfall: boolean;
  portfolioEmpty: boolean;
  portfolioExhausted: boolean;
  /** Total remaining in LIF accounts. */
  lifRemaining: number;
  /** True when a shortfall is driven by LIF maximum-withdrawal limits. */
  lifBound: boolean;
  /** Per-person TFSA/RRSP room ledger for this year (Batch 0B). */
  roomLedger: PersonRoomYear[];
  /** Total RRSP deduction claimed by the household this year. */
  rrspDeduction: number;
  /**
   * Batch 0D. After-tax cash above the spending target that was contributed
   * back to the portfolio (TFSA to room, then non-registered) instead of
   * disappearing. Typically a forced RRIF-minimum year.
   */
  surplusSwept: number;
  /**
   * Batch 0D. Taxable non-registered distributions accrued this year:
   * interest + eligible dividends + the taxable half of capital-gains
   * distributions and of any gain realized by return of capital. These accrue
   * in loss years too (§6.1).
   */
  distributionsTaxable: number;
  /** True when this year's tax table was derived by indexation, not published. */
  taxYearDerived: boolean;
}

export interface AccountMeta {
  id: string;
  name: string;
  type: AccountType;
}

export interface ProjectionResult {
  rows: ProjectionRow[];
  acctMeta: AccountMeta[];
  opts: TaxSettings;
  taxYear: number;
  curAge: number;
  endAge: number;
  couple: boolean;
  people: PersonInput[];
  /**
   * False when the household holds no investable assets at any point in the
   * projection. An intake/information state, never a plan failure.
   */
  hadInvestableAssets: boolean;
  /** Distinct room/contribution disclosures raised anywhere in the run. */
  roomDisclosures: string[];
  /**
   * Locked-in (Batch 0C) disclosures: withheld calculations for UNSUPPORTED
   * jurisdictions and flagged APPROXIMATE numbers, gated at the point of use.
   */
  lockedInDisclosures: string[];
  /** Input-contract problems (e.g. the RRSP CRA identity failing). */
  roomValidationErrors: string[];
}


/** A projection plus the withdrawal strategy that produced it. */
export interface PlanResult extends ProjectionResult {
  /** The ordering actually used. */
  chosenStrategy: WithdrawalStrategy;
  /** True when "auto" picked the ordering rather than the user. */
  autoSelected: boolean;
}

/**
 * Scenario hooks. The original tool used these to run what-if variants
 * (fee drag, market shocks, delayed CPP, downsizing) without duplicating
 * the engine.
 */
export interface MarketShock {
  /** Person A's age when the shock begins. */
  age: number;
  /** Equity return during the shock, in percent. */
  pct: number;
  /** How many years it lasts. */
  years: number;
}

export interface GoalSave {
  amt: number;
  type: AccountType;
  /**
   * Required for engine-generated saving: room is per person, so an
   * engine-generated contribution must name whose ledger it uses. The engine
   * never manufactures an owner.
   */
  owner: PersonKey;
}


export interface ProjectionOverride {
  strategy?: WithdrawalStrategy;
  /** Replace the spending target outright. */
  spendSet?: number;
  /** Add to the spending target. */
  spendAdj?: number;
  /** Add to the pre-retirement (current) spending target. */
  currentSpendAdj?: number;
  /** Shift every retirement age by this many years. */
  retAdj?: number;
  /** Add to every account's return (e.g. -0.012 for fee drag). */
  retDelta?: number;
  /** Force this unlock percentage on all locked-in accounts. */
  unlockAll?: number;
  shocks?: MarketShock[];
  goalSave?: GoalSave;
  goalSaves?: GoalSave[];
  /** Mutate people before the run (e.g. change a CPP start age). */
  mods?: (people: PersonInput[]) => void;
  /** Mutate accounts before the run (e.g. change a conversion age). */
  acctMod?: (accounts: WorkingAccount[]) => void;
  /** Mutate hard assets before the run (e.g. add a downsize). */
  assetMod?: (assets: WorkingAsset[]) => void;
}

/** An account as mutated during a projection run. */
export interface WorkingAccount extends AccountInput {
  /** Blended expected return, derived from the equity allocation. */
  ret: number;
  /**
   * Cumulative fraction (0–1) of this locked-in account already unlocked.
   * Batch 0C: replaces the one-shot `_split` boolean so a partial unlock at 55
   * and a later full unlock at 65 are both representable. `_split` is still
   * read at load time for saved-plan compatibility.
   */
  unlockedFraction?: number;
  /** @deprecated Batch 0C legacy flag, migrated to `unlockedFraction` on load. */
  _split?: boolean;
  /** Id of the destination account created by an unlock from this account. */
  _unlockDestId?: string;
}

/** A hard asset as mutated during a projection run. */
export interface WorkingAsset extends HardAssetInput {
  sold: boolean;
  dsDone?: boolean;
}
