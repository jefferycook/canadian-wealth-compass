/**
 * Typed plan inputs for the Canadian retirement & tax projection engine.
 *
 * These types are the contract that replaced the original tool's DOM scraping.
 * The engine is pure: it reads a `PlanInputs` object and returns a
 * `ProjectionResult`. Nothing here touches the browser, storage, or network.
 */

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
  | "QC";

export type AccountType =
  | "RRSP"
  | "RRIF"
  | "LIRA"
  | "LIF"
  | "DCPP"
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

export interface BridgeInput {
  /** Annual bridge benefit in today's dollars. */
  amt: number;
  /** Age the bridge ends (usually 65, when CPP/OAS begin). */
  end: number;
}

export interface PersonInput {
  id: PersonKey;
  firstName: string;
  lastName: string;
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
  tfsaRoom?: number | null;
  rrspRoom?: number | null;
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
  /** Annual contribution in today's dollars. */
  contrib: number;
  /** Contribute until this owner age. 0 = no end. */
  contribEnd: number;
  /** Scheduled annual withdrawal in today's dollars. */
  wd: number;
  wdStart: number;
  wdEnd: number;
  mix: ReturnMix;
}

export interface ExpenseInput {
  name: string;
  /** Person A's age when the expense lands. */
  age: number;
  /** Amount in today's dollars. */
  amt: number;
}

export interface OtherIncomeInput {
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
  name: string;
  /** Owner's age when it arrives. */
  age: number;
  amt: number;
  dest: AccountType;
  owner: PersonKey;
  taxable: boolean;
}

export interface HardAssetInput {
  name: string;
  /** Current value. */
  val: number;
  /** Annual appreciation as a fraction (0.03 = 3%). */
  apr: number;
  /** Person A's age at full sale. 0 = never. */
  sale: number;
  /** Person A's age at downsize. 0 = never. */
  dsAge: number;
  /** Percent of value freed by the downsize. */
  dsPct: number;
  /** Whether a gain on sale is taxable (a principal residence is not). */
  taxable: boolean;
  acb: number;
}

export interface LiabilityInput {
  name: string;
  bal: number;
  /** Annual interest rate as a fraction. */
  rate: number;
  /** Annual payment. */
  pay: number;
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
  /** Household after-tax spending need in today's dollars. */
  spendNeed: number;
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
  pensionEligible: number;
  oasReceived: number;
  age: number;
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
  depleted: boolean;
  /** Total remaining in LIF accounts. */
  lifRemaining: number;
  /** True when a shortfall is driven by LIF maximum-withdrawal limits. */
  lifBound: boolean;
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
  owner?: OwnerKey;
}

export interface ProjectionOverride {
  strategy?: WithdrawalStrategy;
  /** Replace the spending target outright. */
  spendSet?: number;
  /** Add to the spending target. */
  spendAdj?: number;
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
  /** Set once a locked-in account has been partially unlocked. */
  _split?: boolean;
}

/** A hard asset as mutated during a projection run. */
export interface WorkingAsset extends HardAssetInput {
  sold: boolean;
  dsDone?: boolean;
}
