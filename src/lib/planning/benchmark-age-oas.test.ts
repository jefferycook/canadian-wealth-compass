import { describe, it, expect } from "vitest";
import { computeTax } from "./tax";
import { TAX_2026 } from "./taxYears";
import type { TaxYear } from "./taxYears";

/**
 * Independent benchmark: 2026 federal age amount and OAS recovery tax.
 *
 * Expected values are worked out by hand from the published 2026 federal
 * figures (14% to 58,523; 20.5% to 117,045; BPA 16,452; age amount 9,208
 * reduced by 15% of net income above 46,432; OAS recovery 15% of net income
 * above 95,323, capped at the OAS received) and do NOT call `bracketTax` or
 * read engine constants. The provincial layer is zeroed to isolate the
 * federal result. This checks arithmetic wiring only; it is not independent
 * proof of financial accuracy and the figures must still be confirmed by a
 * second party against primary sources.
 */
const zeroProv = {
  ...TAX_2026.provinces["ON"]!,
  brackets: [{ up: Infinity, rate: 0 }],
  surtax: [],
  healthPremium: false,
  bpa: 0,
  ageAmt: 0,
  penAmt: 0,
  divCredit: 0,
};
const fedOnly: TaxYear = { ...TAX_2026, provinces: { ON: zeroProv } };

const run = (income: number, age: number, oasReceived = 0) =>
  computeTax(
    { ordinary: income, eligDiv: 0, capGainsTaxable: 0, oasReceived, age },
    { provinceKey: "ON", fedBPA: 16452, provBPA: 0, oasThresh: 95323, lifRate: 0 },
    fedOnly,
  );

describe("Federal age amount 2026 benchmark (hand-derived)", () => {
  it("age 70, 40,000 → 2,007.60 (full age amount)", () => {
    // 40,000 × 14% = 5,600; credits (16,452 + 9,208) × 14% = 3,592.40
    expect(run(40000, 70).tax).toBeCloseTo(2007.6, 2);
  });

  it("age 70, 60,000 → 5,188.533 (age amount partly reduced)", () => {
    // 58,523 × 14% = 8,193.22; 1,477 × 20.5% = 302.785 → 8,496.005
    // age amt 9,208 − 15% × 13,568 (2,035.2) = 7,172.8
    // credits (16,452 + 7,172.8) × 14% = 3,307.472
    expect(run(60000, 70).tax).toBeCloseTo(5188.533, 2);
  });

  it("age 70, 100,000 → 14,228.533 (age amount mostly eliminated)", () => {
    // 8,193.22 + 41,477 × 20.5% (8,502.785) = 16,696.005
    // age amt 9,208 − 15% × 53,568 (8,035.2) = 1,172.8
    // credits (16,452 + 1,172.8) × 14% = 2,467.472
    expect(run(100000, 70).tax).toBeCloseTo(14228.533, 2);
  });

  it("age 64, 60,000 → 6,192.725 (no age amount under 65)", () => {
    // 8,496.005 − 16,452 × 14% (2,303.28)
    expect(run(60000, 64).tax).toBeCloseTo(6192.725, 2);
  });
});

describe("OAS recovery tax 2026 benchmark (hand-derived)", () => {
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
