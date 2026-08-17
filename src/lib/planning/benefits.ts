/**
 * CPP and OAS timing, and the statutory CPP survivor's pension.
 *
 * Ported verbatim from the verified original engine. Pure functions.
 */

import type { TaxYear } from "./taxYears";

/**
 * CPP adjustment relative to the age-65 amount:
 * -0.6%/month taken early (minimum age 60), +0.7%/month deferred (maximum 70).
 */
export function cppFactor(startAge: number): number {
  const a = Math.max(60, Math.min(70, startAge || 65));
  const m = (a - 65) * 12;
  return 1 + m * (a < 65 ? 0.006 : 0.007);
}

/**
 * OAS adjustment relative to the age-65 amount:
 * +0.6%/month deferred, to a maximum of +36% at 70. OAS cannot start before 65.
 */
export function oasFactor(startAge: number): number {
  const a = Math.max(65, Math.min(70, startAge || 65));
  return 1 + Math.max(0, a - 65) * 12 * 0.006;
}

/**
 * Statutory CPP survivor's pension, based on the DECEASED'S calculated
 * retirement pension at 65 (not the amount they actually received after any
 * early/late adjustment):
 *
 *  - survivor 65+      -> 60% of it
 *  - survivor 45-64    -> flat-rate portion + 37.5% of it
 *  - survivor 35-44    -> the same, reduced by 1/120 for each month under 45
 *                         (assuming no dependent children)
 *  - survivor under 35 -> none, unless disabled or raising the deceased's child
 *
 * The result is capped at the published survivor maximum, then capped again so
 * that the survivor's pension plus their own retirement pension does not exceed
 * the combined maximum.
 *
 * @param deceasedBase65 The deceased's age-65 CPP entitlement, inflated to the year.
 * @param survAge        The survivor's age.
 * @param survOwnCpp     The survivor's own CPP retirement pension that year.
 * @param infFac         Cumulative inflation factor, applied to the statutory caps.
 */
export function cppSurvivorBenefit(
  deceasedBase65: number,
  survAge: number,
  survOwnCpp: number,
  infFac: number,
  ty: TaxYear,
): number {
  if (!(deceasedBase65 > 0)) return 0;

  let b: number;
  if (survAge >= 65) {
    b = deceasedBase65 * 0.6;
  } else {
    b = ty.cppSurvFlat * infFac + deceasedBase65 * 0.375;
    if (survAge < 35) return 0;
    // 1/120 reduction for each month under 45
    if (survAge < 45) b *= Math.max(0, (survAge - 35) * 12) / 120;
  }

  b = Math.min(b, (survAge >= 65 ? ty.cppSurvMax65 : ty.cppSurvMaxU65) * infFac);
  // Combined-benefit ceiling
  b = Math.min(b, Math.max(0, ty.cppCombinedMax * infFac - survOwnCpp));
  return Math.max(0, b);
}
