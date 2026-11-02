import { describe, it, expect } from "vitest";
import { computeTax } from "./tax";
import { TAX_2026 } from "./taxYears";
import type { TaxYear } from "./taxYears";

/**
 * Independent benchmark: 2026 federal personal income tax, ordinary income
 * only, age under 65, no credits beyond the basic personal amount.
 *
 * Expected values are written out by hand from the published 2026 CRA schedule
 * (14% to 58,523; 20.5% to 117,045; 26% to 181,440; 29% to 258,482; 33% above;
 * BPA 16,452 phasing to 14,829 between 181,440 and 258,482 — CRA T4127 /
 * T4032, 2026) and do NOT call `bracketTax` or read engine constants. The
 * provincial layer is zeroed (single 0% bracket, no credits) to isolate the
 * federal result. This checks arithmetic wiring only; it is not independent
 * proof of financial accuracy and must still be reviewed by a second party.
 */
const noProvince: TaxYear = {
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

const fedTax = (income: number) =>
  computeTax(
    { ordinary: income, eligDiv: 0, capGainsTaxable: 0, oasReceived: 0, age: 45 },
    { provinceKey: "ON", fedBPA: 16452, provBPA: 0, oasThresh: 95323, lifRate: 0 },
    noProvince,
  ).tax;

describe("federal 2026 benchmark (hand-derived)", () => {
  it("50,000 → 4,696.72", () => {
    // 50,000 × 14% = 7,000.00; BPA credit 16,452 × 14% = 2,303.28
    expect(fedTax(50000)).toBeCloseTo(4696.72, 2);
  });

  it("100,000 → 14,392.725", () => {
    // 58,523 × 14% = 8,193.22; 41,477 × 20.5% = 8,502.785; less 2,303.28
    expect(fedTax(100000)).toBeCloseTo(14392.725, 2);
  });

  it("181,440 (BPA phase-down starts) → 34,629.65", () => {
    // 8,193.22 + 58,522 × 20.5% (11,997.01) + 64,395 × 26% (16,742.70)
    // = 36,932.93; less 2,303.28 = 34,629.65
    expect(fedTax(181440)).toBeCloseTo(34629.65, 2);
  });

  it("300,000 (BPA at floor 14,829) → 70,899.99", () => {
    // to 258,482: 36,932.93 + 77,042 × 29% (22,342.18) = 59,275.11
    // above: 41,518 × 33% = 13,700.94 → 72,976.05; less 14,829 × 14% (2,076.06)
    expect(fedTax(300000)).toBeCloseTo(70899.99, 2);
  });
});
