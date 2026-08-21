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
 * Ontario LIF/LRIF maximum annual income payment percentages.
 *
 * Source: FSRA guidance PE0196INF (Active), "Life Income Fund (LIF) and
 * Locked-In Retirement Income Fund (LRIF) Maximum Annual Income Payment Amount
 * Table", Appendix A (C/F formula in s.6 of Schedules 1, 1.1 and 2 to
 * R.R.O. 1990, Reg. 909), effective 2021-01-01, re-checked 2026-08-21. The
 * CANSIM reference rate is floored at 6%, which has left the table unchanged
 * since 2021.
 *
 * KEYING: exactly as FSRA publishes it — by the age ATTAINED DURING THE YEAR,
 * unshifted, to five decimals. The engine's annual projection row age is used
 * directly as that key; no January-1 / start-of-year convention is applied
 * anywhere.
 *
 * ANNUAL-GRANULARITY CAVEAT: the engine models whole years and has no date of
 * birth, so for a plan started before the client's birthday the applicable
 * FSRA row can be one age step ahead of the engine's row, making the modelled
 * maximum conservative in the start year. DOB-aware sub-annual refinement is a
 * separate, out-of-scope item; it is deliberately NOT approximated with a
 * constant age offset.
 */
export const ON_LIF_MAX: Record<number, number> = {
  41: 5.98531,
  42: 6.006,
  43: 6.02808,
  44: 6.05167,
  45: 6.07687,
  46: 6.10382,
  47: 6.13265,
  48: 6.1635,
  49: 6.19655,
  50: 6.23197,
  51: 6.26996,
  52: 6.31073,
  53: 6.35454,
  54: 6.40164,
  55: 6.45234,
  56: 6.50697,
  57: 6.56589,
  58: 6.62952,
  59: 6.69833,
  60: 6.77285,
  61: 6.85367,
  62: 6.94147,
  63: 7.03703,
  64: 7.14124,
  65: 7.25513,
  66: 7.37988,
  67: 7.51689,
  68: 7.66778,
  69: 7.83449,
  70: 8.0193,
  71: 8.22496,
  72: 8.4548,
  73: 8.71288,
  74: 9.00423,
  75: 9.33511,
  76: 9.71347,
  77: 10.14952,
  78: 10.65661,
  79: 11.25255,
  80: 11.9616,
  81: 12.81773,
  82: 13.87002,
  83: 15.19207,
  84: 16.89953,
  85: 19.18515,
  86: 22.39589,
  87: 27.22561,
  88: 35.29338,
  89: 51.45631,
  90: 100.0,
};

/** Lowest and highest ages published in FSRA Appendix A. */
const ON_LIF_MIN_AGE = 41;
const ON_LIF_MAX_AGE = 90;

/**
 * LIF maximum withdrawal factor as a percentage of the balance.
 *
 * Ontario reads FSRA Appendix A directly by the age attained during the year
 * (see `ON_LIF_MAX`): age 89 is 51.45631% and only age 90 and above is 100%.
 * Other jurisdictions use the annuity-formula approximation at the reference
 * rate — an approximation the original tool disclosed, and one to replace with
 * published tables before relying on it for a specific client.
 */
export function lifMaxFactor(
  age: number,
  provinceKey: string,
  ratePct: number,
): number {
  if (provinceKey === "ON") {
    if (age >= ON_LIF_MAX_AGE) return 100;
    if (age < ON_LIF_MIN_AGE) return ON_LIF_MAX[ON_LIF_MIN_AGE]!;
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
        title:
          "Life Income Fund (LIF) and Locked-In Retirement Income Fund (LRIF) Maximum Annual Income Payment Amount Table, guidance PE0196INF (Active), Appendix A",
        publisher: "Financial Services Regulatory Authority of Ontario (FSRA)",
        url: "https://www.fsrao.ca/industry/pensions/regulatory-framework/guidance-pensions/life-income-fund-lif-and-locked-retirement-income-fund-lrif-maximum-annual-income-payment-amount-table",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
      notes:
        "Appendix A is keyed by the age ATTAINED DURING THE YEAR and read unshifted, to five decimals. Age 89 = 51.45631%; only age 90+ = 100%. Annual-granularity caveat: with no date of birth the engine can be one age step conservative in the start year.",
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
      "Age 50+: a one-time unlocking of up to 50% of the benefit value, to cash (less withholding), an RRSP or a RRIF on a tax-deferred basis. Procedural constraint NOT modelled: the entitlement must be exercised at the moment the money moves into the LIF/LITB account, not from an already-established LIF. Alberta's small-amount threshold is 20% of YMPE (not the 40%/50% used in some other jurisdictions).",
    unlockEntitlement: {
      source: {
        title:
          "Interpretive Guideline #04 — Unlocking of Pension Benefits",
        publisher: "Alberta Superintendent of Pensions",
        url: "https://open.alberta.ca/dataset/623fa691-3296-4bf4-ae01-ebd3cd657f99/resource/74e60c33-cf1c-4d3e-92da-b625a2c1a2b4/download/ig-04-unlocking-of-pension-benefits.pdf",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
      notes:
        "\"the member or LIRA owner is age 50 or older\", up to \"50 per cent of the value of their benefit\", \"on a one-time basis\", and it \"must occur prior to funds being deposited in the LIF or LITB account\" — the engine does not model that timing constraint.",
    },
    destinationVehicle: {
      source: {
        title:
          "Interpretive Guideline #04 — Unlocking of Pension Benefits",
        publisher: "Alberta Superintendent of Pensions",
        url: "https://open.alberta.ca/dataset/623fa691-3296-4bf4-ae01-ebd3cd657f99/resource/74e60c33-cf1c-4d3e-92da-b625a2c1a2b4/download/ig-04-unlocking-of-pension-benefits.pdf",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
      notes: "Cash (less withholding), an RRSP, or a RRIF on a tax-deferred basis.",
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
    requiresVehicle: "ScheduleLIF",
    transferWindowDays: 60,
    oneTime: true,
    notes:
      "Age 55+: a one-time withdrawal or transfer of up to 50% of the money transferred into a Schedule 4A LIF, to an RRSP or RRIF or in cash. The application is invalid if received more than 60 days after the money was transferred into the Schedule 4A LIF, and taking less than 50% forfeits the balance of the entitlement. Structurally the same shape as Ontario's Schedule 1.1 LIF and the federal RLIF.",
    unlockEntitlement: {
      source: {
        title:
          "Form 20 — Application to withdraw or transfer up to 50% of the money transferred into a Schedule 4A LIF",
        publisher: "Nova Scotia Department of Finance",
        url: "https://novascotia.ca/finance/pensions/docs/pensions-form-20.pdf",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
      notes:
        "\"this is a one-time withdrawal or transfer and if you withdraw or transfer less than 50% of this money you will not have another opportunity\"; the 60-day window is a hard validity condition the engine does not model.",
    },
    destinationVehicle: {
      source: {
        title:
          "Form 20 — Application to withdraw or transfer up to 50% of the money transferred into a Schedule 4A LIF",
        publisher: "Nova Scotia Department of Finance",
        url: "https://novascotia.ca/finance/pensions/docs/pensions-form-20.pdf",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
      notes: "RRSP or RRIF, or cash; the money must first pass through a Schedule 4A LIF.",
    },
    lifMaximum: FORMULA_LIF_MAX,
  }),
  NB: rule({
    name: "New Brunswick",
    partialPct: 0,
    partialMinAge: 999,
    destinationType: "RRSP",
    oneTime: true,
    notes:
      "UNSUPPORTED. FCNB gives the one-time partial unlock as the lesser of three times the annual amount or 25% of the LIF balance, taken from a LIF, with a RRIF destination and no stated age condition. Our former record (flat 25% at 55 to an RRSP) overstated the entitlement because the 'three times the annual amount' limb frequently binds first. Nothing is substituted: unlocking, destination and LIF maximum are all withheld until the lesser-of formula and the meaning of 'the annual amount' are confirmed with FCNB.",
    unlockEntitlement: {
      source: {
        title: "Pension Transfers and Withdrawals",
        publisher: "New Brunswick Financial and Consumer Services Commission (FCNB)",
        url: "https://fcnb.ca/en/personal-finances/pensions-and-retirement/pension-transfers-and-withdrawals",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "UNSUPPORTED",
      notes:
        "Lesser of three times the annual amount or 25% of the LIF balance, once in a lifetime, no age condition stated. Not modelled; withheld rather than approximated.",
    },
    destinationVehicle: {
      source: {
        title: "Pension Transfers and Withdrawals",
        publisher: "New Brunswick Financial and Consumer Services Commission (FCNB)",
        url: "https://fcnb.ca/en/personal-finances/pensions-and-retirement/pension-transfers-and-withdrawals",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "UNSUPPORTED",
      notes: "Destination is a RRIF, not an RRSP as previously coded. Withheld.",
    },
    lifMaximum: {
      source: {
        title: "Pension Transfers and Withdrawals",
        publisher: "New Brunswick Financial and Consumer Services Commission (FCNB)",
        url: "https://fcnb.ca/en/personal-finances/pensions-and-retirement/pension-transfers-and-withdrawals",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "UNSUPPORTED",
      notes:
        "No New Brunswick maximum table is implemented, and the unlock formula depends on the LIF annual amount. Withheld.",
    },
  }),
  BC: rule({
    name: "British Columbia",
    partialPct: 0,
    partialMinAge: 999,
    destinationType: "RRSP",
    oneTime: true,
    notes:
      "No 50% one-time unlocking exists under BC legislation — a verified absence, not an unchecked assumption. BC permits unlocking only for financial hardship, small balance (under 65: 20% of YMPE, $14,920 for 2026; 65+: 40% of YMPE, $29,840), permanent departure from Canada, and shortened life expectancy. None of those four circumstances is modelled by the engine.",
    unlockEntitlement: {
      source: {
        title: "Unlocking pension funds",
        publisher: "BC Financial Services Authority (BCFSA)",
        url: "https://www.bcfsa.ca/public-resources/pensions/unlocking-pension-funds",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
      notes:
        "\"British Columbia's pension legislation does not allow a 50 per cent one-time unlocking provision for pension funds... it is not available under B.C. legislation.\"",
    },
    destinationVehicle: {
      source: {
        title: "Unlocking pension funds",
        publisher: "BC Financial Services Authority (BCFSA)",
        url: "https://www.bcfsa.ca/public-resources/pensions/unlocking-pension-funds",
        tier: 1,
      },
      verifiedDate: "2026-08-21",
      status: "VERIFIED",
      notes: "No age-based unlocking entitlement exists, so no destination applies.",
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
    // §13.2a: the COMPONENT is the source of truth for status, not the
    // jurisdiction. Only the choice of which number to compute is ON-specific.
    status: r.lifMaximum.status,
  };
}

