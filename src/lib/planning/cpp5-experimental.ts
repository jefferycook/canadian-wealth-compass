/**
 * CPP-5 EXPERIMENTAL survivor's pension prototype. NOT a production calculation.
 *
 * Isolated research artifact: nothing in the app, the projection engine or the
 * existing CPP API (`benefits.ts`) may import this module. Outputs are unrounded
 * basic monthly amounts with no Service Canada confirmation. Every equation is
 * tagged with a ledger id ([L01] ...) that maps to `CPP5_LEDGER` below.
 *
 * Sources, read directly from Justice Laws on 2026-10-30:
 * - Canada Pension Plan, R.S.C. 1985, c. C-8, ss.42, 43, 45, 46, 57, 58
 *   (current to 2026-09-30, last amended 2024-12-17).
 * - Canada Pension Plan Regulations, C.R.C., c. 385, s.62
 *   (current to 2026-09-30, last amended 2026-01-01).
 *
 * Implemented: s.58(1)(b) (65+, no own pension) and s.58(2)(c) (65+, born after
 * 1932, own CPP retirement pension commenced after 1997), for calculation months
 * from January 2019. Every other branch returns a typed fail-closed result.
 */

const ACT = "https://laws-lois.justice.gc.ca/eng/acts/C-8";
const REGS = "https://laws-lois.justice.gc.ca/eng/regulations/C.R.C.,_c._385";

export const CPP5_SOURCES = {
  act: { url: `${ACT}/`, consolidatedTo: "2026-09-30", lastAmended: "2024-12-17" },
  regulations: { url: `${REGS}/`, consolidatedTo: "2026-09-30", lastAmended: "2026-01-01" },
  readOn: "2026-10-30",
} as const;

export type EvidenceLabel =
  "VERIFIED_STATUTE" | "VERIFIED_REGULATION" | "DERIVED_MATH" | "ILLUSTRATIVE" | "UNRESOLVED";

export interface LedgerEntry {
  readonly id: string;
  readonly equation: string;
  readonly label: EvidenceLabel;
  readonly citation: string;
  readonly note: string;
}

/** Accuracy ledger. Short excerpts only; the URL is the authority. */
export const CPP5_LEDGER: readonly LedgerEntry[] = [
  {
    id: "L01",
    equation: "own portions R = 25% AMPE, 8.33% FAMPE, 33.33% SAMPE (literal decimals)",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-46.html`,
    note: "s.46(1)(a)-(c). 8.33% and 33.33% are not 1/12 and 1/3. Earnings inputs are the s.48, 48.1, 48.2 and s.51 results; this module does not compute them.",
  },
  {
    id: "L02",
    equation:
      "deceased base = 25% AMPE x (payable at death ? PI(death yr)/PI(first payable yr) : 1)",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-57.html`,
    note: "s.57(2)(c), death on or after 1987-01-01. AMPE per s.57(3) is an input. First payable year before 1974 is unsupported.",
  },
  {
    id: "L03",
    equation:
      "deceased additional = 8.33% FAMPE / 33.33% SAMPE x (payable at death ? PI(death yr)/PI(first payable yr) : 1)",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-58.html`,
    note: "s.58(3.2), (3.5). FAMPE/SAMPE per s.58(3.3), (3.6) are inputs.",
  },
  {
    id: "L04",
    equation: "deceased portions x PI(year of s.58(3) event month)/PI(death yr)",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-58.html`,
    note: "s.58(3), (3.1), (3.4). Events (a)-(e) each start a new run of months.",
  },
  {
    id: "L05",
    equation:
      "event-year ratio then s.45(2) roll-forward == PI(calc yr)/PI(death yr), for any event year",
    label: "DERIVED_MATH",
    citation: `${ACT}/section-45.html`,
    note: "Telescoping product, exact only before rounding and so NOT the statutory dollar amount when any annual ratio differs from 1 (Reg. 62(2)-(3) quantize yearly; e.g. 1000 x 1.1 x 1.136 = 1249.60, not 1250). Used only in HYPOTHETICAL_UNROUNDED mode (L25).",
  },
  {
    id: "L06",
    equation: "s.45(2) yearly ratio PI(y)/PI(y-1); chained = PI(calc yr)/PI(start yr)",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-45.html`,
    note: "Ratio is VERIFIED_STATUTE; the chained form is DERIVED_MATH (telescoping) and omits Reg. 62 rounding, so it is used only in HYPOTHETICAL_UNROUNDED mode (L25).",
  },
  {
    id: "L07",
    equation: "PI never falls: PI(y) >= PI(y-1)",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-43.html`,
    note: "s.43(2). Used only as an input-validation check.",
  },
  {
    id: "L08",
    equation: "s.58(1)(b): survivor pension = 60% x (base + first additional + second additional)",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-58.html`,
    note: "Survivor 65+ with no retirement pension payable under this Act or a provincial plan.",
  },
  {
    id: "L09",
    equation:
      "s.58(2)(c) selector: reached 65, born after 1932-12-31, own pension commences after 1997-12-31",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-58.html`,
    note: "Selector is the own retirement commencement, not the survivor pension start.",
  },
  {
    id: "L10",
    equation: "per component c: A_c = 60% D_c; B_c = min(40% A_c, 40% R_c); term_c = A_c - B_c",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-58.html`,
    note: "s.58(2)(c)(i)(A), (ii), (iii). R_c ignores s.46(3)-(6) (base) or s.46(3.1)-(6) (additional) and is adjusted under s.45(2).",
  },
  {
    id: "L11",
    equation: "base term only = lesser of (A_base - B_base) and capRoom",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-58.html`,
    note: "s.58(2)(c)(i). (ii) and (iii) have no cap.",
  },
  {
    id: "L12",
    equation:
      "capRoom = 25% x MPEA(capYr)/12 x PI(calc yr)/PI(capYr) - R_base; capYr = later of qualification yr, own commencement yr",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-58.html`,
    note: "s.58(2)(c)(i)(B) and s.58(9). The s.45(2) chained ratio is DERIVED_MATH (L06).",
  },
  {
    id: "L13",
    equation: "MPEA(y) = mean YMPE over y and 4 previous years (y > 1998) or 3 previous (y = 1998)",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-42.html`,
    note: "s.42(1) definition, contributor born on or after 1933-01-01. YMPE values are inputs.",
  },
  {
    id: "L14",
    equation: "capRoom < 0",
    label: "UNRESOLVED",
    citation: `${ACT}/section-58.html`,
    note: 'Text has no floor ("an amount that, when added to ..."). Not proven impossible. Fails closed; no max(0, ...).',
  },
  {
    id: "L15",
    equation: "calculation month == month survivor reaches 65",
    label: "UNRESOLVED",
    citation: `${ACT}/section-58.html`,
    note: '"has reached 65" vs. a whole month, with s.58(3)(b) and payment-timing rules (ss.67, 72) not read. Fails closed.',
  },
  {
    id: "L16",
    equation:
      "s.46(5) trigger: survivor pension reduced from its full amount under s.58(2) AND a downward s.46(3)/(3.1)/(4) factor",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-46.html`,
    note: "Trigger is any reduction, not only the cap binding. s.80 agreements may override (provincial cases unsupported).",
  },
  {
    id: "L17",
    equation:
      "full amount = sum of A_c (the s.58(1)(b) amount); reduction = full - actual = sum B_c + cap trim",
    label: "UNRESOLVED",
    citation: `${ACT}/section-46.html`,
    note: '"full amount" is not defined in the text read. The identity full - actual = sum B + trim is DERIVED_MATH given that reading.',
  },
  {
    id: "L18",
    equation:
      "s.46(5)(b) ratio = PI(yr own pension first commenced)/PI(yr survivor pension is reduced)",
    label: "VERIFIED_STATUTE",
    citation: `${ACT}/section-46.html`,
    note: 'Direction is verified. Which year is "the year in which the survivor\'s pension is reduced" after annual recalculation is UNRESOLVED; caller must supply it.',
  },
  {
    id: "L19",
    equation: "downward adjustment factor values under s.46(3.1)/(7)",
    label: "UNRESOLVED",
    citation: `${ACT}/section-46.html`,
    note: "Regulations fixing the factor were not read. No retirement-pension dollars are produced for s.46(5).",
  },
  {
    id: "L20",
    equation: "Reg. 62(2): s.45(2) product rounded to nearest cent on the 3rd decimal digit",
    label: "VERIFIED_REGULATION",
    citation: `${REGS}/section-62.html`,
    note: "Not applied: the companion ratio rule (L21) is unresolved and the yearly sequence is unknown.",
  },
  {
    id: "L21",
    equation: "Reg. 62(3): ratio expressed to four decimals, then the 4th digit drops",
    label: "UNRESOLVED",
    citation: `${REGS}/section-62.html`,
    note: "Literal text leaves three decimals while saying four. Not coded.",
  },
  {
    id: "L22",
    equation: "rounding of s.58 intermediate products and the final survivor pension",
    label: "UNRESOLVED",
    citation: `${ACT}/section-58.html`,
    note: "No rounding rule found in the provisions read. Output is unrounded.",
  },
  {
    id: "L23",
    equation: "Service Canada-calculated expected monthly payments",
    label: "UNRESOLVED",
    citation:
      "https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-survivor-pension.html",
    note: "No official numeric fixture exists in this repo. Required sign-off before any production use.",
  },
  {
    id: "L24",
    equation: "all synthetic test inputs and expected values in cpp5-experimental.test.ts",
    label: "ILLUSTRATIVE",
    citation: "src/lib/planning/cpp5-experimental.test.ts",
    note: "Invented round numbers. They check internal algebra and branch gates, not the law.",
  },
  {
    id: "L25",
    equation:
      "s.45(2) yearly adjustment with Reg. 62 quantization over each indexed interval (death yr, own commencement yr, cap yr) -> calculation yr",
    label: "UNRESOLVED",
    citation: `${REGS}/section-62.html`,
    note: "Default mode computes only when a complete annual PI series has every ratio exactly 1; any change fails closed (UNVERIFIED_RULE). Event rebasing sequence and the 62(3) decimal reading are open. HYPOTHETICAL_UNROUNDED is an explicit non-statutory opt-in.",
  },
];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface YearMonth {
  readonly year: number;
  /** 1-12 */
  readonly month: number;
}

export const CPP5_COMPONENTS = ["base", "firstAdditional", "secondAdditional"] as const;
export type Cpp5Component = (typeof CPP5_COMPONENTS)[number];
export type ComponentAmounts = Readonly<Record<Cpp5Component, number>>;

/**
 * Monthly pensionable earnings measures, one per component, in dollars per month.
 * Each must be supplied separately. A single total CPP statement figure cannot be
 * split into these three; there is deliberately no such helper.
 */
export interface MonthlyPensionableEarnings {
  /** s.48 / s.57(3) average monthly pensionable earnings (s.51-adjusted). */
  readonly average: number;
  /** s.48.1 first additional monthly pensionable earnings (s.51-adjusted). */
  readonly firstAdditional: number;
  /** s.48.2 second additional monthly pensionable earnings (s.51-adjusted). */
  readonly secondAdditional: number;
}

export interface DeceasedContributorInput {
  readonly death: YearMonth;
  /** As s.57(3), s.58(3.3) and s.58(3.6) require (index year = death year if no pension was payable). */
  readonly earnings: MonthlyPensionableEarnings;
  readonly retirementPensionPayableInDeathMonth: boolean;
  /** Required when `retirementPensionPayableInDeathMonth` is true. */
  readonly retirementPensionFirstPayableYear?: number;
}

export interface SurvivorOwnRetirementInput {
  /** Pension under this Act or under a provincial pension plan (QPP). */
  readonly plan: "CPP" | "PROVINCIAL";
  readonly commencement: YearMonth;
  /** Earnings measures fixed at commencement (s.51 year = commencement year). */
  readonly earnings: MonthlyPensionableEarnings;
}

export interface SurvivorInput {
  readonly birth: YearMonth;
  /** s.58(9): month after the month the survivor first met s.44(1) criteria. */
  readonly survivorPensionQualification: YearMonth;
  /** Disability pension under this Act or a provincial plan (s.58(6)-(8.1)). */
  readonly disabilityPensionPayable: boolean;
  readonly ownRetirementPension: SurvivorOwnRetirementInput | null;
}

export interface Cpp5Input {
  readonly calculationMonth: YearMonth;
  readonly deceased: DeceasedContributorInput;
  readonly survivor: SurvivorInput;
  /** s.43 Pension Index by calendar year. */
  readonly pensionIndex: Readonly<Record<number, number>>;
  /** s.18 Year's Maximum Pensionable Earnings by calendar year (needed for s.58(2)(c)). */
  readonly ympe: Readonly<Record<number, number>>;
  /** s.46(5)(b) "year in which the survivor's pension is reduced" (L18). Optional. */
  readonly survivorPensionReductionYear?: number;
  /**
   * How s.45(2) annual indexing is handled [L25]. Default `STATUTORY`: compute only when
   * every annual Pension Index ratio over each indexed interval is exactly 1 (so Reg. 62
   * quantization cannot matter), from a complete year-by-year series; otherwise
   * UNVERIFIED_RULE. `HYPOTHETICAL_UNROUNDED` telescopes to endpoint ratios and is NOT the
   * statutory result once any annual ratio differs from 1.
   */
  readonly indexing?: IndexingMode;
}

export type IndexingMode = "STATUTORY" | "HYPOTHETICAL_UNROUNDED";

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type Cpp5FailKind =
  "UNSUPPORTED" | "INSUFFICIENT_DATA" | "UNVERIFIED_RULE" | "INVALID_INPUT";

export interface Cpp5FailClosed {
  readonly kind: Cpp5FailKind;
  readonly code: string;
  readonly detail: string;
  readonly citation: string;
  /** Input paths that were missing (INSUFFICIENT_DATA only). */
  readonly missing?: readonly string[];
}

export type S46_5Assessment =
  | {
      readonly status: "NOT_APPLICABLE";
      readonly reason:
        | "NO_OWN_RETIREMENT_PENSION"
        | "COMMENCED_AT_65_NO_FACTOR"
        | "UPWARD_FACTOR_ONLY"
        | "SURVIVOR_PENSION_NOT_REDUCED";
    }
  | {
      readonly status: "UNVERIFIED_RULE";
      readonly triggered: true;
      readonly factorDirection: "DOWNWARD";
      /** Candidate s.46(5)(a) amount = full - actual, under the L17 reading. */
      readonly candidateReduction: number;
      /** s.46(5)(b) ratio; null when the reduction year or its PI is not supplied. */
      readonly pensionIndexRatio: number | null;
      readonly blockers: readonly string[];
    };

export interface ComponentTerm {
  /** A = 60% of the deceased portion. */
  readonly A: number;
  /** B = min(40% A, 40% R). */
  readonly B: number;
  readonly AminusB: number;
  /** Amount in the survivor pension (base may be limited by the cap). */
  readonly paid: number;
}

export interface Cpp5Computed {
  readonly kind: "COMPUTED";
  readonly branch: "S58_1_B" | "S58_2_C";
  readonly calculationMonth: YearMonth;
  readonly amountBasis: "UNROUNDED_BASIC_MONTHLY_AMOUNT";
  /** UNITY_INDEX: all annual ratios were 1, so rounding cannot change the dollars [L25]. */
  readonly indexingBasis: "UNITY_INDEX_SERIES" | "HYPOTHETICAL_UNROUNDED_NOT_STATUTORY";
  readonly officialFixtureStatus: "MISSING_SERVICE_CANADA_CONFIRMATION";
  /** s.58(3), (3.1), (3.4) portions at the calculation year (L02-L05). */
  readonly deceasedPortions: ComponentAmounts;
  /** Sum of A_c = s.58(1)(b) amount; the candidate "full amount" (L17). */
  readonly fullAmount: number;
  readonly survivorPension: number;
  readonly reductionFromFull: number;
  readonly terms: Readonly<Record<Cpp5Component, ComponentTerm>> | null;
  readonly ownUnadjustedPortions: ComponentAmounts | null;
  readonly cap: {
    readonly capYear: number;
    readonly mpea: number;
    readonly capAmount: number;
    readonly capRoom: number;
    readonly binding: boolean;
    readonly trim: number;
  } | null;
  readonly s46_5: S46_5Assessment;
  /** Ledger ids that limit exactness of this output. */
  readonly precisionCaveats: readonly string[];
}

export type Cpp5Result = Cpp5Computed | Cpp5FailClosed;

// ---------------------------------------------------------------------------
// Statutory constants
// ---------------------------------------------------------------------------

/** [L01] s.46(1); [L02] s.57(2)(c); [L03] s.58(3.2), (3.5). */
const PORTION_RATE: Readonly<Record<Cpp5Component, number>> = {
  base: 0.25,
  firstAdditional: 0.0833,
  secondAdditional: 0.3333,
};
const EARNINGS_KEY: Readonly<Record<Cpp5Component, keyof MonthlyPensionableEarnings>> = {
  base: "average",
  firstAdditional: "firstAdditional",
  secondAdditional: "secondAdditional",
};
/** [L08] s.58(1)(b) and [L10] s.58(2)(c) "A". */
const SURVIVOR_RATE_65 = 0.6;
/** [L10] s.58(2)(c) "B". */
const OFFSET_RATE = 0.4;
/** [L12] "25% of 1/12". */
const CAP_RATE = 0.25;

const PRECISION_CAVEATS = ["L20", "L21", "L22", "L23", "L25"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ym = (y: YearMonth) => y.year * 12 + (y.month - 1);

function fail(
  kind: Cpp5FailKind,
  code: string,
  detail: string,
  citation: string,
  missing?: readonly string[],
): Cpp5FailClosed {
  return missing ? { kind, code, detail, citation, missing } : { kind, code, detail, citation };
}

function isYearMonth(v: unknown): v is YearMonth {
  if (typeof v !== "object" || v === null) return false;
  const { year, month } = v as YearMonth;
  return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
}

/** Collects missing and invalid fields without throwing. */
function validate(input: Cpp5Input): Cpp5FailClosed | null {
  const missing: string[] = [];
  const invalid: string[] = [];
  const checkYm = (v: unknown, path: string) => {
    if (v === undefined || v === null) missing.push(path);
    else if (!isYearMonth(v)) invalid.push(path);
  };
  const checkAmount = (v: unknown, path: string) => {
    if (v === undefined || v === null || (typeof v === "number" && Number.isNaN(v)))
      missing.push(path);
    else if (typeof v !== "number" || !Number.isFinite(v) || v < 0) invalid.push(path);
  };
  const checkEarnings = (e: unknown, path: string) => {
    if (typeof e !== "object" || e === null) {
      missing.push(path);
      return;
    }
    for (const c of CPP5_COMPONENTS) {
      checkAmount((e as Record<string, unknown>)[EARNINGS_KEY[c]], `${path}.${EARNINGS_KEY[c]}`);
    }
  };

  checkYm(input?.calculationMonth, "calculationMonth");
  const d = input?.deceased;
  if (!d) missing.push("deceased");
  else {
    checkYm(d.death, "deceased.death");
    checkEarnings(d.earnings, "deceased.earnings");
    if (typeof d.retirementPensionPayableInDeathMonth !== "boolean")
      missing.push("deceased.retirementPensionPayableInDeathMonth");
    else if (d.retirementPensionPayableInDeathMonth) {
      if (d.retirementPensionFirstPayableYear === undefined)
        missing.push("deceased.retirementPensionFirstPayableYear");
      else if (!Number.isInteger(d.retirementPensionFirstPayableYear))
        invalid.push("deceased.retirementPensionFirstPayableYear");
    }
  }
  const s = input?.survivor;
  if (!s) missing.push("survivor");
  else {
    checkYm(s.birth, "survivor.birth");
    checkYm(s.survivorPensionQualification, "survivor.survivorPensionQualification");
    if (typeof s.disabilityPensionPayable !== "boolean")
      missing.push("survivor.disabilityPensionPayable");
    if (s.ownRetirementPension === undefined) missing.push("survivor.ownRetirementPension");
    else if (s.ownRetirementPension !== null) {
      const o = s.ownRetirementPension;
      if (o.plan !== "CPP" && o.plan !== "PROVINCIAL")
        invalid.push("survivor.ownRetirementPension.plan");
      checkYm(o.commencement, "survivor.ownRetirementPension.commencement");
      checkEarnings(o.earnings, "survivor.ownRetirementPension.earnings");
    }
  }
  if (typeof input?.pensionIndex !== "object" || input.pensionIndex === null)
    missing.push("pensionIndex");
  if (typeof input?.ympe !== "object" || input.ympe === null) missing.push("ympe");

  if (missing.length > 0)
    return fail(
      "INSUFFICIENT_DATA",
      "MISSING_INPUT",
      "Required statutory inputs are missing; no amount is inferred.",
      CPP5_SOURCES.act.url,
      missing,
    );
  if (invalid.length > 0)
    return fail(
      "INVALID_INPUT",
      "INVALID_FIELDS",
      `Invalid fields: ${invalid.join(", ")}`,
      CPP5_SOURCES.act.url,
    );

  // [L07] s.43(2): the index never falls. Compare every supplied year with the
  // previous supplied year in chronological order, including across gaps.
  let prev: readonly [number, number] | null = null;
  const piEntries = Object.entries(input.pensionIndex)
    .map(([k, v]) => [Number(k), v] as const)
    .sort((a, b) => a[0] - b[0]);
  for (const [y, v] of piEntries) {
    if (!(typeof v === "number" && Number.isFinite(v) && v > 0))
      return fail(
        "INVALID_INPUT",
        "PENSION_INDEX_VALUE",
        `PI ${y} must be > 0`,
        `${ACT}/section-43.html`,
      );
    if (prev !== null && v < prev[1])
      return fail(
        "INVALID_INPUT",
        "PENSION_INDEX_DECREASES",
        `PI ${y} < PI ${prev[0]}; s.43(2) forbids a decrease`,
        `${ACT}/section-43.html`,
      );
    prev = [y, v];
  }
  for (const [k, v] of Object.entries(input.ympe)) {
    if (!(typeof v === "number" && Number.isFinite(v) && v > 0))
      return fail("INVALID_INPUT", "YMPE_VALUE", `YMPE ${k} must be > 0`, `${ACT}/section-42.html`);
  }
  return null;
}

type Lookup = { ok: true; values: number[] } | { ok: false; missing: string[] };

function lookupYears(
  table: Readonly<Record<number, number>>,
  name: string,
  years: number[],
): Lookup {
  const missing = [...new Set(years)]
    .filter((y) => table[y] === undefined)
    .map((y) => `${name}[${y}]`);
  return missing.length > 0
    ? { ok: false, missing }
    : { ok: true, values: years.map((y) => table[y] as number) };
}

function missingIndex(missing: string[], citation: string): Cpp5FailClosed {
  return fail(
    "INSUFFICIENT_DATA",
    "MISSING_INDEX_DATA",
    "Statutory index values needed for this branch are missing.",
    citation,
    missing,
  );
}

/** Month in which a person born in `birth` reaches 65 (anniversary month). */
export function month65(birth: YearMonth): YearMonth {
  return { year: birth.year + 65, month: birth.month };
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

/**
 * Experimental s.58 survivor's pension for one calculation month.
 * Returns COMPUTED only for s.58(1)(b) and s.58(2)(c); otherwise fails closed.
 */
export function calculateCpp5SurvivorPension(input: Cpp5Input): Cpp5Result {
  const invalid = validate(input);
  if (invalid) return invalid;

  const { calculationMonth: calc, deceased: dec, survivor: surv } = input;
  const s58 = `${ACT}/section-58.html`;

  if (ym(calc) < ym({ year: 2019, month: 1 }))
    return fail(
      "UNSUPPORTED",
      "PRE_2019_MONTH",
      "Months before January 2019 predate the additional components; historical consolidations are out of scope.",
      s58,
    );
  if (ym(dec.death) < ym({ year: 1987, month: 1 }))
    return fail(
      "UNSUPPORTED",
      "DEATH_BEFORE_1987",
      "s.57(2)(a)/(b) and s.58(4) legacy rules are not implemented.",
      `${ACT}/section-57.html`,
    );
  if (ym(calc) <= ym(dec.death))
    return fail(
      "INVALID_INPUT",
      "CALC_NOT_AFTER_DEATH",
      "Calculation month must follow death.",
      s58,
    );
  if (ym(surv.survivorPensionQualification) <= ym(dec.death))
    return fail(
      "INVALID_INPUT",
      "QUALIFICATION_NOT_AFTER_DEATH",
      "s.58(9): qualification is the month after criteria are met.",
      s58,
    );
  if (ym(calc) < ym(surv.survivorPensionQualification))
    return fail("INVALID_INPUT", "CALC_BEFORE_QUALIFICATION", "Survivor not yet qualified.", s58);
  if (
    dec.retirementPensionPayableInDeathMonth &&
    dec.retirementPensionFirstPayableYear! > dec.death.year
  )
    return fail(
      "INVALID_INPUT",
      "DECEASED_PENSION_AFTER_DEATH",
      "A pension payable in the death month cannot first become payable after the death year.",
      `${ACT}/section-57.html`,
    );
  if (dec.retirementPensionPayableInDeathMonth && dec.retirementPensionFirstPayableYear! < 1974)
    return fail(
      "UNSUPPORTED",
      "DECEASED_PENSION_BEFORE_1974",
      "s.57(2)(c)(ii)(B) pre-1974 Pension Index limitation is not implemented.",
      `${ACT}/section-57.html`,
    );
  if (surv.disabilityPensionPayable)
    return fail(
      "UNSUPPORTED",
      "DISABILITY_PENSION_PAYABLE",
      "s.58(6)-(8.1) combined disability rules are not implemented.",
      s58,
    );

  const own = surv.ownRetirementPension;
  const ownPayable = own !== null && ym(own.commencement) <= ym(calc);
  if (ownPayable && own.plan === "PROVINCIAL")
    return fail(
      "UNSUPPORTED",
      "PROVINCIAL_RETIREMENT_PENSION",
      "s.58(5), s.80 agreements and s.46(5) interaction with a provincial plan are not implemented.",
      s58,
    );

  // [L15] the month the survivor reaches 65.
  const m65 = month65(surv.birth);
  if (ym(calc) === ym(m65))
    return fail(
      "UNVERIFIED_RULE",
      "AGE_65_TRANSITION_MONTH",
      "Whether the 65+ branch applies for the whole month the survivor reaches 65 is unresolved.",
      s58,
    );
  const reached65 = ym(calc) > ym(m65);

  // Branch gates, s.58(1) and s.58(2) [L09].
  let branch: "S58_1_B" | "S58_2_C";
  if (!ownPayable) {
    if (!reached65)
      return fail(
        "UNSUPPORTED",
        "S58_1_A1_UNDER_65",
        "s.58(1)(a.1) (flat rate + 37.5%) is outside this prototype.",
        s58,
      );
    branch = "S58_1_B";
  } else {
    const after1997 = own.commencement.year >= 1998;
    if (!reached65)
      return fail(
        "UNSUPPORTED",
        after1997 ? "S58_2_A_UNDER_65" : "S58_2_B_UNDER_65_PRE_1998",
        "Under-65 combined branches (flat rate / PRDB) are outside this prototype.",
        s58,
      );
    if (!(surv.birth.year >= 1933 && after1997))
      return fail(
        "UNSUPPORTED",
        "S58_2_D_OTHER",
        "s.58(2)(d) catch-all branch is not implemented.",
        s58,
      );
    branch = "S58_2_C";
  }

  // Deceased portions at the calculation year [L02-L05].
  const deathYear = dec.death.year;
  const piYears = [calc.year, deathYear];
  if (dec.retirementPensionPayableInDeathMonth)
    piYears.push(dec.retirementPensionFirstPayableYear!);
  if (ownPayable) piYears.push(own.commencement.year);
  const piLookup = lookupYears(input.pensionIndex, "pensionIndex", piYears);
  if (!piLookup.ok) return missingIndex(piLookup.missing, `${ACT}/section-43.html`);
  // Every year passed to PI below has been checked by lookupYears.
  const PI = (y: number) => input.pensionIndex[y] as number;

  // [L25] s.45(2) annual adjustment with Reg. 62 quantization is not modelled.
  const indexing: IndexingMode = input.indexing ?? "STATUTORY";
  const indexingBasis: Cpp5Computed["indexingBasis"] =
    indexing === "STATUTORY" ? "UNITY_INDEX_SERIES" : "HYPOTHETICAL_UNROUNDED_NOT_STATUTORY";
  if (indexing === "STATUTORY") {
    const starts = [deathYear];
    if (ownPayable) starts.push(own.commencement.year);
    const capStart = ownPayable
      ? Math.max(surv.survivorPensionQualification.year, own.commencement.year)
      : null;
    if (capStart !== null) starts.push(capStart);
    const seriesYears: number[] = [];
    for (const s of new Set(starts)) for (let y = s; y <= calc.year; y++) seriesYears.push(y);
    const series = lookupYears(input.pensionIndex, "pensionIndex", seriesYears);
    if (!series.ok) return missingIndex(series.missing, `${ACT}/section-45.html`);
    const lo = Math.min(...starts);
    for (let y = lo + 1; y <= calc.year; y++) {
      if (PI(y) !== PI(y - 1))
        return fail(
          "UNVERIFIED_RULE",
          "ANNUAL_INDEX_ROUNDING_UNRESOLVED",
          `PI changes in ${y}: s.45(2) yearly ratios are quantized under Reg. 62(3) and the product rounded under 62(2); the event/year sequence and the decimal-place reading are unresolved (L21, L25).`,
          `${REGS}/section-62.html`,
        );
    }
  }

  const payableRatio = dec.retirementPensionPayableInDeathMonth
    ? PI(deathYear) / PI(dec.retirementPensionFirstPayableYear!)
    : 1;
  const toCalcFromDeath = PI(calc.year) / PI(deathYear); // [L04]+[L05]
  const deceasedPortions = {} as Record<Cpp5Component, number>;
  for (const c of CPP5_COMPONENTS) {
    deceasedPortions[c] =
      PORTION_RATE[c] * dec.earnings[EARNINGS_KEY[c]] * payableRatio * toCalcFromDeath;
  }
  const A = {} as Record<Cpp5Component, number>;
  for (const c of CPP5_COMPONENTS) A[c] = SURVIVOR_RATE_65 * deceasedPortions[c];
  const fullAmount = A.base + A.firstAdditional + A.secondAdditional; // [L08], [L17]

  if (branch === "S58_1_B") {
    return {
      kind: "COMPUTED",
      branch,
      calculationMonth: calc,
      amountBasis: "UNROUNDED_BASIC_MONTHLY_AMOUNT",
      indexingBasis,
      officialFixtureStatus: "MISSING_SERVICE_CANADA_CONFIRMATION",
      deceasedPortions,
      fullAmount,
      survivorPension: fullAmount,
      reductionFromFull: 0,
      terms: null,
      ownUnadjustedPortions: null,
      cap: null,
      s46_5: { status: "NOT_APPLICABLE", reason: "NO_OWN_RETIREMENT_PENSION" },
      precisionCaveats: PRECISION_CAVEATS,
    };
  }

  // s.58(2)(c) [L10-L13]. `own` is payable here.
  const ownPension = own!;
  const ownIndex = PI(calc.year) / PI(ownPension.commencement.year); // [L06]
  const R = {} as Record<Cpp5Component, number>;
  for (const c of CPP5_COMPONENTS) {
    R[c] = PORTION_RATE[c] * ownPension.earnings[EARNINGS_KEY[c]] * ownIndex; // [L01]
  }

  const capYear = Math.max(surv.survivorPensionQualification.year, ownPension.commencement.year);
  const previous = capYear === 1998 ? 3 : 4; // [L13]; capYear >= 1998 because commencement > 1997
  const ympeYears = Array.from({ length: previous + 1 }, (_, i) => capYear - i);
  const ympeLookup = lookupYears(input.ympe, "ympe", ympeYears);
  if (!ympeLookup.ok) return missingIndex(ympeLookup.missing, `${ACT}/section-42.html`);
  const capPi = lookupYears(input.pensionIndex, "pensionIndex", [capYear]);
  if (!capPi.ok) return missingIndex(capPi.missing, `${ACT}/section-43.html`);
  const mpea = ympeLookup.values.reduce((a, b) => a + b, 0) / ympeLookup.values.length;
  const capAmount = ((CAP_RATE * mpea) / 12) * (PI(calc.year) / PI(capYear)); // [L12]
  const capRoom = capAmount - R.base;
  if (capRoom < 0)
    return fail(
      "UNVERIFIED_RULE",
      "NEGATIVE_CAP_ROOM",
      "Own base portion exceeds the s.58(2)(c)(i)(B) benefit level; the statute gives no floor (L14).",
      s58,
    );

  const terms = {} as Record<Cpp5Component, ComponentTerm>;
  for (const c of CPP5_COMPONENTS) {
    const B = Math.min(OFFSET_RATE * A[c], OFFSET_RATE * R[c]); // [L10]
    const AminusB = A[c] - B;
    terms[c] = { A: A[c], B, AminusB, paid: AminusB };
  }
  const baseUncapped = terms.base.AminusB;
  const basePaid = Math.min(baseUncapped, capRoom); // [L11]
  terms.base = { ...terms.base, paid: basePaid };
  const survivorPension = basePaid + terms.firstAdditional.paid + terms.secondAdditional.paid;
  const reductionFromFull = fullAmount - survivorPension; // [L17]

  return {
    kind: "COMPUTED",
    branch,
    calculationMonth: calc,
    amountBasis: "UNROUNDED_BASIC_MONTHLY_AMOUNT",
    indexingBasis,
    officialFixtureStatus: "MISSING_SERVICE_CANADA_CONFIRMATION",
    deceasedPortions,
    fullAmount,
    survivorPension,
    reductionFromFull,
    terms,
    ownUnadjustedPortions: R,
    cap: {
      capYear,
      mpea,
      capAmount,
      capRoom,
      binding: capRoom < baseUncapped,
      trim: baseUncapped - basePaid,
    },
    s46_5: assessS46_5(input, ownPension, reductionFromFull),
    precisionCaveats: PRECISION_CAVEATS,
  };
}

/**
 * s.46(5) applies only to a downward s.46(3)/(3.1)/(4) factor [L16]. It modifies the
 * survivor's own retirement pension, never the survivor pension above. No retirement
 * dollars are produced because L17-L19 are unresolved.
 */
function assessS46_5(
  input: Cpp5Input,
  own: SurvivorOwnRetirementInput,
  reductionFromFull: number,
): S46_5Assessment {
  const m65 = ym(month65(input.survivor.birth));
  const start = ym(own.commencement);
  if (start === m65) return { status: "NOT_APPLICABLE", reason: "COMMENCED_AT_65_NO_FACTOR" };
  if (start > m65) return { status: "NOT_APPLICABLE", reason: "UPWARD_FACTOR_ONLY" };
  if (!(reductionFromFull > 0))
    return { status: "NOT_APPLICABLE", reason: "SURVIVOR_PENSION_NOT_REDUCED" };

  const year = input.survivorPensionReductionYear;
  const num = input.pensionIndex[own.commencement.year];
  const den = year === undefined ? undefined : input.pensionIndex[year];
  return {
    status: "UNVERIFIED_RULE",
    triggered: true,
    factorDirection: "DOWNWARD",
    candidateReduction: reductionFromFull,
    pensionIndexRatio: num !== undefined && den !== undefined ? num / den : null, // [L18]
    blockers: ["L17", "L18", "L19"],
  };
}
