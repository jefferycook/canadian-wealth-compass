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

/* ------------------------------------------------------------------ */
/* Batch 0C — locked-in rule records with COMPONENT-LEVEL status       */
/* (canonical spec v1.2 FINAL, Erratum 4B / §13.2a)                    */
/* ------------------------------------------------------------------ */

export type RuleStatus = "VERIFIED" | "APPROXIMATE" | "UNSUPPORTED";

export interface RuleSource {
  title: string;
  publisher: string;
  url: string;
  tier: 1 | 2 | 3;
}

/**
 * One rule COMPONENT's provenance and status. Status attaches to the component
 * — never to a whole jurisdiction — and is gated at the point of use (§13.2a).
 */
export interface RuleComponent {
  source: RuleSource;
  /** ISO date the value was last checked against `source`. */
  verifiedDate: string;
  status: RuleStatus;
  notes?: string;
}

/** The three locked-in components a calculation can read. */
export type UnlockComponentKey =
  | "unlockEntitlement"
  | "destinationVehicle"
  | "lifMaximum";

export interface UnlockRule {
  name: string;
  /** Percentage available as the partial (age-based) unlock. */
  partialPct: number;
  /** Earliest age the partial unlock is available. 999 = not permitted. */
  partialMinAge: number;
  /** Age from which the ENTIRE remaining balance may be unlocked (Manitoba). */
  fullUnlockAge?: number;
  /** Vehicle the unlocked money must land in. */
  destinationType: "RRSP" | "PRRIF";
  /** A distinct vehicle the money must pass through first. */
  requiresVehicle?: "RLIF" | "ScheduleLIF";
  /** Days available to complete the transfer once the vehicle is established. */
  transferWindowDays?: number;
  /** True where the entitlement may be used only once, with no carry-forward. */
  oneTime: boolean;
  /** Age from which no LIF maximum applies (Quebec: 55). */
  lifMaxNoneFromAge?: number;
  /** Procedural detail a client would need in order to act. */
  notes: string;

  /* Component-level metadata (Erratum 4B). */
  unlockEntitlement: RuleComponent;
  destinationVehicle: RuleComponent;
  lifMaximum: RuleComponent;

  /* ---- Legacy derived aliases, kept so existing callers/tests hold ---- */
  /** @deprecated use `partialPct`. */
  pct: number;
  /** @deprecated use `partialMinAge`. */
  minAge: number;
  /** @deprecated use `fullUnlockAge`. */
  full65?: boolean | undefined;
  /** @deprecated use `lifMaxNoneFromAge`. */
  noMax55?: boolean | undefined;
  /** @deprecated use `unlockEntitlement.status`. */
  verified?: boolean;
}

type UnlockRuleSpec = Omit<
  UnlockRule,
  "pct" | "minAge" | "full65" | "noMax55" | "verified"
>;

function rule(spec: UnlockRuleSpec): UnlockRule {
  return {
    ...spec,
    pct: spec.partialPct,
    minAge: spec.partialMinAge,
    full65: spec.fullUnlockAge === 65 ? true : undefined,
    noMax55: spec.lifMaxNoneFromAge === 55 ? true : undefined,
    verified: spec.unlockEntitlement.status === "VERIFIED",
  };
}

const FORMULA_LIF_MAX: RuleComponent = {
  source: {
    title: "Annuity-formula LIF maximum approximation (6% reference rate)",
    publisher: "Engine internal (no published table implemented)",
    url: "internal://lifMaxFactor",
    tier: 3,
  },
  verifiedDate: "2026-08-21",
  status: "APPROXIMATE",
  notes:
    "Real maximums are set per regulator with their own reference-rate mechanics; this is a labelled approximation.",
};

/**
 * Unlocking rules by PENSION jurisdiction — where the money originated, which
 * is not necessarily the client's province of residence.
 */
export const UNLOCK_RULES: Record<JurisdictionKey, UnlockRule> = {
  ON: rule({
    name: "Ontario",
    partialPct: 50,
    partialMinAge: 55,
    destinationType: "RRSP",
    requiresVehicle: "ScheduleLIF",
    transferWindowDays: 60,
    oneTime: true,
    notes:
      "50% of the amount transferred into a Schedule 1.1 LIF may be unlocked using Form 5.2 within 60 days of the transfer. One-time per transfer; spousal consent generally required.",
    unlockEntitlement: {
      source: {
        title: "Unlocking funds from a LIF (Schedule 1.1), Form 5.2",
        publisher: "Financial Services Regulatory Authority of Ontario (FSRA)",
        url: "https://www.fsrao.ca/consumers/pensions/unlocking-funds-pension-plan-or-locked-account",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
    },
    destinationVehicle: {
      source: {
        title: "Schedule 1.1 LIF unlocking — transfer to an RRSP or RRIF",
        publisher: "Financial Services Regulatory Authority of Ontario (FSRA)",
        url: "https://www.fsrao.ca/consumers/pensions/unlocking-funds-pension-plan-or-locked-account",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
    },
    lifMaximum: {
      source: {
        title: "LIF maximum withdrawal percentages table",
        publisher: "Financial Services Regulatory Authority of Ontario (FSRA)",
        url: "https://www.fsrao.ca/consumers/pensions/life-income-funds-lifs-maximum-annual-income-payment-amount-table",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
    },
  }),
  FED: rule({
    name: "Federal (PBSA)",
    partialPct: 50,
    partialMinAge: 55,
    destinationType: "RRSP",
    requiresVehicle: "RLIF",
    transferWindowDays: 60,
    oneTime: true,
    notes:
      "Funds must first be transferred to a Restricted Life Income Fund (RLIF); within 60 days of the RLIF being established up to 50% of its balance on the withdrawal date may move to an RRSP or RRIF. One-time only, with no carry-forward: unlocking less than 50% forfeits the remainder of the entitlement.",
    unlockEntitlement: {
      source: {
        title: "Unlocking funds from a pension plan or locked-in retirement savings",
        publisher: "Office of the Superintendent of Financial Institutions (OSFI)",
        url: "https://www.osfi-bsif.gc.ca/en/pension-plans/pension-plans-guidance/unlocking-funds-pension-plan-or-locked-retirement-savings-plan",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
      notes: "RLIF required; 60-day window; one-time; no carry-forward.",
    },
    destinationVehicle: {
      source: {
        title: "RLIF one-time 50% transfer to an RRSP or RRIF",
        publisher: "Office of the Superintendent of Financial Institutions (OSFI)",
        url: "https://www.osfi-bsif.gc.ca/en/pension-plans/pension-plans-guidance/unlocking-funds-pension-plan-or-locked-retirement-savings-plan",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
    },
    lifMaximum: FORMULA_LIF_MAX,
  }),
  AB: rule({
    name: "Alberta",
    partialPct: 50,
    partialMinAge: 50,
    destinationType: "RRSP",
    oneTime: true,
    notes:
      "Headline 50% from age 50, carried from the original engine and not re-verified against the Alberta superintendent for v1.2.",
    unlockEntitlement: {
      source: {
        title: "Alberta unlocking percentage carried from the original engine",
        publisher: "Not re-verified for v1.2",
        url: "internal://unverified",
        tier: 3,
      },
      verifiedDate: "2026-08-21",
      status: "APPROXIMATE",
    },
    destinationVehicle: {
      source: {
        title: "Assumed RRSP destination, not re-verified",
        publisher: "Not re-verified for v1.2",
        url: "internal://unverified",
        tier: 3,
      },
      verifiedDate: "2026-08-21",
      status: "APPROXIMATE",
    },
    lifMaximum: FORMULA_LIF_MAX,
  }),
  MB: rule({
    name: "Manitoba",
    partialPct: 50,
    partialMinAge: 55,
    fullUnlockAge: 65,
    destinationType: "PRRIF",
    transferWindowDays: 30,
    oneTime: false,
    notes:
      "Age 55+: a once-in-a-lifetime transfer of up to 50% of LIRA/LIF balances to a prescribed RRIF (PRRIF); where funds come from more than one plan the transfers must be completed within 30 days. Age 65+: the balance of one or more LIRAs or LIFs may be unlocked, with no percentage limit and no YMPE ceiling. These are two sequential entitlements.",
    unlockEntitlement: {
      source: {
        title: "Policy Bulletin #1 — unlocking; Bill 8 in force 1 Oct 2021",
        publisher: "Manitoba Pension Commission",
        url: "https://www.gov.mb.ca/finance/pension/",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
    },
    destinationVehicle: {
      source: {
        title: "Prescribed RRIF (PRRIF) as the 50%-at-55 destination",
        publisher: "Manitoba Pension Commission",
        url: "https://www.gov.mb.ca/finance/pension/",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
      notes: "A PRRIF carries mandatory RRIF minimum withdrawals and no maximum.",
    },
    lifMaximum: FORMULA_LIF_MAX,
  }),
  NS: rule({
    name: "Nova Scotia",
    partialPct: 50,
    partialMinAge: 55,
    destinationType: "RRSP",
    oneTime: true,
    notes:
      "Headline 50% at 55, carried from the original engine and not re-verified for v1.2.",
    unlockEntitlement: {
      source: {
        title: "Nova Scotia unlocking percentage carried from the original engine",
        publisher: "Not re-verified for v1.2",
        url: "internal://unverified",
        tier: 3,
      },
      verifiedDate: "2026-08-21",
      status: "APPROXIMATE",
    },
    destinationVehicle: {
      source: {
        title: "Assumed RRSP destination, not re-verified",
        publisher: "Not re-verified for v1.2",
        url: "internal://unverified",
        tier: 3,
      },
      verifiedDate: "2026-08-21",
      status: "APPROXIMATE",
    },
    lifMaximum: FORMULA_LIF_MAX,
  }),
  NB: rule({
    name: "New Brunswick",
    partialPct: 25,
    partialMinAge: 55,
    destinationType: "RRSP",
    oneTime: true,
    notes:
      "Headline 25% at 55, carried from the original engine and not re-verified for v1.2.",
    unlockEntitlement: {
      source: {
        title: "New Brunswick unlocking percentage carried from the original engine",
        publisher: "Not re-verified for v1.2",
        url: "internal://unverified",
        tier: 3,
      },
      verifiedDate: "2026-08-21",
      status: "APPROXIMATE",
    },
    destinationVehicle: {
      source: {
        title: "Assumed RRSP destination, not re-verified",
        publisher: "Not re-verified for v1.2",
        url: "internal://unverified",
        tier: 3,
      },
      verifiedDate: "2026-08-21",
      status: "APPROXIMATE",
    },
    lifMaximum: FORMULA_LIF_MAX,
  }),
  BC: rule({
    name: "British Columbia",
    partialPct: 0,
    partialMinAge: 999,
    destinationType: "RRSP",
    oneTime: true,
    notes:
      "No general age-based unlocking is modelled; carried from the original engine and not re-verified for v1.2.",
    unlockEntitlement: {
      source: {
        title: "British Columbia treatment carried from the original engine",
        publisher: "Not re-verified for v1.2",
        url: "internal://unverified",
        tier: 3,
      },
      verifiedDate: "2026-08-21",
      status: "APPROXIMATE",
    },
    destinationVehicle: {
      source: {
        title: "No unlocking destination applies",
        publisher: "Not re-verified for v1.2",
        url: "internal://unverified",
        tier: 3,
      },
      verifiedDate: "2026-08-21",
      status: "APPROXIMATE",
    },
    lifMaximum: FORMULA_LIF_MAX,
  }),
  QC: rule({
    name: "Quebec",
    partialPct: 0,
    partialMinAge: 999,
    destinationType: "RRSP",
    oneTime: true,
    lifMaxNoneFromAge: 55,
    notes:
      "LIF to RRSP/RRIF transfers are prohibited at any age, which is why the unlock percentage is zero. From age 55 no LIF maximum applies; under 55 a maximum still applies, computed from a prescribed rate, and temporary-income provisions remain. Age is determined at the date of application.",
    unlockEntitlement: {
      source: {
        title: "Life income fund (LIF) — transfers and withdrawals",
        publisher: "Retraite Québec",
        url: "https://www.retraitequebec.gouv.qc.ca/en/retraite/RCR/Pages/frv.aspx",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
      notes: "LIF → RRSP/RRIF transfers prohibited at any age.",
    },
    destinationVehicle: {
      source: {
        title: "No permitted unlocking destination",
        publisher: "Retraite Québec",
        url: "https://www.retraitequebec.gouv.qc.ca/en/retraite/RCR/Pages/frv.aspx",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
    },
    lifMaximum: {
      source: {
        title:
          "LIF maximum — no maximum from age 55 (1 Jan 2025); under 55 a prescribed-rate maximum applies",
        publisher: "Retraite Québec",
        url: "https://www.retraitequebec.gouv.qc.ca/en/retraite/RCR/Pages/frv.aspx",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      // The 55+ "no maximum" rule is verified; the UNDER-55 maximum is modelled
      // with the generic annuity approximation rather than Quebec's prescribed
      // rate, so the component that a below-55 calculation reads is APPROXIMATE.
      status: "APPROXIMATE",
      notes:
        "No maximum applies from age 55 (verified). The under-55 maximum uses the generic annuity approximation, not Quebec's prescribed-rate formula, and temporary income is unmodelled.",
    },
  }),
  SK: rule({
    name: "Saskatchewan",
    partialPct: 0,
    partialMinAge: 999,
    destinationType: "RRSP",
    oneTime: true,
    notes:
      "Saskatchewan locked-in rules were not regulator-verified for v1.2 and are UNSUPPORTED (Erratum 4). No unlocking, destination or LIF-maximum behaviour is modelled; locked-in results are withheld rather than substituted from another jurisdiction.",
    unlockEntitlement: {
      source: {
        title: "Not verified — Saskatchewan out of scope for Batch 0C (Erratum 4)",
        publisher: "Canonical specification v1.2 FINAL",
        url: "internal://unsupported",
        tier: 3,
      },
      verifiedDate: "2026-08-21",
      status: "UNSUPPORTED",
    },
    destinationVehicle: {
      source: {
        title: "Not verified — Saskatchewan out of scope for Batch 0C (Erratum 4)",
        publisher: "Canonical specification v1.2 FINAL",
        url: "internal://unsupported",
        tier: 3,
      },
      verifiedDate: "2026-08-21",
      status: "UNSUPPORTED",
    },
    lifMaximum: {
      source: {
        title: "Not verified — Saskatchewan out of scope for Batch 0C (Erratum 4)",
        publisher: "Canonical specification v1.2 FINAL",
        url: "internal://unsupported",
        tier: 3,
      },
      verifiedDate: "2026-08-21",
      status: "UNSUPPORTED",
    },
  }),
};

/** Order used when reducing components to a display-only record status. */
const STATUS_RANK: Record<RuleStatus, number> = {
  VERIFIED: 0,
  APPROXIMATE: 1,
  UNSUPPORTED: 2,
};

export const UNLOCK_COMPONENTS: UnlockComponentKey[] = [
  "unlockEntitlement",
  "destinationVehicle",
  "lifMaximum",
];

/**
 * Look up a rule without throwing. UI paths that must render a saved but
 * unsupported jurisdiction use this.
 */
export function tryUnlockRule(
  juris: JurisdictionKey | undefined | null,
): UnlockRule | undefined {
  if (!juris) return undefined;
  return UNLOCK_RULES[juris];
}

/**
 * Look up a rule for a CALCULATION. There is no Ontario default: an unknown or
 * absent pension jurisdiction is a refusal, never a substitution (§14.2).
 */
export function unlockRule(juris: JurisdictionKey | undefined | null): UnlockRule {
  const r = tryUnlockRule(juris);
  if (!r) {
    throw new Error(
      `Unsupported pension jurisdiction "${String(
        juris,
      )}": no verified locked-in rule record. The engine does not substitute another jurisdiction's rules.`,
    );
  }
  return r;
}

/** Status of ONE component, for point-of-use gating (§13.2a). */
export function componentStatus(
  juris: JurisdictionKey | undefined | null,
  component: UnlockComponentKey,
): RuleStatus {
  const r = tryUnlockRule(juris);
  if (!r) return "UNSUPPORTED";
  return r[component].status;
}

/**
 * Worst component status for a jurisdiction. Display and selector use ONLY —
 * never the gate for an individual calculation (§13.2a).
 */
export function recordStatus(juris: JurisdictionKey | undefined | null): RuleStatus {
  const r = tryUnlockRule(juris);
  if (!r) return "UNSUPPORTED";
  return UNLOCK_COMPONENTS.reduce<RuleStatus>((worst, k) => {
    const s = r[k].status;
    return STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst;
  }, "VERIFIED");
}

/** True when the jurisdiction's unlocking entitlement itself is unsupported. */
export function unlockIsUnsupported(juris: JurisdictionKey | undefined | null): boolean {
  return componentStatus(juris, "unlockEntitlement") === "UNSUPPORTED";
}

/** Unlocking may only be offered as an action where the entitlement is VERIFIED. */
export function isUnlockRuleVerified(juris: JurisdictionKey | undefined): boolean {
  return componentStatus(juris, "unlockEntitlement") === "VERIFIED";
}

/**
 * Age-appropriate cumulative unlockable fraction of a locked-in account, as a
 * percentage. Manitoba's 50%-at-55 and balance-at-65 are two sequential
 * entitlements, so this is re-evaluated every year.
 */
export function maxUnlockPctAtAge(rule: UnlockRule, age: number): number {
  let pct = 0;
  if (age >= rule.partialMinAge) pct = rule.partialPct;
  if (rule.fullUnlockAge != null && age >= rule.fullUnlockAge) pct = 100;
  return pct;
}

export interface LifMaxResult {
  /** True when a maximum applies at all. */
  applies: boolean;
  /** Maximum withdrawal as a percentage of the balance. */
  pct: number;
  /** Status of the component this number was read from (§13.2a). */
  status: RuleStatus;
}

/**
 * LIF maximum for a PENSION jurisdiction, gated at the point of use.
 *
 * Ontario reads the published FSRA table (VERIFIED). Quebec applies no maximum
 * from age 55 (VERIFIED) and an APPROXIMATE maximum below 55. Everywhere else
 * the annuity-formula approximation is used and flagged APPROXIMATE. An
 * UNSUPPORTED jurisdiction yields no number at all.
 */
export function lifMaximumFor(
  juris: JurisdictionKey | undefined | null,
  age: number,
  ratePct: number,
): LifMaxResult {
  const r = tryUnlockRule(juris);
  if (!r || r.lifMaximum.status === "UNSUPPORTED") {
    return { applies: false, pct: 0, status: "UNSUPPORTED" };
  }
  if (r.lifMaxNoneFromAge != null && age >= r.lifMaxNoneFromAge) {
    // The "no maximum from 55" rule itself is verified for Quebec.
    return { applies: false, pct: 0, status: "VERIFIED" };
  }
  const isOntarioTable = juris === "ON";
  return {
    applies: true,
    pct: lifMaxFactor(age, isOntarioTable ? "ON" : String(juris), ratePct),
    status: isOntarioTable ? "VERIFIED" : "APPROXIMATE",
  };
}

