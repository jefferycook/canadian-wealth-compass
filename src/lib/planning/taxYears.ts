/**
 * Canadian tax constants, keyed by tax year.
 *
 * Every figure that indexes annually lives here so that a new tax year is a
 * data change, not a code change. Values are carried over verbatim from the
 * verified 2026 tables in the original planner.
 *
 * Sources: CRA indexation tables, taxtips.ca provincial rate tables, FSRA
 * (Ontario LIF maximums), ESDC quarterly CPP/OAS benefit amounts.
 */

import type { ProvinceKey } from "./types";

export interface Bracket {
  /** Upper bound of the bracket. Use Infinity for the top bracket. */
  up: number;
  /** Marginal rate as a fraction. */
  rate: number;
}

export interface Surtax {
  /** Provincial tax above this amount is surtaxed. */
  over: number;
  rate: number;
}

export interface ProvinceTax {
  name: string;
  brackets: Bracket[];
  surtax: Surtax[];
  /** Ontario levies a health premium on taxable income. */
  healthPremium: boolean;
  /** Basic personal amount. */
  bpa: number;
  /** Age amount (65+). */
  ageAmt: number;
  /** Net income at which the age amount begins to phase out. */
  ageThresh: number;
  /** Pension income amount. */
  penAmt: number;
  /** Dividend tax credit, as a fraction of the grossed-up eligible dividend. */
  divCredit: number;
}

export interface TaxYear {
  year: number;
  federal: Bracket[];
  provinces: Record<string, ProvinceTax>;

  /** Federal basic personal amount, maximum and floor, with its phase-out range. */
  fedBpaMax: number;
  fedBpaMin: number;
  fedBpaPhaseLo: number;
  fedBpaPhaseHi: number;

  fedAgeAmt: number;
  fedAgeThresh: number;
  /** Rate at which the age amount is clawed back. */
  agePhaseRate: number;
  fedPenAmt: number;
  /** Federal dividend tax credit, as a fraction of the grossed-up dividend. */
  fedDivCredit: number;
  /** Eligible dividend gross-up multiplier. */
  divGrossUp: number;

  /** OAS recovery-tax threshold. */
  oasThreshold: number;
  /** Annual OAS maximum, ages 65-74. */
  oasMax65: number;
  /** Annual OAS maximum, age 75+. */
  oasMax75: number;

  /** Annual CPP maximum at 65. */
  cppMax65: number;
  /** Average new CPP retirement pension taken at 65, annualized. */
  cppAvgNew65: number;
  /** Survivor's pension flat-rate portion, annualized (under 65). */
  cppSurvFlat: number;
  /** Maximum survivor's pension, under 65, annualized. */
  cppSurvMaxU65: number;
  /** Maximum survivor's pension, 65+, annualized. */
  cppSurvMax65: number;
  /** Maximum combined survivor + own retirement pension, annualized. */
  cppCombinedMax: number;
  /** One-time CPP death benefit. */
  cppDeathBenefit: number;

  /** Annual new TFSA room. */
  tfsaNewRoom: number;
  /** Annual RRSP dollar limit. */
  rrspLimit: number;
}

/* ------------------------------------------------------------------ */
/* 2026                                                                */
/* ------------------------------------------------------------------ */

const PROVINCES_2026: Record<string, ProvinceTax> = {
  ON: {
    name: "Ontario",
    brackets: [
      { up: 53891, rate: 0.0505 },
      { up: 107785, rate: 0.0915 },
      { up: 150000, rate: 0.1116 },
      { up: 220000, rate: 0.1216 },
      { up: Infinity, rate: 0.1316 },
    ],
    surtax: [
      { over: 5818, rate: 0.2 },
      { over: 7446, rate: 0.36 },
    ],
    healthPremium: true,
    bpa: 12989,
    ageAmt: 6342,
    ageThresh: 47210,
    penAmt: 1796,
    divCredit: 0.1,
  },
  BC: {
    name: "British Columbia",
    brackets: [
      { up: 50363, rate: 0.056 },
      { up: 100728, rate: 0.077 },
      { up: 115648, rate: 0.105 },
      { up: 140430, rate: 0.1229 },
      { up: 190405, rate: 0.147 },
      { up: 265545, rate: 0.168 },
      { up: Infinity, rate: 0.205 },
    ],
    surtax: [],
    healthPremium: false,
    bpa: 13216,
    ageAmt: 5691,
    ageThresh: 42580,
    penAmt: 1000,
    divCredit: 0.12,
  },
  AB: {
    name: "Alberta",
    brackets: [
      { up: 61200, rate: 0.08 },
      { up: 154259, rate: 0.1 },
      { up: 185111, rate: 0.12 },
      { up: 246813, rate: 0.13 },
      { up: 370220, rate: 0.14 },
      { up: Infinity, rate: 0.15 },
    ],
    surtax: [],
    healthPremium: false,
    bpa: 22769,
    ageAmt: 6055,
    ageThresh: 45210,
    penAmt: 1685,
    divCredit: 0.0812,
  },
  CUSTOM: {
    name: "Custom",
    brackets: [
      { up: 50000, rate: 0.1 },
      { up: Infinity, rate: 0.15 },
    ],
    surtax: [],
    healthPremium: false,
    bpa: 12000,
    ageAmt: 0,
    ageThresh: 9e9,
    penAmt: 0,
    divCredit: 0.1,
  },
};

export const TAX_2026: TaxYear = {
  year: 2026,
  federal: [
    { up: 58523, rate: 0.14 },
    { up: 117045, rate: 0.205 },
    { up: 181440, rate: 0.26 },
    { up: 258482, rate: 0.29 },
    { up: Infinity, rate: 0.33 },
  ],
  provinces: PROVINCES_2026,

  fedBpaMax: 16452,
  fedBpaMin: 14829,
  fedBpaPhaseLo: 181440,
  fedBpaPhaseHi: 258482,

  fedAgeAmt: 9208,
  fedAgeThresh: 46432,
  agePhaseRate: 0.15,
  fedPenAmt: 2000,
  fedDivCredit: 0.150198,
  divGrossUp: 1.38,

  oasThreshold: 95323,
  // July-September quarter maximums, annualized. 75+ receives 10% more.
  oasMax65: 9023.64,
  oasMax75: 9926.04,

  cppMax65: 18091.8, // $1,507.65/mo
  cppAvgNew65: 10464, // $872/mo — average new retirement pension taken at 65
  cppSurvFlat: 238.17 * 12,
  cppSurvMaxU65: 803.54 * 12,
  cppSurvMax65: 904.59 * 12,
  cppCombinedMax: 1531.56 * 12,
  cppDeathBenefit: 2500,

  tfsaNewRoom: 7000,
  rrspLimit: 33810,
};

const TAX_YEARS: Record<number, TaxYear> = {
  2026: TAX_2026,
};

/** The most recent tax year with published constants. */
export const LATEST_TAX_YEAR = 2026;

/**
 * Look up a tax year's constants. Years beyond the published tables fall back
 * to the latest available year rather than throwing, because a projection
 * necessarily runs past the last year anyone has published.
 */
export function getTaxYear(year: number): TaxYear {
  return TAX_YEARS[year] ?? TAX_YEARS[LATEST_TAX_YEAR]!;
}

export function getProvince(taxYear: TaxYear, key: ProvinceKey): ProvinceTax {
  const p = taxYear.provinces[key];
  if (!p) throw new Error(`Unknown province "${key}" for tax year ${taxYear.year}`);
  return p;
}

/** Province keys with published tables, in display order. */
export function provinceKeys(taxYear: TaxYear): ProvinceKey[] {
  return Object.keys(taxYear.provinces) as ProvinceKey[];
}
