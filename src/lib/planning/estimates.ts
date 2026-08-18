/**
 * Estimators for people who don't know their own numbers.
 *
 * Everything here reads the statutory figures from the rules layer
 * (`taxYears.ts`) and returns amounts in *today's* dollars, because the
 * projection indexes benefits by the plan's inflation rate on its own. The
 * only nominal figure produced is `indexedAmount`, used purely to show a
 * client what the estimate is likely to look like in the year it starts.
 */

import { getTaxYear } from "./taxYears";

/** How strong a contributor's CPP earnings record is. */
export type CppEarningsLevel = "max" | "aboveAverage" | "average" | "partial";

export const CPP_LEVEL_LABELS: Record<CppEarningsLevel, string> = {
  max: "Maximum — earned at or above the CPP ceiling for 39+ years",
  aboveAverage: "Above average — steady, well-paid career",
  average: "Average — what a typical new retiree receives",
  partial: "Partial — interrupted work history or lower earnings",
};

/**
 * Share of the maximum CPP retirement pension. The "average" case is anchored
 * to the published average new benefit for the tax year, not to a guess.
 */
export function cppShare(level: CppEarningsLevel, year: number): number {
  const y = getTaxYear(year);
  const avgShare = y.cppAvgNew65 / y.cppMax65;
  switch (level) {
    case "max":
      return 1;
    case "aboveAverage":
      return (1 + avgShare) / 2;
    case "average":
      return avgShare;
    case "partial":
      return avgShare * 0.65;
  }
}

/** Annual CPP retirement pension at 65, in today's dollars. */
export function estimateCppAt65(level: CppEarningsLevel, year: number): number {
  const y = getTaxYear(year);
  return Math.round(y.cppMax65 * cppShare(level, year));
}

/**
 * Annual OAS at 65, in today's dollars. OAS is residence-based: 40 years in
 * Canada after 18 earns the full pension, and less is prorated in fortieths.
 */
export function estimateOasAt65(residenceYears: number, year: number): number {
  const y = getTaxYear(year);
  const fortieths = Math.max(0, Math.min(40, Math.round(residenceYears))) / 40;
  return Math.round(y.oasMax65 * fortieths);
}

/**
 * What a today's-dollar amount is likely to be worth in nominal dollars when
 * it starts. CPP and OAS are indexed, so someone 30 years from 65 should see
 * a much larger cheque than the figure they enter here.
 */
export function indexedAmount(todayAmount: number, inflation: number, years: number): number {
  if (years <= 0) return Math.round(todayAmount);
  return Math.round(todayAmount * Math.pow(1 + inflation, years));
}

/**
 * Level monthly payment that fully amortizes a balance. Canadian mortgages are
 * quoted with semi-annual compounding, so the nominal rate is converted to an
 * effective monthly rate before the annuity formula is applied.
 */
export function monthlyMortgagePayment(
  balance: number,
  annualRate: number,
  amortYears: number,
  semiAnnualCompounding = true,
): number {
  const n = Math.round(amortYears * 12);
  if (balance <= 0 || n <= 0) return 0;
  const i = semiAnnualCompounding
    ? Math.pow(1 + annualRate / 2, 1 / 6) - 1
    : annualRate / 12;
  if (i <= 0) return Math.round((balance / n) * 100) / 100;
  const pay = (balance * i) / (1 - Math.pow(1 + i, -n));
  return Math.round(pay * 100) / 100;
}

/** Years until a given age, from a date of birth. Null when the DOB is blank. */
export function yearsUntilAge(dob: string | null, age: number | null): number | null {
  if (!dob || age == null) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  const exact =
    (now.getTime() - born.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
  return Math.max(0, age - exact);
}
