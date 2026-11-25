/**
 * Federal age amount and OAS recovery tax boundary tests (CWC-T-03, #92).
 *
 * Ported from the stale draft PRs #33 / #50 (`benchmark-age-oas.test.ts`)
 * onto current main and extended to pin the phase-out and recovery
 * boundaries: the age amount's start, last-dollar and zero points, the
 * 64 → 65 transition, the absence of any extra age amount at 75+, the OAS
 * recovery start at the threshold, and full-recovery behaviour for the 65-74
 * and 75+ benefit levels — with the recovery capped at the OAS actually
 * received. The full-recovery income is a DERIVED bound
 * (threshold + OAS received / 0.15); no fixed upper-bound constant is used.
 *
 * Every expected value is a literal worked out by hand (arithmetic in the
 * comment beside it). No expected value calls `bracketTax`, reads an engine
 * constant, or is copied from engine output. The engine is driven with the
 * published 2026 table (`TAX_2026`) for the federal brackets only; the
 * Ontario layer is replaced by a zero-rate, zero-credit stand-in so the
 * federal result and the recovery tax are measured in isolation.
 *
 * Sources (retrieved 2026-11-25):
 *  [A1] CRA, "Adjustment of personal income tax and benefit amounts" (2026
 *       column): age amount $9,208; net income threshold for the age amount
 *       $46,432; OAS repayment (recovery tax) threshold $95,323; indexation
 *       2.0%.
 *  [A2] Income Tax Act s.118(2): the age amount is reduced by 15% of net
 *       income over the threshold (never below nil). One amount applies from
 *       age 65; the Act has no separate or enhanced amount at 75+.
 *  [A3] CRA "Tax rates and income brackets for individuals – current year"
 *       (2026): 14% to $58,523; 20.5% to $117,045. Federal BPA $16,452 at
 *       net income ≤ $181,440 (all incomes here are below the BPA phase-out).
 *  [R1] Income Tax Act s.180.2: recovery tax is 15% of net income over the
 *       threshold, not exceeding the OAS benefits received in the year.
 *  [R2] Canada.ca, "OAS pension recovery tax" (income-year table): income
 *       year 2026 → minimum threshold $95,323; maximum threshold $155,320
 *       (65-74) and $161,320 (75+). Canada.ca marks the 2026 maxima as
 *       estimates until the October-December quarter is final, so they are
 *       used ONLY to back out a plausible annual OAS received:
 *         65-74: (155,320 − 95,323) × 0.15 = 59,997 × 0.15 = 8,999.55
 *         75+  : (161,320 − 95,323) × 0.15 = 65,997 × 0.15 = 9,899.55
 *       (9,899.55 / 8,999.55 = 1.1000, consistent with the 10% increase at
 *       75 under OAS Act s.7(1.1)). Nothing below depends on these maxima
 *       being final; the recovery bound is re-derived from the OAS received.
 *  [R3] Canada.ca "OAS payment amounts" (October-December 2026): maximum
 *       $762.50/mo (65-74) and $838.75/mo (75+). Shown for context only.
 *
 * Overlap statement:
 *  - PR #110 (CWC-T-01, merged to main 2026-11-25) pins the federal age amount at
 *    40,000 / 46,432 / 80,000 / 107,819 / 110,000. This file does not repeat
 *    those points except the 40,000 / age-70 case ported verbatim from #50;
 *    it adds threshold+1, the last-cent (107,818) and exact-zero points, the
 *    phase-out slope, the 64 → 65 transition and the 75+ equality.
 *  - engine.test.ts already checks OAS recovery at threshold ± a few thousand
 *    and a full-recovery bound derived from the engine's own `oasMax65` /
 *    `oasMax75` constants. This file uses no engine constants, pins the
 *    one-dollar start boundary, derives the two bounds from published
 *    figures, and adds partial-OAS, zero-OAS, age-independence and
 *    net-income (RRSP deduction) cases.
 *  - PRs #33 / #50 are superseded by this file; their seven cases are all
 *    carried over below (marked "ported from #50").
 *
 * Scope note: these tests check that the engine reproduces the published
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

const inc = (
  ordinary: number,
  age: number,
  oasReceived = 0,
  rrspDeduction = 0,
): IncomeComponents => ({
  ordinary,
  eligDiv: 0,
  capGainsTaxable: 0,
  oasReceived,
  age,
  rrspDeduction,
});

/** Run the engine with published 2026 federal inputs [A1][A3]. */
const run = (income: number, age: number, oasReceived = 0, rrspDeduction = 0) =>
  computeTax(
    inc(income, age, oasReceived, rrspDeduction),
    { provinceKey: "ON", fedBPA: 16452, provBPA: 0, oasThresh: 95323, lifRate: 0 },
    FED_ONLY,
  );

/** Hand-entered published inputs (not read from the engine). */
const OAS_THRESHOLD = 95323; // [A1]
const AGE_AMOUNT = 9208; // [A1]
const AGE_THRESHOLD = 46432; // [A1]
const OAS_RECEIVED_65_74 = 8999.55; // backed out of [R2]
const OAS_RECEIVED_75_PLUS = 9899.55; // backed out of [R2]

/** Derived full-recovery income: threshold + OAS received / 15% [R1]. */
const fullRecoveryIncome = (oasReceived: number) => OAS_THRESHOLD + oasReceived / 0.15;

describe("federal age amount — ported from #50 [A1][A2][A3]", () => {
  it("age 70, 40,000 → 2,007.60 (full age amount)", () => {
    // 40,000 × 14% = 5,600; credits (16,452 + 9,208) × 14% = 3,592.40
    expect(run(40000, 70).tax).toBeCloseTo(2007.6, 2);
  });

  it("age 70, 60,000 → 5,188.533 (age amount partly reduced)", () => {
    // 58,523 × 14% = 8,193.22; 1,477 × 20.5% = 302.785 → 8,496.005
    // age amt 9,208 − 15% × 13,568 (2,035.20) = 7,172.80
    // credits (16,452 + 7,172.80) × 14% = 3,307.472
    expect(run(60000, 70).tax).toBeCloseTo(5188.533, 3);
  });

  it("age 70, 100,000 → 14,228.533 (age amount mostly eliminated)", () => {
    // 8,193.22 + 41,477 × 20.5% (8,502.785) = 16,696.005
    // age amt 9,208 − 15% × 53,568 (8,035.20) = 1,172.80
    // credits (16,452 + 1,172.80) × 14% = 2,467.472
    expect(run(100000, 70).tax).toBeCloseTo(14228.533, 3);
  });

  it("age 64, 60,000 → 6,192.725 (no age amount under 65)", () => {
    // 8,496.005 − 16,452 × 14% (2,303.28)
    expect(run(60000, 64).tax).toBeCloseTo(6192.725, 3);
  });
});

describe("federal age amount — phase-out boundaries [A1][A2][A3]", () => {
  it("one dollar over the threshold: 46,433 → 2,908.241", () => {
    // age amt 9,208 − 0.15 × 1 = 9,207.85
    // gross 46,433 × 0.14 = 6,500.62
    // credits (16,452 + 9,207.85) × 0.14 = 25,659.85 × 0.14 = 3,592.379
    expect(run(46433, 65).tax).toBeCloseTo(2908.241, 3);
  });

  it("last whole dollar with a positive amount: 107,818 → 15,995.401", () => {
    // age amt 9,208 − 0.15 × 61,386 (9,207.90) = 0.10 → credit 0.014
    // gross 8,193.22 + 49,295 × 0.205 (10,105.475) = 18,298.695
    // 18,298.695 − 2,303.28 − 0.014
    expect(run(107818, 65).tax).toBeCloseTo(15995.401, 3);
    // Exactly 0.014 more credit than at age 64.
    expect(run(107818, 64).tax - run(107818, 65).tax).toBeCloseTo(0.014, 6);
  });

  it("derived zero point 46,432 + 9,208 / 0.15 = 107,818.67: no residual amount", () => {
    const zero = AGE_THRESHOLD + AGE_AMOUNT / 0.15; // 107,818.666…
    expect(run(zero, 65).tax).toBeCloseTo(run(zero, 64).tax, 9);
    // And never negative beyond it: 120,000 at 65 equals 120,000 at 64.
    expect(run(120000, 65).tax).toBeCloseTo(run(120000, 64).tax, 9);
  });

  it("phase-out slope: +1,000 inside the 20.5% band costs 226.00 at 65, 205.00 at 64", () => {
    // 1,000 × 0.205 = 205.00 bracket tax; plus lost credit 1,000 × 0.15 × 0.14 = 21.00
    expect(run(61000, 65).tax - run(60000, 65).tax).toBeCloseTo(226, 6);
    expect(run(61000, 64).tax - run(60000, 64).tax).toBeCloseTo(205, 6);
  });

  it("64 → 65 transition at 50,000: credit worth 1,214.192", () => {
    // age amt 9,208 − 0.15 × 3,568 (535.20) = 8,672.80 → × 0.14 = 1,214.192
    // age 64: 50,000 × 0.14 (7,000.00) − 2,303.28 = 4,696.72
    // age 65: 4,696.72 − 1,214.192 = 3,482.528
    expect(run(50000, 64).tax).toBeCloseTo(4696.72, 3);
    expect(run(50000, 65).tax).toBeCloseTo(3482.528, 3);
  });

  it("no enhanced age amount at 75+: ages 75 and 90 match age 65 [A2]", () => {
    // Same 5,188.533 as age 70 at 60,000 above.
    expect(run(60000, 75).tax).toBeCloseTo(5188.533, 3);
    expect(run(60000, 90).tax).toBeCloseTo(5188.533, 3);
  });
});

describe("OAS recovery tax — ported from #50 [A1][R1]", () => {
  // #50 used a hypothetical 9,023.64 OAS received; kept as-is.
  it("net income 90,000 → 0 (below threshold)", () => {
    expect(run(90000, 70, 9023.64).oasClawback).toBe(0);
  });

  it("net income 120,000 → 3,701.55 (partial recovery)", () => {
    // 15% × (120,000 − 95,323 = 24,677)
    expect(run(120000, 70, 9023.64).oasClawback).toBeCloseTo(3701.55, 2);
  });

  it("net income 160,000 → 9,023.64 (capped at OAS received)", () => {
    // 15% × 64,677 = 9,701.55 > 9,023.64
    expect(run(160000, 70, 9023.64).oasClawback).toBeCloseTo(9023.64, 2);
  });
});

describe("OAS recovery tax — start boundary [A1][R1]", () => {
  it("exactly at the threshold 95,323 → 0", () => {
    expect(run(95323, 70, OAS_RECEIVED_65_74).oasClawback).toBe(0);
  });

  it("one dollar over: 95,324 → 0.15", () => {
    expect(run(95324, 70, OAS_RECEIVED_65_74).oasClawback).toBeCloseTo(0.15, 9);
  });

  it("100 dollars over: 95,423 → 15.00, added in full to total tax", () => {
    const withOas = run(95423, 70, OAS_RECEIVED_65_74);
    expect(withOas.oasClawback).toBeCloseTo(15, 9);
    expect(withOas.tax - run(95423, 70, 0).tax).toBeCloseTo(15, 9);
  });

  it("is measured on net income: 130,000 less a 10,000 RRSP deduction → 3,701.55", () => {
    // Net income 120,000: 15% × 24,677
    expect(run(130000, 70, OAS_RECEIVED_65_74, 10000).oasClawback).toBeCloseTo(3701.55, 2);
  });
});

describe("OAS recovery tax — full recovery, 65-74 [R1][R2]", () => {
  // OAS received 8,999.55 → bound 95,323 + 8,999.55 / 0.15 = 95,323 + 59,997 = 155,320
  const bound = fullRecoveryIncome(OAS_RECEIVED_65_74);

  it("derived bound equals 155,320", () => {
    expect(bound).toBeCloseTo(155320, 6);
  });

  it("one dollar below the bound keeps 0.15 of OAS: 8,999.40", () => {
    // 0.15 × 59,996 = 8,999.40
    expect(run(155319, 70, OAS_RECEIVED_65_74).oasClawback).toBeCloseTo(8999.4, 6);
  });

  it("at the bound the whole OAS received is recovered: 8,999.55", () => {
    expect(run(155320, 70, OAS_RECEIVED_65_74).oasClawback).toBeCloseTo(8999.55, 6);
  });

  it("above the bound the recovery stays capped at 8,999.55", () => {
    // 0.15 × (300,000 − 95,323) = 30,701.55 uncapped
    expect(run(155321, 70, OAS_RECEIVED_65_74).oasClawback).toBeCloseTo(8999.55, 6);
    expect(run(300000, 70, OAS_RECEIVED_65_74).oasClawback).toBeCloseTo(8999.55, 6);
  });
});

describe("OAS recovery tax — full recovery, 75+ [R1][R2]", () => {
  // OAS received 9,899.55 → bound 95,323 + 9,899.55 / 0.15 = 95,323 + 65,997 = 161,320
  const bound = fullRecoveryIncome(OAS_RECEIVED_75_PLUS);

  it("derived bound equals 161,320, above the 65-74 bound", () => {
    expect(bound).toBeCloseTo(161320, 6);
    expect(bound).toBeGreaterThan(fullRecoveryIncome(OAS_RECEIVED_65_74));
  });

  it("at the 65-74 bound a 75+ recipient still keeps 900.00", () => {
    // 0.15 × 59,997 = 8,999.55; 9,899.55 − 8,999.55 = 900.00
    const r = run(155320, 78, OAS_RECEIVED_75_PLUS);
    expect(r.oasClawback).toBeCloseTo(8999.55, 6);
    expect(OAS_RECEIVED_75_PLUS - r.oasClawback).toBeCloseTo(900, 6);
  });

  it("one dollar below its own bound: 9,899.40", () => {
    // 0.15 × 65,996 = 9,899.40
    expect(run(161319, 78, OAS_RECEIVED_75_PLUS).oasClawback).toBeCloseTo(9899.4, 6);
  });

  it("at and above its bound the recovery is capped at 9,899.55", () => {
    expect(run(161320, 78, OAS_RECEIVED_75_PLUS).oasClawback).toBeCloseTo(9899.55, 6);
    expect(run(250000, 78, OAS_RECEIVED_75_PLUS).oasClawback).toBeCloseTo(9899.55, 6);
  });
});

describe("OAS recovery tax — capped at OAS actually received [R1]", () => {
  it("partial OAS (e.g. part-year or partial residence) 4,500.00 → capped at 4,500.00", () => {
    // Derived bound 95,323 + 4,500 / 0.15 = 125,323
    expect(fullRecoveryIncome(4500)).toBeCloseTo(125323, 6);
    // 0.15 × 30,000 = 4,500.00 at the bound
    expect(run(125323, 70, 4500).oasClawback).toBeCloseTo(4500, 6);
    // 0.15 × 29,999 = 4,499.85 one dollar below
    expect(run(125322, 70, 4500).oasClawback).toBeCloseTo(4499.85, 6);
    // 0.15 × 104,677 = 15,701.55 uncapped → 4,500.00
    expect(run(200000, 70, 4500).oasClawback).toBeCloseTo(4500, 6);
  });

  it("no OAS received → no recovery tax at any income", () => {
    expect(run(200000, 70, 0).oasClawback).toBe(0);
    expect(run(200000, 64, 0).oasClawback).toBe(0);
  });

  it("recovery does not depend on age: same income and OAS received at 70 and 80", () => {
    // 0.15 × (140,000 − 95,323 = 44,677) = 6,701.55
    expect(run(140000, 70, OAS_RECEIVED_75_PLUS).oasClawback).toBeCloseTo(6701.55, 6);
    expect(run(140000, 80, OAS_RECEIVED_75_PLUS).oasClawback).toBeCloseTo(6701.55, 6);
  });
});
