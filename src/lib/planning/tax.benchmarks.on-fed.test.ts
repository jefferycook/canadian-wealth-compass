/**
 * Hand-derived 2026 federal and Ontario income tax benchmarks (CWC-T-01, #90).
 *
 * Ported from the stale draft PRs #31 / #36 / #47 onto current main and
 * extended to cover bracket edges, the federal BPA phase-out, the age amount
 * phase-out, the pension income credit and the Ontario surtax thresholds.
 *
 * Every expected value below is a literal worked out by hand (arithmetic shown
 * in the comment beside it). No expected value calls `bracketTax`, reads an
 * engine constant, or is copied from engine output. The engine is driven with
 * the published 2026 table (`TAX_2026`); the other jurisdiction is zeroed so
 * each layer is measured in isolation, and the Ontario Health Premium is
 * switched off in the Ontario layer (its schedule is pinned separately in
 * `ohp.boundary.test.ts`).
 *
 * Sources (2026 tax year; retrieved 2026-11-24):
 *  [F1] CRA, "Tax rates and income brackets for individuals – current year":
 *       federal 14% to $58,523; 20.5% to $117,045; 26% to $181,440;
 *       29% to $258,482; 33% above. Ontario 5.05% to $53,891; 9.15% to
 *       $107,785; 11.16% to $150,000; 12.16% to $220,000; 13.16% above.
 *  [F2] CRA, "Adjustment of personal income tax and benefit amounts" (2026):
 *       BPA $16,452 at net income ≤ $181,440, reducing to $14,829 at net
 *       income ≥ $258,482; age amount $9,208, net-income threshold $46,432.
 *  [F3] CRA Form TD1 2026 (td1-26e.pdf): line 1 BPA $16,452 (reduced above
 *       $181,440); line 3 age amount $9,208, partial between $46,432 and
 *       $107,819; line 4 pension income amount "whichever is less: $2,000 or
 *       your estimated annual pension income" (ITA s.118(3), 15% clawback
 *       rate on the age amount per ITA s.118(2)).
 *  [O1] CRA Form TD1ON 2026 (td1on-26e.pdf): BPA $12,989; age amount $6,342,
 *       partial between net income $47,210 and $89,490; pension income
 *       amount lesser of $1,796 or the pension.
 *  [O2] Ontario surtax 2026: 20% of basic Ontario tax over $5,818 plus 36% of
 *       basic Ontario tax over $7,446. PRIMARY SOURCE NOT RETRIEVED this
 *       session (CRA T4127 Jan-2026 edition unavailable); corroborated by EY
 *       Global Tax News 2026-0747 (Ontario Budget 2026), RCGT "Individual
 *       taxation Ontario 2026" and KPMG 2026 rate tables, and consistent with
 *       2025's $5,710 / $7,307 indexed by Ontario's 1.019 factor
 *       (5,710 × 1.019 = 5,818.49 → 5,818; 7,307 × 1.019 = 7,445.83 → 7,446).
 *       Treat [O2] as secondary-source verified pending a primary check.
 *
 * Scope note: these benchmarks check that the engine reproduces the published
 * schedule arithmetic. They do not approve the engine's methodology.
 */

import { describe, expect, it } from "vitest";

import { computeTax } from "./tax";
import { TAX_2026 } from "./taxYears";
import type { TaxYear } from "./taxYears";
import type { IncomeComponents } from "./types";

/** Federal layer only: Ontario replaced by a single 0% bracket, no credits. */
const FED_ONLY: TaxYear = {
  ...TAX_2026,
  provinces: {
    ...TAX_2026.provinces,
    ON: {
      name: "Zeroed (benchmark isolation)",
      brackets: [{ up: Infinity, rate: 0 }],
      surtax: [],
      healthPremium: false,
      bpa: 0,
      ageAmt: 0,
      ageThresh: 0,
      penAmt: 0,
      divCredit: 0,
    },
  },
};

/** Ontario layer only: federal zeroed, Ontario Health Premium switched off. */
const ON_ONLY: TaxYear = {
  ...TAX_2026,
  federal: [{ up: Infinity, rate: 0 }],
  fedPenAmt: 0,
  fedAgeAmt: 0,
  fedDivCredit: 0,
  provinces: {
    ...TAX_2026.provinces,
    ON: { ...TAX_2026.provinces["ON"]!, healthPremium: false },
  },
};

const inc = (ordinary: number, age = 45, pensionEligibleAnyAge = 0): IncomeComponents => ({
  ordinary,
  eligDiv: 0,
  capGainsTaxable: 0,
  oasReceived: 0,
  age,
  pensionEligibleAnyAge,
});

const fedTax = (income: number, age = 45, pension = 0) =>
  computeTax(
    inc(income, age, pension),
    { provinceKey: "ON", fedBPA: 16452, provBPA: 0, oasThresh: 95323, lifRate: 0 },
    FED_ONLY,
  ).tax;

const onTax = (income: number, age = 45, pension = 0) =>
  computeTax(
    inc(income, age, pension),
    { provinceKey: "ON", fedBPA: 0, provBPA: 12989, oasThresh: 95323, lifRate: 0 },
    ON_ONLY,
  ).tax;

/* Shared hand-derived federal partial sums [F1]:
 *   full 14% band     58,523 × 0.14  =  8,193.22
 *   full 20.5% band   58,522 × 0.205 = 11,997.01  → cumulative 20,190.23
 *   full 26% band     64,395 × 0.26  = 16,742.70  → cumulative 36,932.93
 *   full 29% band     77,042 × 0.29  = 22,342.18  → cumulative 59,275.11
 *   BPA credit (max)  16,452 × 0.14  =  2,303.28
 *   BPA credit (min)  14,829 × 0.14  =  2,076.06
 */

describe("federal 2026 — bracket edges (hand-derived) [F1][F2]", () => {
  it("50,000 → 4,696.72", () => {
    // 50,000 × 0.14 = 7,000.00 − 2,303.28
    expect(fedTax(50000)).toBeCloseTo(4696.72, 2);
  });

  it("58,523 (top of 14%) → 5,889.94", () => {
    // 8,193.22 − 2,303.28
    expect(fedTax(58523)).toBeCloseTo(5889.94, 2);
  });

  it("100,000 → 14,392.725", () => {
    // 8,193.22 + 41,477 × 0.205 (8,502.785) = 16,696.005 − 2,303.28
    expect(fedTax(100000)).toBeCloseTo(14392.725, 2);
  });

  it("117,045 (top of 20.5%) → 17,886.95", () => {
    // 20,190.23 − 2,303.28
    expect(fedTax(117045)).toBeCloseTo(17886.95, 2);
  });

  it("181,440 (top of 26%, BPA phase-out starts) → 34,629.65", () => {
    // 36,932.93 − 2,303.28
    expect(fedTax(181440)).toBeCloseTo(34629.65, 2);
  });

  it("258,482 (top of 29%, BPA at floor) → 57,199.05", () => {
    // 59,275.11 − 2,076.06
    expect(fedTax(258482)).toBeCloseTo(57199.05, 2);
  });

  it("300,000 → 70,899.99", () => {
    // 59,275.11 + 41,518 × 0.33 (13,700.94) = 72,976.05 − 2,076.06
    expect(fedTax(300000)).toBeCloseTo(70899.99, 2);
  });

  it("the next $1,000 above each edge is taxed at the next rate", () => {
    expect(fedTax(59523) - fedTax(58523)).toBeCloseTo(205, 6); // 1,000 × 20.5%
    expect(fedTax(118045) - fedTax(117045)).toBeCloseTo(260, 6); // 1,000 × 26%
    // Inside the BPA phase-out the lost credit adds to the 29% rate:
    // 1,000 × 0.29 + 1,000 × (1,623 / 77,042) × 0.14
    //   = 290 + 227,220 / 77,042 = 290 + 2.949300… = 292.9493
    expect(fedTax(182440) - fedTax(181440)).toBeCloseTo(292.9493, 4);
    // Above 258,482 the BPA is at its floor, so only the 33% rate applies.
    expect(fedTax(259482) - fedTax(258482)).toBeCloseTo(330, 6);
  });
});

describe("federal 2026 — BPA phase-out (hand-derived) [F2][F3]", () => {
  it("midpoint 219,961 → BPA 15,640.50, tax 45,914.35", () => {
    // Midpoint of 181,440..258,482 = 219,961 (38,521 into a 77,042 range)
    // BPA = 16,452 − 1,623 × 38,521 / 77,042 = 16,452 − 811.50 = 15,640.50
    // Gross 36,932.93 + 38,521 × 0.29 (11,171.09) = 48,104.02
    // Credit 15,640.50 × 0.14 = 2,189.67 → 45,914.35
    expect(fedTax(219961)).toBeCloseTo(45914.35, 2);
  });
});

describe("federal 2026 — age amount phase-out (hand-derived) [F2][F3]", () => {
  // Age amount 9,208, reduced by 15% of net income over 46,432; nil at
  // 46,432 + 9,208 / 0.15 = 107,818.67 (TD1 rounds to 107,819).

  it("40,000, age 65 → full age amount, 2,007.60", () => {
    // 40,000 × 0.14 = 5,600.00 − (16,452 + 9,208) × 0.14 (3,592.40)
    expect(fedTax(40000, 65)).toBeCloseTo(2007.6, 2);
    // Age 64 gets no age amount: 5,600.00 − 2,303.28 = 3,296.72
    expect(fedTax(40000, 64)).toBeCloseTo(3296.72, 2);
  });

  it("46,432 (threshold), age 65 → still full, 2,908.08", () => {
    // 46,432 × 0.14 = 6,500.48 − 3,592.40
    expect(fedTax(46432, 65)).toBeCloseTo(2908.08, 2);
  });

  it("80,000, age 65 → partial age amount 4,172.80, tax 9,708.533", () => {
    // Reduction 0.15 × 33,568 = 5,035.20 → age amount 4,172.80
    // Gross 8,193.22 + 21,477 × 0.205 (4,402.785) = 12,596.005
    // Credits (16,452 + 4,172.80) × 0.14 = 2,887.472
    expect(fedTax(80000, 65)).toBeCloseTo(9708.533, 3);
  });

  it("107,819 and 110,000, age 65 → age amount fully eliminated", () => {
    // At 107,819: 9,208 − 0.15 × 61,387 = −0.05 → 0
    // Gross 8,193.22 + 49,296 × 0.205 (10,105.68) = 18,298.90 − 2,303.28
    expect(fedTax(107819, 65)).toBeCloseTo(15995.62, 2);
    expect(fedTax(107819, 65)).toBeCloseTo(fedTax(107819, 64), 9);
    // 110,000: 8,193.22 + 51,477 × 0.205 (10,552.785) − 2,303.28
    expect(fedTax(110000, 65)).toBeCloseTo(16442.725, 3);
  });
});

describe("federal 2026 — pension income credit (hand-derived) [F3]", () => {
  it("credit base is the eligible pension when below $2,000", () => {
    // 2,007.60 (age 65 at 40,000) − 1,500 × 0.14 (210.00)
    expect(fedTax(40000, 65, 1500)).toBeCloseTo(1797.6, 2);
  });

  it("credit base is capped at $2,000", () => {
    // 2,007.60 − 2,000 × 0.14 (280.00)
    expect(fedTax(40000, 65, 5000)).toBeCloseTo(1727.6, 2);
  });
});

/* Shared hand-derived Ontario partial sums [F1][O1]:
 *   full 5.05% band   53,891 × 0.0505 = 2,721.4955
 *   full 9.15% band   53,894 × 0.0915 = 4,931.3010 → cumulative  7,652.7965
 *   full 11.16% band  42,215 × 0.1116 = 4,711.1940 → cumulative 12,363.9905
 *   full 12.16% band  70,000 × 0.1216 = 8,512.0000 → cumulative 20,875.9905
 *   BPA credit        12,989 × 0.0505 =   655.9445
 * Surtax [O2]: 20% × (basic − 5,818) + 36% × (basic − 7,446), each ≥ 0.
 */

describe("Ontario 2026 — bracket edges and surtax (hand-derived) [F1][O1][O2]", () => {
  it("50,000 → 1,869.0555 (no surtax)", () => {
    // 50,000 × 0.0505 = 2,525.00 − 655.9445
    expect(onTax(50000)).toBeCloseTo(1869.0555, 4);
  });

  it("53,891 (top of 5.05%) → 2,065.551", () => {
    // 2,721.4955 − 655.9445
    expect(onTax(53891)).toBeCloseTo(2065.551, 4);
  });

  it("100,000 → 6,377.8294 (first surtax tier only)", () => {
    // 2,721.4955 + 46,109 × 0.0915 (4,218.9735) − 655.9445 = 6,284.5245
    // Surtax (6,284.5245 − 5,818) × 0.20 = 93.3049
    expect(onTax(100000)).toBeCloseTo(6377.8294, 4);
  });

  it("107,785 (top of 9.15%) → 7,232.6224", () => {
    // 7,652.7965 − 655.9445 = 6,996.852; surtax 1,178.852 × 0.20 = 235.7704
    expect(onTax(107785)).toBeCloseTo(7232.6224, 4);
  });

  it("150,000 (top of 11.16%) → 14,420.39176 (both surtax tiers)", () => {
    // 12,363.9905 − 655.9445 = 11,708.046
    // Surtax 5,890.046 × 0.20 (1,178.0092) + 4,262.046 × 0.36 (1,534.33656)
    expect(onTax(150000)).toBeCloseTo(14420.39176, 4);
  });

  it("220,000 (top of 12.16%) → 27,699.11176", () => {
    // 20,875.9905 − 655.9445 = 20,220.046
    // Surtax 14,402.046 × 0.20 (2,880.4092) + 12,774.046 × 0.36 (4,598.65656)
    expect(onTax(220000)).toBeCloseTo(27699.11176, 4);
  });

  it("250,000 (13.16% band) → 33,857.99176", () => {
    // 20,875.9905 + 30,000 × 0.1316 (3,948.00) − 655.9445 = 24,168.046
    // Surtax 18,350.046 × 0.20 (3,670.0092) + 16,722.046 × 0.36 (6,019.93656)
    expect(onTax(250000)).toBeCloseTo(33857.99176, 4);
  });

  it("first surtax threshold: basic tax 5,818 at income 94,901.37…", () => {
    // Basic = 5,818 ⇔ gross 6,473.9445 ⇔ 53,891 + 3,752.449 / 0.0915
    const t1 = 53891 + 3752.449 / 0.0915; // 94,901.3716…
    expect(onTax(t1)).toBeCloseTo(5818, 6); // surtax exactly nil
    // +1,000: 91.50 basic × 1.20 = 109.80
    expect(onTax(t1 + 1000)).toBeCloseTo(5927.8, 6);
  });

  it("second surtax threshold: basic tax 7,446 at income 111,809.62…", () => {
    // Basic = 7,446 ⇔ gross 8,101.9445 ⇔ 107,785 + 449.148 / 0.1116
    const t2 = 107785 + 449.148 / 0.1116; // 111,809.6237…
    // 7,446 + (7,446 − 5,818) × 0.20 (325.60) = 7,771.60
    expect(onTax(t2)).toBeCloseTo(7771.6, 6);
    // +1,000: 111.60 basic × (1 + 0.20 + 0.36) = 174.096
    expect(onTax(t2 + 1000)).toBeCloseTo(7945.696, 6);
  });
});

describe("Ontario 2026 — age amount and pension credit (hand-derived) [O1]", () => {
  // Age amount 6,342 reduced by 15% of net income over 47,210; nil at
  // 47,210 + 6,342 / 0.15 = 89,490 (matches TD1ON).

  it("40,000, age 65 → full age amount, 1,043.7845", () => {
    // 40,000 × 0.0505 = 2,020.00 − (12,989 + 6,342) × 0.0505 (976.2155)
    expect(onTax(40000, 65)).toBeCloseTo(1043.7845, 4);
  });

  it("70,000, age 65 → partial age amount 2,923.50, tax 3,391.88775", () => {
    // Reduction 0.15 × 22,790 = 3,418.50 → age amount 2,923.50
    // Gross 2,721.4955 + 16,109 × 0.0915 (1,473.9735) = 4,195.469
    // Credits (12,989 + 2,923.50) × 0.0505 = 803.58125
    expect(onTax(70000, 65)).toBeCloseTo(3391.88775, 4);
  });

  it("89,490, age 65 → age amount fully eliminated, 5,322.8595", () => {
    // 2,721.4955 + 35,599 × 0.0915 (3,257.3085) − 655.9445; below 5,818
    expect(onTax(89490, 65)).toBeCloseTo(5322.8595, 4);
    expect(onTax(89490, 65)).toBeCloseTo(onTax(89490, 64), 9);
  });

  it("pension credit base is the lesser of $1,796 and the pension", () => {
    // 1,043.7845 − 1,000 × 0.0505 (50.50)
    expect(onTax(40000, 65, 1000)).toBeCloseTo(993.2845, 4);
    // 1,043.7845 − 1,796 × 0.0505 (90.698)
    expect(onTax(40000, 65, 3000)).toBeCloseTo(953.0865, 4);
  });
});
