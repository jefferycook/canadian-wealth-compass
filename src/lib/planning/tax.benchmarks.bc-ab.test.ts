/**
 * Hand-derived 2026 British Columbia and Alberta provincial income tax
 * benchmarks (CWC-T-02, #91).
 *
 * Ported from the stale draft PRs #32 / #49 (`benchmark-bc-ab.test.ts`, five
 * cases, identical in both) onto current main and extended to cover every
 * bracket edge, the BPAs, the age amounts, the pension income amounts
 * (including BC's non-indexed $1,000 through derived years) and the
 * provincial eligible-dividend tax credits.
 *
 * Every expected value below is a literal worked out by hand (arithmetic shown
 * beside it). No expected value calls `bracketTax`, reads an engine constant,
 * or is copied from engine output. The engine is driven with the published
 * 2026 table (`TAX_2026`) or a derived year from `getTaxYear`; the federal
 * layer is zeroed so only the provincial result is measured.
 *
 * Sources (2026 tax year; retrieved 2026-11-25):
 *  [R1] CRA, "Tax rates and income brackets for individuals – current year"
 *       (canada.ca …/tax-rates-brackets/current-year.html):
 *       BC 5.6% to $50,363; 7.7% to $100,728; 10.5% to $115,648; 12.29% to
 *       $140,430; 14.7% to $190,405; 16.8% to $265,545; 20.5% above.
 *       AB 8% to $61,200; 10% to $154,259; 12% to $185,111; 13% to $246,813;
 *       14% to $370,220; 15% above.
 *       Cross-checked: gov.bc.ca "Personal income tax rates" (BC table
 *       identical) and alberta.ca "Personal income tax" (AB table identical).
 *  [B1] Province of BC, "B.C. basic personal income tax credits"
 *       (gov.bc.ca …/income-taxes/personal/credits/basic): 2026 BPA $13,216
 *       (indexed); age amount $5,927 reduced when income exceeds $44,119;
 *       pension amount $1,000 (NOT indexed); eligible dividend credit 12%.
 *  [B2] BC Income Tax Act, RSBC 1996 c.215, s.4.32 (bclaws.gov.bc.ca):
 *       pension credit = appropriate percentage × the smaller of $1,000 and
 *       the federal s.118(3) pension amount base. A fixed statutory dollar
 *       figure, so it must not move in derived (indexed) years.
 *  [A1] CRA Form TD1AB 2026 (td1ab-26e.pdf), lines 1–3: BPA $22,769; age
 *       amount $6,345, partial between net income $47,234 and $89,534;
 *       pension income amount "whichever is less: $1,753 or your estimated
 *       annual pension".
 *  [A2] Alberta eligible-dividend tax credit 8.12% of the grossed-up
 *       (taxable) dividend for 2021+ (Alberta Personal Income Tax Act s.21,
 *       as amended 2020). SECONDARY SOURCE ONLY this session (taxtips.ca
 *       Alberta DTC table; ATB 2021 rate-change note); the statute text was
 *       not retrieved. Treat [A2] as unverified pending a primary check.
 *  [G]  Eligible-dividend gross-up 38% (ITA s.82(1)(b)(ii)); 15% age-amount
 *       reduction rate. Both BC and AB mirror the federal 15% reduction rate
 *       (consistent with [A1]: 47,234 + 6,345 / 0.15 = 89,534 exactly).
 *
 * Overlap statement: `taxYears.test.ts` already pins BC/AB *table values*
 * (BC pause 2027–2030, BC `penAmt` 1000 in derived years, AB `penAmt`
 * indexing, both `divCredit` rates). This file does not repeat those table
 * assertions; it pins the resulting *tax* computed by `computeTax` from
 * hand-derived arithmetic. `tax.benchmarks.on-fed.test.ts` (draft PR #110,
 * not on main) covers federal + Ontario only; `ohp.boundary.test.ts`
 * covers the Ontario Health Premium. No other file benchmarks BC or AB tax amounts.
 *
 * Scope note: these benchmarks check that the engine reproduces the published
 * schedule arithmetic. They do not approve the engine's methodology. BC's
 * low-income tax reduction (BC428 line 61 equivalent) is NOT modelled by the
 * engine and is out of scope here (see draft research PR #71).
 */

import { describe, expect, it } from "vitest";

import { computeTax } from "./tax";
import { TAX_2026, getTaxYear } from "./taxYears";
import type { TaxYear } from "./taxYears";
import type { IncomeComponents } from "./types";

/** Zero the federal layer so only the provincial result remains. */
const provOnly = (ty: TaxYear): TaxYear => ({
  ...ty,
  federal: [{ up: Infinity, rate: 0 }],
  fedPenAmt: 0,
  fedAgeAmt: 0,
  fedDivCredit: 0,
});

const PROV_2026 = provOnly(TAX_2026);

interface Opts {
  age?: number;
  pension?: number;
  eligDiv?: number;
  ty?: TaxYear;
}

const provTax = (
  provinceKey: "BC" | "AB",
  provBPA: number,
  ordinary: number,
  { age = 45, pension = 0, eligDiv = 0, ty = PROV_2026 }: Opts = {},
) => {
  const inc: IncomeComponents = {
    ordinary,
    eligDiv,
    capGainsTaxable: 0,
    oasReceived: 0,
    age,
    pensionEligibleAnyAge: pension,
  };
  return computeTax(inc, { provinceKey, fedBPA: 0, provBPA, oasThresh: 95323, lifRate: 0 }, ty).tax;
};

// Hand-keyed BPAs [B1][A1] — deliberately not read from the engine table.
const BC_BPA = 13216;
const AB_BPA = 22769;
const bc = (income: number, o?: Opts) => provTax("BC", BC_BPA, income, o);
const ab = (income: number, o?: Opts) => provTax("AB", AB_BPA, income, o);

/* ------------------------------------------------------------------ */
/* British Columbia                                                    */
/* ------------------------------------------------------------------ */

/* Shared hand-derived BC partial sums [R1][B1]:
 *   5.6%   50,363 × 0.056  =  2,820.328
 *   7.7%   50,365 × 0.077  =  3,878.105  → cumulative  6,698.433
 *   10.5%  14,920 × 0.105  =  1,566.600  → cumulative  8,265.033
 *   12.29% 24,782 × 0.1229 =  3,045.7078 → cumulative 11,310.7408
 *   14.7%  49,975 × 0.147  =  7,346.325  → cumulative 18,657.0658
 *   16.8%  75,140 × 0.168  = 12,623.52   → cumulative 31,280.5858
 *   BPA credit 13,216 × 0.056 = 740.096
 */

describe("BC 2026 — brackets and BPA (hand-derived) [R1][B1]", () => {
  it("13,216 (= BPA) → 0: the credit exactly offsets the tax", () => {
    // 13,216 × 0.056 = 740.096 − 740.096
    expect(bc(13216)).toBeCloseTo(0, 9);
  });

  it("50,363 (top of 5.6%) → 2,080.232", () => {
    // 2,820.328 − 740.096
    expect(bc(50363)).toBeCloseTo(2080.232, 4);
  });

  it("60,000 → 2,822.281 (ported from #32/#49)", () => {
    // 2,820.328 + 9,637 × 0.077 (742.049) = 3,562.377 − 740.096
    expect(bc(60000)).toBeCloseTo(2822.281, 4);
  });

  it("100,728 (top of 7.7%) → 5,958.337", () => {
    // 6,698.433 − 740.096
    expect(bc(100728)).toBeCloseTo(5958.337, 4);
  });

  it("115,648 (top of 10.5%) → 7,524.937", () => {
    // 8,265.033 − 740.096
    expect(bc(115648)).toBeCloseTo(7524.937, 4);
  });

  it("120,000 → 8,059.7978 (ported from #32/#49)", () => {
    // 8,265.033 + 4,352 × 0.1229 (534.8608) = 8,799.8938 − 740.096
    expect(bc(120000)).toBeCloseTo(8059.7978, 4);
  });

  it("140,430 (top of 12.29%) → 10,570.6448", () => {
    // 11,310.7408 − 740.096
    expect(bc(140430)).toBeCloseTo(10570.6448, 4);
  });

  it("190,405 (top of 14.7%) → 17,916.9698", () => {
    // 18,657.0658 − 740.096
    expect(bc(190405)).toBeCloseTo(17916.9698, 4);
  });

  it("265,545 (top of 16.8%) → 30,540.4898", () => {
    // 31,280.5858 − 740.096
    expect(bc(265545)).toBeCloseTo(30540.4898, 4);
  });

  it("300,000 (20.5% band) → 37,603.7648", () => {
    // 31,280.5858 + 34,455 × 0.205 (7,063.275) = 38,343.8608 − 740.096
    expect(bc(300000)).toBeCloseTo(37603.7648, 4);
  });

  it("the next $1,000 above each edge is taxed at the next rate", () => {
    expect(bc(51363) - bc(50363)).toBeCloseTo(77, 6);
    expect(bc(101728) - bc(100728)).toBeCloseTo(105, 6);
    expect(bc(116648) - bc(115648)).toBeCloseTo(122.9, 6);
    expect(bc(141430) - bc(140430)).toBeCloseTo(147, 6);
    expect(bc(191405) - bc(190405)).toBeCloseTo(168, 6);
    expect(bc(266545) - bc(265545)).toBeCloseTo(205, 6);
  });
});

describe("BC 2026 — age amount (hand-derived) [B1][G]", () => {
  // 5,927 reduced by 15% of net income over 44,119; nil at
  // 44,119 + 5,927 / 0.15 = 83,632.33…

  it("40,000, age 65 → full age amount, 1,167.992", () => {
    // 40,000 × 0.056 = 2,240.00 − (13,216 + 5,927) × 0.056 (1,072.008)
    expect(bc(40000, { age: 65 })).toBeCloseTo(1167.992, 4);
  });

  it("70,000, age 65 → partial age amount 2,044.85, tax 3,477.7694", () => {
    // Reduction 0.15 × 25,881 = 3,882.15 → age amount 2,044.85
    // Gross 2,820.328 + 19,637 × 0.077 (1,512.049) = 4,332.377
    // Credits (13,216 + 2,044.85) × 0.056 = 854.6076
    expect(bc(70000, { age: 65 })).toBeCloseTo(3477.7694, 4);
  });

  it("90,000, age 65 → age amount eliminated, 5,132.281", () => {
    // 2,820.328 + 39,637 × 0.077 (3,052.049) = 5,872.377 − 740.096
    expect(bc(90000, { age: 65 })).toBeCloseTo(5132.281, 4);
    expect(bc(90000, { age: 64 })).toBeCloseTo(5132.281, 4);
  });
});

describe("BC 2026 — pension credit, smaller of $1,000 and the pension [B1][B2]", () => {
  it("pension below $1,000 → credit on the pension", () => {
    // 1,167.992 − 500 × 0.056 (28.00)
    expect(bc(40000, { age: 65, pension: 500 })).toBeCloseTo(1139.992, 4);
  });

  it("pension above $1,000 → credit capped at $1,000", () => {
    // 1,167.992 − 1,000 × 0.056 (56.00)
    expect(bc(40000, { age: 65, pension: 5000 })).toBeCloseTo(1111.992, 4);
  });

  // penAmtIndexed: false — the $1,000 base is statutory [B2] and must not
  // move in derived years, whether inside the 2027–2030 indexation pause or
  // after indexation resumes. Credit value = 1,000 × 0.056 = 56.00 in every
  // year (the 5.6% rate itself never indexes).
  it.each([2026, 2027, 2030, 2031, 2045])(
    "derived year %i: a $5,000 pension saves exactly $56.00",
    (year) => {
      const ty = provOnly(getTaxYear(year, 0.02));
      const without = bc(60000, { ty });
      const withPen = bc(60000, { ty, pension: 5000 });
      expect(without - withPen).toBeCloseTo(56, 6);
    },
  );

  it("2030 (inside the pause) reproduces the 2026 tax exactly", () => {
    // Brackets and BPA frozen 2027–2030, so 120,000 → 8,059.7978 as in 2026.
    const ty = provOnly(getTaxYear(2030, 0.02));
    expect(bc(120000, { ty })).toBeCloseTo(8059.7978, 4);
  });
});

describe("BC 2026 — eligible dividend tax credit 12% [B1][G]", () => {
  it("60,000 ordinary + 10,000 eligible dividend → 2,228.881", () => {
    // Grossed-up 13,800; taxable 73,800
    // Gross 2,820.328 + 23,437 × 0.077 (1,804.649) = 4,624.977
    // − BPA 740.096 = 3,884.881 − 13,800 × 0.12 (1,656.00)
    expect(bc(60000, { eligDiv: 10000 })).toBeCloseTo(2228.881, 4);
  });
});

/* ------------------------------------------------------------------ */
/* Alberta                                                             */
/* ------------------------------------------------------------------ */

/* Shared hand-derived AB partial sums [R1][A1]:
 *   8%   61,200 × 0.08 =  4,896.00
 *   10%  93,059 × 0.10 =  9,305.90 → cumulative 14,201.90
 *   12%  30,852 × 0.12 =  3,702.24 → cumulative 17,904.14
 *   13%  61,702 × 0.13 =  8,021.26 → cumulative 25,925.40
 *   14% 123,407 × 0.14 = 17,276.98 → cumulative 43,202.38
 *   BPA credit 22,769 × 0.08 = 1,821.52
 */

describe("AB 2026 — brackets and BPA (hand-derived) [R1][A1]", () => {
  it("20,000 → 0: credit exceeds tax (ported from #32/#49)", () => {
    // 20,000 × 0.08 = 1,600 < 1,821.52
    expect(ab(20000)).toBe(0);
  });

  it("61,200 (top of 8%) → 3,074.48", () => {
    // 4,896.00 − 1,821.52
    expect(ab(61200)).toBeCloseTo(3074.48, 4);
  });

  it("100,000 → 6,954.48 (ported from #32/#49)", () => {
    // 4,896 + 38,800 × 0.10 (3,880) = 8,776 − 1,821.52
    expect(ab(100000)).toBeCloseTo(6954.48, 4);
  });

  it("154,259 (top of 10%) → 12,380.38", () => {
    // 14,201.90 − 1,821.52
    expect(ab(154259)).toBeCloseTo(12380.38, 4);
  });

  it("185,111 (top of 12%) → 16,082.62", () => {
    // 17,904.14 − 1,821.52
    expect(ab(185111)).toBeCloseTo(16082.62, 4);
  });

  it("200,000 → 18,018.19 (ported from #32/#49)", () => {
    // 17,904.14 + 14,889 × 0.13 (1,935.57) = 19,839.71 − 1,821.52
    expect(ab(200000)).toBeCloseTo(18018.19, 4);
  });

  it("246,813 (top of 13%) → 24,103.88", () => {
    // 25,925.40 − 1,821.52
    expect(ab(246813)).toBeCloseTo(24103.88, 4);
  });

  it("370,220 (top of 14%) → 41,380.86", () => {
    // 43,202.38 − 1,821.52
    expect(ab(370220)).toBeCloseTo(41380.86, 4);
  });

  it("400,000 (15% band) → 45,847.86", () => {
    // 43,202.38 + 29,780 × 0.15 (4,467.00) = 47,669.38 − 1,821.52
    expect(ab(400000)).toBeCloseTo(45847.86, 4);
  });

  it("the next $1,000 above each edge is taxed at the next rate", () => {
    expect(ab(62200) - ab(61200)).toBeCloseTo(100, 6);
    expect(ab(155259) - ab(154259)).toBeCloseTo(120, 6);
    expect(ab(186111) - ab(185111)).toBeCloseTo(130, 6);
    expect(ab(247813) - ab(246813)).toBeCloseTo(140, 6);
    expect(ab(371220) - ab(370220)).toBeCloseTo(150, 6);
  });
});

describe("AB 2026 — age amount (hand-derived) [A1][G]", () => {
  // 6,345 reduced by 15% of net income over 47,234; nil at
  // 47,234 + 6,345 / 0.15 = 89,534 (matches TD1AB line 2).

  it("40,000, age 65 → full age amount, 870.88", () => {
    // 40,000 × 0.08 = 3,200 − (22,769 + 6,345) × 0.08 (2,329.12)
    expect(ab(40000, { age: 65 })).toBeCloseTo(870.88, 4);
  });

  it("70,000, age 65 → partial age amount 2,930.10, tax 3,720.072", () => {
    // Reduction 0.15 × 22,766 = 3,414.90 → age amount 2,930.10
    // Gross 4,896 + 8,800 × 0.10 (880) = 5,776
    // Credits (22,769 + 2,930.10) × 0.08 = 2,055.928
    expect(ab(70000, { age: 65 })).toBeCloseTo(3720.072, 4);
  });

  it("89,534 (TD1AB upper limit), age 65 → age amount nil, 5,907.88", () => {
    // 4,896 + 28,334 × 0.10 (2,833.40) = 7,729.40 − 1,821.52
    expect(ab(89534, { age: 65 })).toBeCloseTo(5907.88, 4);
    expect(ab(89534, { age: 64 })).toBeCloseTo(5907.88, 4);
  });
});

describe("AB 2026 — pension credit, lesser of $1,753 and the pension [A1]", () => {
  it("pension below $1,753 → credit on the pension", () => {
    // 870.88 − 1,000 × 0.08 (80.00)
    expect(ab(40000, { age: 65, pension: 1000 })).toBeCloseTo(790.88, 4);
  });

  it("pension above $1,753 → credit capped at $1,753", () => {
    // 870.88 − 1,753 × 0.08 (140.24)
    expect(ab(40000, { age: 65, pension: 5000 })).toBeCloseTo(730.64, 4);
  });

  // Contrast with BC: AB's pension amount indexes (2024 1,685 → 2025 1,719 →
  // 2026 1,753). At a 2% planning rate, rounded to the nearest dollar:
  //   2027: 1,753 × 1.02     = 1,788.06       → 1,788 → credit 143.04
  //   2031: 1,753 × 1.02^5   = 1,935.4536…    → 1,935 → credit 154.80
  it.each([
    [2027, 143.04],
    [2031, 154.8],
  ])("derived year %i: a $5,000 pension saves %s", (year, saving) => {
    const ty = provOnly(getTaxYear(year, 0.02));
    const without = ab(60000, { ty });
    const withPen = ab(60000, { ty, pension: 5000 });
    expect(without - withPen).toBeCloseTo(saving, 6);
  });
});

describe("AB 2026 — eligible dividend tax credit 8.12% [A2][G]", () => {
  it("60,000 ordinary + 10,000 eligible dividend → 3,213.92", () => {
    // Grossed-up 13,800; taxable 73,800
    // Gross 4,896 + 12,600 × 0.10 (1,260) = 6,156 − 1,821.52 = 4,334.48
    // − 13,800 × 0.0812 (1,120.56)
    expect(ab(60000, { eligDiv: 10000 })).toBeCloseTo(3213.92, 4);
  });

  it("credit cannot push provincial tax below zero", () => {
    // Taxable 26,900: 2,152 − 1,821.52 = 330.48 − 6,900 × 0.0812 (560.28) → 0
    expect(ab(20000, { eligDiv: 5000 })).toBe(0);
  });
});
