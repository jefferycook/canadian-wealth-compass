/**
 * Draft plans — what a client is part-way through entering.
 *
 * The engine (`PlanInputs`) is strict: every number is a number. A person
 * filling in a wizard has not answered most of it yet, and "not answered" is
 * not the same as zero. So intake works on a `PlanDraft`, where every
 * person-specific field starts as `null`, and only a complete draft is
 * normalized into `PlanInputs` for the engine to run.
 *
 * This keeps unanswered state out of the calculation layer entirely.
 */

import type {
  AccountInput,
  AccountType,
  ExpenseInput,
  HardAssetInput,
  LiabilityInput,
  LumpSumInput,
  OtherIncomeInput,
  PersonInput,
  PersonKey,
  PlanInputs,
  PlanType,
  ProvinceKey,
  WithdrawalStrategy,
} from "./types";
import { getProvince, getTaxYear, LATEST_TAX_YEAR } from "./taxYears";

/** Every property becomes answerable-or-not. */
type Unanswered<T> = { [K in keyof T]: T[K] | null };

export type BenefitDraft = { amt: number | null; age: number | null };
export type BridgeDraft = { amt: number | null; end: number | null };

export interface PersonDraft {
  id: PersonKey;
  firstName: string;
  lastName: string;
  dob: string | null;
  curAge: number | null;
  retAge: number | null;
  employ: number | null;
  deathAge: number | null;
  cpp: BenefitDraft;
  oas: BenefitDraft;
  pen: BenefitDraft;
  bridge: BridgeDraft;
  gender?: string;
  tfsaRoom: number | null;
  rrspRoom: number | null;
  /** RRSP deduction limit from the Notice of Assessment. */
  rrspDeductionLimitOpen: number | null;
  /** Contributions already made but not yet deducted. */
  rrspUndeductedContributions: number | null;
  /** Pension adjustment. Null means unknown, which is disclosed, not assumed. */
  pensionAdjustment: number | null;
}

export interface TaxSettingsDraft {
  /** Chosen by the client in intake; null until they pick. */
  provinceKey: ProvinceKey | null;
  /** Overrides of the statutory figures. Null means "use the rules layer". */
  fedBPA: number | null;
  provBPA: number | null;
  oasThresh: number | null;
  lifRate: number | null;
}

export interface PlanDraft {
  taxYear: number;
  planType: PlanType;
  endAge: number;
  inflation: number;
  eqRet: number;
  fiRet: number;
  survivorPct: number;
  strategy: WithdrawalStrategy;
  /** Household after-tax spending need in retirement. Null until they say. */
  spendNeed: number | null;
  /** Household after-tax spending today, while working. Null until they say. */
  currentSpend: number | null;
  tax: TaxSettingsDraft;
  people: PersonDraft[];
  accounts: AccountInput[];
  expenses: ExpenseInput[];
  otherIncome: OtherIncomeInput[];
  lumpSums: LumpSumInput[];
  hardAssets: HardAssetInput[];
  liabilities: LiabilityInput[];
}

/** Display names for the account types, used when a client leaves it blank. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  RRSP: "RRSP",
  RRIF: "RRIF",
  TFSA: "TFSA",
  NONREG: "Non-registered account",
  LIRA: "LIRA",
  LIF: "LIF",
  PRRIF: "Prescribed RRIF (PRRIF)",

  DCPP: "Defined-contribution pension",
};

export function accountTypeLabel(t: AccountType): string {
  return ACCOUNT_TYPE_LABELS[t] ?? t;
}

const num = (v: number | null | undefined, fallback: number) =>
  v == null || Number.isNaN(v) ? fallback : v;

function normalizePerson(p: PersonDraft): PersonInput {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    ...(p.dob ? { dob: p.dob } : {}),
    curAge: num(p.curAge, 0),
    // 999 is the engine's "never works" sentinel; a client who hasn't given a
    // retirement age is not asserting that they retire today.
    retAge: num(p.retAge, 999),
    employ: num(p.employ, 0),
    deathAge: num(p.deathAge, 0),
    cpp: { amt: num(p.cpp.amt, 0), age: num(p.cpp.age, 65) },
    oas: { amt: num(p.oas.amt, 0), age: num(p.oas.age, 65) },
    pen: { amt: num(p.pen.amt, 0), age: num(p.pen.age, 65) },
    bridge: { amt: num(p.bridge.amt, 0), end: num(p.bridge.end, 65) },
    ...(p.gender ? { gender: p.gender } : {}),
    tfsaRoom: p.tfsaRoom,
    rrspRoom: p.rrspRoom,
    rrspDeductionLimitOpen: p.rrspDeductionLimitOpen,
    rrspUndeductedContributions: p.rrspUndeductedContributions,
    pensionAdjustment: p.pensionAdjustment,
  };
}

/**
 * Turn a draft into engine inputs. Unanswered statutory overrides fall back to
 * the rules layer for the chosen tax year and province — never to a number
 * hard-coded here.
 */
export function normalizeDraft(d: PlanDraft): PlanInputs {
  const year = getTaxYear(d.taxYear);
  const provinceKey: ProvinceKey = d.tax.provinceKey ?? "ON";
  const prov = getProvince(year, provinceKey);
  return {
    taxYear: d.taxYear,
    planType: d.planType,
    endAge: d.endAge,
    inflation: d.inflation,
    spendNeed: num(d.spendNeed, 0),
    currentSpend: d.currentSpend,
    eqRet: d.eqRet,
    fiRet: d.fiRet,
    survivorPct: d.survivorPct,
    strategy: d.strategy,
    tax: {
      provinceKey,
      fedBPA: num(d.tax.fedBPA, year.fedBpaMax),
      provBPA: num(d.tax.provBPA, prov.bpa),
      oasThresh: num(d.tax.oasThresh, year.oasThreshold),
      lifRate: num(d.tax.lifRate, 6.0),
    },
    people: d.people.map(normalizePerson),
    accounts: d.accounts.map((a) => ({
      ...a,
      name: a.name?.trim() || accountTypeLabel(a.type),
    })),
    expenses: d.expenses,
    otherIncome: d.otherIncome,
    lumpSums: d.lumpSums,
    hardAssets: d.hardAssets,
    liabilities: d.liabilities,
  };
}

/** Convenience for tests and for reopening a completed plan as a draft. */
export function draftFromInputs(p: PlanInputs): PlanDraft {
  return {
    taxYear: p.taxYear,
    planType: p.planType,
    endAge: p.endAge,
    inflation: p.inflation,
    eqRet: p.eqRet,
    fiRet: p.fiRet,
    survivorPct: p.survivorPct,
    strategy: p.strategy,
    spendNeed: p.spendNeed,
    currentSpend: p.currentSpend ?? null,
    tax: { ...p.tax },
    people: p.people.map((x) => ({
      id: x.id,
      firstName: x.firstName,
      lastName: x.lastName,
      dob: x.dob ?? null,
      curAge: x.curAge,
      retAge: x.retAge,
      employ: x.employ,
      deathAge: x.deathAge,
      cpp: { ...x.cpp },
      oas: { ...x.oas },
      pen: { ...x.pen },
      bridge: { ...x.bridge },
      ...(x.gender ? { gender: x.gender } : {}),
      tfsaRoom: x.tfsaRoom ?? null,
      rrspRoom: x.rrspRoom ?? null,
      rrspDeductionLimitOpen: x.rrspDeductionLimitOpen ?? null,
      rrspUndeductedContributions: x.rrspUndeductedContributions ?? null,
      pensionAdjustment: x.pensionAdjustment ?? null,
    })),
    accounts: p.accounts,
    expenses: p.expenses,
    otherIncome: p.otherIncome,
    lumpSums: p.lumpSums,
    hardAssets: p.hardAssets,
    liabilities: p.liabilities,
  };
}

export const LATEST_YEAR = LATEST_TAX_YEAR;
export type { Unanswered };
