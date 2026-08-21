/**
 * Age bases (R-1 / L-1).
 *
 * Canadian retirement law uses TWO different age bases for the two constraints
 * that sit on the same locked-in account, and they are not interchangeable:
 *
 *   - RRIF minimum — the age attained at the BEGINNING OF THE YEAR.
 *     Income Tax Regulations s.7308(3) and (4): the prescribed factor is the
 *     one corresponding to "the age in whole years ... attained by the
 *     individual at the beginning of that year or that would have been so
 *     attained by the individual if the individual had been alive at the
 *     beginning of that year". Ontario Reg. 909 requires a LIF to pay at least
 *     the minimum amount prescribed for a RRIF, so the LIF/PRRIF floor takes
 *     this same basis.
 *
 *   - Ontario LIF maximum — the age ATTAINED DURING THE FISCAL YEAR.
 *     Reg. 909, Schedules 1 and 1.1, s.6 define F as the present value, at the
 *     beginning of the fiscal year, of an annuity ending December 31 of the
 *     year the owner reaches 90. The valuation date is the start of the year,
 *     but the period count is driven by the year the owner turns 90, so an
 *     owner attaining 65 during the year has 26 annual-in-advance periods at
 *     6% — exactly FSRA Appendix A's 7.25513%.
 *
 * Both helpers are pure: date of birth and calendar year in, whole-year age
 * out. Neither reads the clock. They differ by exactly one year except for a
 * January-1 birthday, where they coincide.
 *
 * Verified against primary sources 2026-08-21.
 */

/** Parsed `yyyy-mm-dd`, or null when the string is missing or not a real date. */
function parseDob(dob: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!dob) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || y < 1850 || y > 2200) return null;
  if (mo < 1 || mo > 12 || d < 1) return null;
  // Real calendar date, leap years included.
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > daysInMonth) return null;
  return { y, m: mo, d };
}

/**
 * Whole-year age on January 1 of `year` — the RRIF minimum basis
 * (ITR s.7308(3)/(4)).
 *
 * Only a January-1 birthday has already occurred on January 1, so everyone
 * else is one year younger than their age attained during the year.
 *
 * Returns null when the date of birth is missing or unparsable, or when the
 * person is not yet born at the start of `year`.
 */
export function ageAtBeginningOfYear(
  dob: string | null | undefined,
  year: number,
): number | null {
  const b = parseDob(dob);
  if (!b || !Number.isFinite(year)) return null;
  const bornOnJan1 = b.m === 1 && b.d === 1;
  const age = year - b.y - (bornOnJan1 ? 0 : 1);
  return age < 0 ? null : age;
}

/**
 * Whole-year age reached on or before December 31 of `year` — the Ontario LIF
 * maximum basis (Reg. 909 Sch. 1/1.1 s.6, as published in FSRA Appendix A).
 *
 * Returns null when the date of birth is missing or unparsable, or when the
 * person is not yet born during `year`.
 */
export function ageAttainedDuringYear(
  dob: string | null | undefined,
  year: number,
): number | null {
  const b = parseDob(dob);
  if (!b || !Number.isFinite(year)) return null;
  const age = year - b.y;
  return age < 0 ? null : age;
}
