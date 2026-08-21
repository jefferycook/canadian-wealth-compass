/**
 * The Canadian income tax engine.
 *
 * Ported verbatim from the verified original. Pure functions: everything the
 * calculation needs arrives as arguments.
 */

import type { Bracket, ProvinceTax, TaxYear } from "./taxYears";
import { getProvince } from "./taxYears";
import type {
  HouseholdTaxResult,
  IncomeComponents,
  TaxResult,
  TaxSettings,
} from "./types";

/** Progressive tax on an income across a bracket table. */
export function bracketTax(income: number, brackets: Bracket[]): number {
  let tax = 0;
  let lo = 0;
  for (const b of brackets) {
    if (income > lo) {
      tax += (Math.min(income, b.up) - lo) * b.rate;
      lo = b.up;
    } else break;
  }
  return tax;
}

/** Ontario Health Premium, levied on taxable income. */
export function ontarioHealthPremium(inc: number): number {
  if (inc <= 20000) return 0;
  if (inc <= 36000) return Math.min((inc - 20000) * 0.06, 300);
  if (inc <= 48000) return Math.min(300 + (inc - 36000) * 0.06, 450);
  if (inc <= 72000) return Math.min(450 + (inc - 48000) * 0.25, 600);
  if (inc <= 200000) return Math.min(600 + (inc - 72000) * 0.25, 750);
  return Math.min(750 + (inc - 200000) * 0.25, 900);
}

/**
 * Combined federal and provincial tax for one person, including the OAS
 * recovery tax.
 *
 * Net income for the clawback is approximated by taxable income; the original
 * engine made the same simplification and it ignores deductions.
 */
export function computeTax(
  inc: IncomeComponents,
  opts: TaxSettings,
  ty: TaxYear,
): TaxResult {
  const prov: ProvinceTax = getProvince(ty, opts.provinceKey);
  const grossedDiv = inc.eligDiv * ty.divGrossUp;
  const taxable = inc.ordinary + grossedDiv + inc.capGainsTaxable;
  const netIncome = taxable;

  /* ---- Federal ---- */
  let fed = bracketTax(taxable, ty.federal);
  const fedLow = ty.federal[0]!.rate;

  // The basic personal amount phases down from its maximum to the floor across
  // the top two federal brackets.
  const bpaMax = opts.fedBPA;
  let fedBPAeff = bpaMax;
  if (netIncome > ty.fedBpaPhaseLo) {
    fedBPAeff = Math.max(
      ty.fedBpaMin,
      bpaMax -
        ((bpaMax - ty.fedBpaMin) *
          (Math.min(netIncome, ty.fedBpaPhaseHi) - ty.fedBpaPhaseLo)) /
          (ty.fedBpaPhaseHi - ty.fedBpaPhaseLo),
    );
  }

  let fedCred = fedBPAeff * fedLow;
  if (inc.age >= 65) {
    // Age amount, phased out above the threshold
    fedCred +=
      Math.max(
        0,
        ty.fedAgeAmt - ty.agePhaseRate * Math.max(0, netIncome - ty.fedAgeThresh),
      ) * fedLow;
  }
  fedCred += Math.min(ty.fedPenAmt, inc.pensionEligible) * fedLow;
  fed = Math.max(0, fed - fedCred);
  fed = Math.max(0, fed - grossedDiv * ty.fedDivCredit);

  /* ---- Provincial ---- */
  let provTax = bracketTax(taxable, prov.brackets);
  const provLow = prov.brackets[0]!.rate;
  let provCred = opts.provBPA * provLow;
  if (inc.age >= 65 && prov.ageAmt) {
    provCred +=
      Math.max(
        0,
        prov.ageAmt - ty.agePhaseRate * Math.max(0, netIncome - prov.ageThresh),
      ) * provLow;
  }
  provCred += Math.min(prov.penAmt || 0, inc.pensionEligible) * provLow;
  provTax = Math.max(0, provTax - provCred);
  provTax = Math.max(0, provTax - grossedDiv * prov.divCredit);

  // Surtax applies to provincial tax, not to income
  let surtax = 0;
  for (const s of prov.surtax) surtax += Math.max(0, provTax - s.over) * s.rate;
  provTax += surtax;

  const ohp = prov.healthPremium ? ontarioHealthPremium(taxable) : 0;

  /* ---- OAS recovery tax ---- */
  const oasClaw = Math.min(
    inc.oasReceived,
    Math.max(0, netIncome - opts.oasThresh) * 0.15,
  );

  return {
    tax: fed + provTax + ohp + oasClaw,
    taxable,
    netIncome,
    oasClawback: oasClaw,
    marginalBase: fed + provTax + ohp,
  };
}

/**
 * Household tax with pension-income-splitting optimization.
 *
 * CRA (Form T1032) permits allocating up to 50% of eligible pension income to
 * the other spouse. Rather than assuming 50/50, this searches the full 0-50%
 * range in both directions in 1% steps and keeps whichever transfer produces
 * the lowest combined tax. The step is fine enough that credit phase-outs and
 * bracket edges are not stepped over.
 *
 * @param canSplit False for partners who are neither married nor common-law.
 */

export function householdTax(
  incs: IncomeComponents[],
  opts: TaxSettings,
  canSplit: boolean,
  ty: TaxYear,
): HouseholdTaxResult {
  if (incs.length === 0) return { tax: 0, perPerson: [], splitAmt: 0, dir: -1 };
  if (incs.length === 1) {
    const r = computeTax(incs[0]!, opts, ty);
    return { tax: r.tax, perPerson: [r], splitAmt: 0, dir: -1 };
  }

  const a = incs[0]!;
  const b = incs[1]!;
  const ra = computeTax(a, opts, ty);
  const rb = computeTax(b, opts, ty);
  let best: HouseholdTaxResult = {
    tax: ra.tax + rb.tax,
    perPerson: [ra, rb],
    splitAmt: 0,
    dir: -1,
  };
  if (canSplit === false) return best;

  /**
   * Search transfers from one spouse to the other.
   *
   * @param eligible The transferor's eligible pension income. The statutory
   *                 50% ceiling is applied here, once, and the search fraction
   *                 sweeps the whole 0-50% range beneath it.
   */
  const tryDir = (from: number, to: number, eligible: number) => {
    if (!(eligible > 0)) return;
    // Integer steps: accumulating 0.01 in floating point stops just short of
    // 0.5, which would leave the statutory maximum transfer untested.
    const STEPS = 50;
    for (let s = 1; s <= STEPS; s++) {
      const f = s / (STEPS * 2);

      // Never transfer more than the transferor's ordinary income, so the
      // transferor's income cannot go negative.
      const T = Math.min(eligible * f, Math.max(0, incs[from]!.ordinary));
      if (T <= 0) continue;
      const fi = { ...incs[from]! };
      const ti = { ...incs[to]! };
      fi.ordinary -= T;
      fi.pensionEligible = Math.max(0, (fi.pensionEligible || 0) - T);
      ti.ordinary += T;
      ti.pensionEligible = (ti.pensionEligible || 0) + T;
      const rf = computeTax(fi, opts, ty);
      const rt = computeTax(ti, opts, ty);
      const tot = rf.tax + rt.tax;
      if (tot < best.tax - 1e-9) {
        best = {
          tax: tot,
          perPerson: from === 0 ? [rf, rt] : [rt, rf],
          splitAmt: T,
          dir: from,
        };
      }
    }
  };

  tryDir(0, 1, a.pensionEligible || 0);
  tryDir(1, 0, b.pensionEligible || 0);

  return best;
}

/** Approximate marginal rate: bump ordinary income by $1,000 and measure the delta. */
export function approxMarginal(
  inc: IncomeComponents,
  opts: TaxSettings,
  ty: TaxYear,
): number {
  const t0 = computeTax(inc, opts, ty).tax;
  const t1 = computeTax({ ...inc, ordinary: inc.ordinary + 1000 }, opts, ty).tax;
  return (t1 - t0) / 1000;
}
