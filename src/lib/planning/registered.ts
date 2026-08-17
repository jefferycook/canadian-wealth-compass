/**
 * Registered-account mechanics: RRIF minimums, LIF maximums, and the
 * jurisdictional unlocking rules for locked-in money.
 *
 * Ported verbatim from the verified original engine. Pure functions.
 */

import type { JurisdictionKey } from "./types";

/**
 * Statutory RRIF minimum withdrawal factors (percent), fixed in the
 * Income Tax Act. Below 71 the factor is 1/(90 - age).
 */
export const RRIF_MIN: Record<number, number> = {
  71: 5.28,
  72: 5.4,
  73: 5.53,
  74: 5.67,
  75: 5.82,
  76: 5.98,
  77: 6.17,
  78: 6.36,
  79: 6.58,
  80: 6.82,
  81: 7.08,
  82: 7.38,
  83: 7.71,
  84: 8.08,
  85: 8.51,
  86: 8.99,
  87: 9.55,
  88: 10.21,
  89: 10.99,
  90: 11.92,
  91: 13.06,
  92: 14.49,
  93: 16.34,
  94: 18.79,
  95: 20.0,
};

/** RRIF minimum withdrawal factor as a percentage of the balance. */
export function rrifMinFactor(age: number): number {
  if (age >= 95) return 20.0;
  if (age >= 71) return RRIF_MIN[age]!;
  return 100 / (90 - age);
}

/**
 * FSRA Ontario LIF maximum withdrawal percentages by age. The reference rate
 * is floored at 6%, which has left this table unchanged since 2021.
 */
export const ON_LIF_MAX: Record<number, number> = {
  50: 6.27,
  51: 6.31,
  52: 6.35,
  53: 6.4,
  54: 6.45,
  55: 6.51,
  56: 6.57,
  57: 6.63,
  58: 6.7,
  59: 6.77,
  60: 6.85,
  61: 6.94,
  62: 7.04,
  63: 7.14,
  64: 7.26,
  65: 7.38,
  66: 7.52,
  67: 7.67,
  68: 7.83,
  69: 8.02,
  70: 8.22,
  71: 8.45,
  72: 8.71,
  73: 9.0,
  74: 9.34,
  75: 9.71,
  76: 10.15,
  77: 10.66,
  78: 11.25,
  79: 11.96,
  80: 12.82,
  81: 13.87,
  82: 15.19,
  83: 16.9,
  84: 19.19,
  85: 22.4,
  86: 27.23,
  87: 35.29,
  88: 51.46,
  89: 100.0,
};

/**
 * LIF maximum withdrawal factor as a percentage of the balance.
 *
 * Ontario uses the published FSRA table. Other jurisdictions use the
 * annuity-formula approximation at the reference rate — an approximation the
 * original tool disclosed, and one to replace with published tables before
 * relying on it for a specific client.
 */
export function lifMaxFactor(
  age: number,
  provinceKey: string,
  ratePct: number,
): number {
  if (provinceKey === "ON") {
    if (age >= 89) return 100;
    if (age < 50) return ON_LIF_MAX[50]!;
    return ON_LIF_MAX[age] ?? 100;
  }
  if (age >= 90) return 100;
  const r = ratePct / 100;
  const n = 90 - age;
  const a = (1 - Math.pow(1 + r, -n)) / r;
  return Math.min(100, 100 / a);
}

export interface UnlockRule {
  name: string;
  /** Maximum percentage that may be unlocked into an RRSP. */
  pct: number;
  /** Earliest age the unlock is available. 999 = not permitted. */
  minAge: number;
  /** Jurisdictions permitting a full unlock at 65 (e.g. Manitoba). */
  full65?: boolean;
  /** Jurisdictions that removed the LIF maximum for 55+ (Quebec). */
  noMax55?: boolean;
}

/**
 * Unlocking rules by PENSION jurisdiction — where the money originated, which
 * is not necessarily the client's province of residence. These are the general
 * age-based rules; client-specific circumstances should be verified.
 */
export const UNLOCK_RULES: Record<JurisdictionKey, UnlockRule> = {
  ON: { name: "Ontario", pct: 50, minAge: 55 },
  FED: { name: "Federal", pct: 50, minAge: 55 },
  AB: { name: "Alberta", pct: 50, minAge: 50 },
  MB: { name: "Manitoba", pct: 50, minAge: 55, full65: true },
  NS: { name: "Nova Scotia", pct: 50, minAge: 55 },
  NB: { name: "New Brunswick", pct: 25, minAge: 55 },
  BC: { name: "British Columbia", pct: 0, minAge: 999 },
  QC: { name: "Quebec", pct: 0, minAge: 999, noMax55: true },
};

export function unlockRule(juris: JurisdictionKey | undefined): UnlockRule {
  return UNLOCK_RULES[juris ?? "ON"] ?? UNLOCK_RULES.ON;
}
