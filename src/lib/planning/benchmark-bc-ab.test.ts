import { describe, it, expect } from "vitest";
import { computeTax } from "./tax";
import { TAX_2026 } from "./taxYears";
import type { TaxYear } from "./taxYears";

/**
 * Independent benchmark: 2026 British Columbia and Alberta provincial tax,
 * ordinary income only, age under 65.
 *
 * Expected values are worked out by hand from the published 2026 schedules
 * (BC: 5.6% to 50,363; 7.7% to 100,728; 10.5% to 115,648; 12.29% to 140,430;
 * BPA 13,216. AB: 8% to 61,200; 10% to 154,259; 12% to 185,111; 13% to
 * 246,813; BPA 22,769) and do NOT call `bracketTax` or read engine constants.
 * The federal layer is zeroed to isolate the provincial result. This checks
 * arithmetic wiring only; it is not independent proof of financial accuracy
 * and the schedule figures must still be confirmed by a second party against
 * primary sources.
 */
const noFederal: TaxYear = {
  ...TAX_2026,
  federal: [{ up: Infinity, rate: 0 }],
  fedPenAmt: 0,
  fedAgeAmt: 0,
  fedDivCredit: 0,
};

const provTax = (provinceKey: "BC" | "AB", provBPA: number, income: number) =>
  computeTax(
    { ordinary: income, eligDiv: 0, capGainsTaxable: 0, oasReceived: 0, age: 45 },
    { provinceKey, fedBPA: 0, provBPA, oasThresh: 95323, lifRate: 0 },
    noFederal,
  ).tax;

describe("British Columbia 2026 benchmark (hand-derived)", () => {
  it("60,000 → 2,822.281", () => {
    // 50,363 × 5.6% = 2,820.328; 9,637 × 7.7% = 742.049 → 3,562.377
    // less 13,216 × 5.6% (740.096)
    expect(provTax("BC", 13216, 60000)).toBeCloseTo(2822.281, 2);
  });

  it("120,000 → 8,059.7978 (fourth bracket)", () => {
    // 2,820.328 + 50,365 × 7.7% (3,878.105) + 14,920 × 10.5% (1,566.6)
    // + 4,352 × 12.29% (534.8608) = 8,799.8938; less 740.096
    expect(provTax("BC", 13216, 120000)).toBeCloseTo(8059.7978, 2);
  });
});

describe("Alberta 2026 benchmark (hand-derived)", () => {
  it("20,000 → 0 (credit exceeds tax)", () => {
    // 20,000 × 8% = 1,600 < 22,769 × 8% (1,821.52)
    expect(provTax("AB", 22769, 20000)).toBe(0);
  });

  it("100,000 → 6,954.48", () => {
    // 61,200 × 8% = 4,896; 38,800 × 10% = 3,880 → 8,776; less 1,821.52
    expect(provTax("AB", 22769, 100000)).toBeCloseTo(6954.48, 2);
  });

  it("200,000 → 18,018.19 (fourth bracket)", () => {
    // 4,896 + 93,059 × 10% (9,305.9) + 30,852 × 12% (3,702.24)
    // + 14,889 × 13% (1,935.57) = 19,839.71; less 1,821.52
    expect(provTax("AB", 22769, 200000)).toBeCloseTo(18018.19, 2);
  });
});
