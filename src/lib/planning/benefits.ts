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
 * Last calendar year for which the pre-2019 survivor age rule applies. CPP Act
 * s.44(1)(d)(i) ("before 2019") and s.58(1)(a) ("any month before January
 * 2019") versus s.44(1)(d)(ii) ("after 2018") and s.58(1)(a.1) ("any month
 * after December 2018"). The boundary falls on a calendar-year edge, so an
 * annual model represents it exactly.
 */
export const CPP_SURVIVOR_LEGACY_AGE_RULE_LAST_YEAR = 2018;

/**
 * Statutory CPP survivor's pension, based on the DECEASED'S calculated
 * retirement pension at 65 (not the amount they actually received after any
 * early/late adjustment):
 *
 *  - survivor 65+      -> 60% of it (CPP Act s.58(1)(b))
 *  - survivor under 65 -> flat-rate portion + 37.5% of it
 *
 * Payable year matters for an under-45 survivor:
 *
 *  - Payable AFTER 2018 (s.44(1)(d)(ii), s.58(1)(a.1)): survivor age alone
 *    neither excludes nor reduces the pension. Every projection year the
 *    engine models (base year 2026 onward) is in this regime.
 *  - Payable BEFORE 2019 (s.44(1)(d)(i), s.58(1)(a)) — historical rule,
 *    preserved for historical payable years only, assuming no dependent
 *    children and no disability: survivor under 35 -> none; survivor 35-44 ->
 *    reduced by 1/120 for each month under 45. Legacy approximation: the
 *    statute measures age at the contributor's death; this uses `survAge`.
 *
 * The result is capped at the published survivor maximum, then capped again so
 * that the survivor's pension plus their own retirement pension does not exceed
 * the combined maximum.
 *
 * @param deceasedBase65 The deceased's age-65 CPP entitlement, inflated to the year.
 * @param survAge        The survivor's age.
 * @param survOwnCpp     The survivor's own CPP retirement pension that year.
 * @param infFac         Cumulative inflation factor, applied to the statutory caps.
 * @param ty             Tax-year parameters (flat rate and survivor/combined caps).
 * @param payableYear    Calendar year for which the pension is payable. Defaults
 *                       to `ty.year`. Years up to {@link CPP_SURVIVOR_LEGACY_AGE_RULE_LAST_YEAR}
 *                       apply the pre-2019 age rule; later years do not.
 */
export function cppSurvivorBenefit(
  deceasedBase65: number,
  survAge: number,
  survOwnCpp: number,
  infFac: number,
  ty: TaxYear,
  payableYear: number = ty.year,
): number {
  if (!(deceasedBase65 > 0)) return 0;

  let b: number;
  if (survAge >= 65) {
    b = deceasedBase65 * 0.6;
  } else {
    b = ty.cppSurvFlat * infFac + deceasedBase65 * 0.375;
    if (payableYear <= CPP_SURVIVOR_LEGACY_AGE_RULE_LAST_YEAR) {
      // Pre-2019 only (s.44(1)(d)(i), s.58(1)(a)): no pension under 35, and a
      // 1/120 reduction for each month under 45.
      if (survAge < 35) return 0;
      if (survAge < 45) b *= Math.max(0, (survAge - 35) * 12) / 120;
    }
  }

  b = Math.min(b, (survAge >= 65 ? ty.cppSurvMax65 : ty.cppSurvMaxU65) * infFac);
  // Combined-benefit ceiling
  b = Math.min(b, Math.max(0, ty.cppCombinedMax * infFac - survOwnCpp));
  return Math.max(0, b);
}
