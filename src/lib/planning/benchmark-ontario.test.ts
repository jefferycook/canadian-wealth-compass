import { describe, it, expect } from "vitest";
import { computeTax } from "./tax";
import { TAX_2026 } from "./taxYears";
import type { TaxYear } from "./taxYears";

/**
 * Independent benchmark: 2026 Ontario provincial tax (brackets, basic personal
 * credit, surtax, Ontario Health Premium), ordinary income only, age under 65.
 *
 * Expected values are worked out by hand from the published 2026 Ontario
 * schedule (5.05% to 53,891; 9.15% to 107,785; 11.16% to 150,000; 12.16% to
 * 220,000; 13.16% above; BPA 12,989; surtax 20% of tax over 5,818 plus 36% of
 * tax over 7,446; Health Premium per the Ontario schedule) and do NOT call
 * `bracketTax` or read engine constants. The federal layer is zeroed (single
 * 0% bracket, zero BPA) to isolate the provincial result. This checks
 * arithmetic wiring only; it is not independent proof of financial accuracy
 * and must still be reviewed by a second party against primary sources.
 */
const noFederal: TaxYear = {
  ...TAX_2026,
  federal: [{ up: Infinity, rate: 0 }],
  fedPenAmt: 0,
  fedAgeAmt: 0,
  fedDivCredit: 0,
};

const onTax = (income: number) =>
  computeTax(
    { ordinary: income, eligDiv: 0, capGainsTaxable: 0, oasReceived: 0, age: 45 },
    { provinceKey: "ON", fedBPA: 0, provBPA: 12989, oasThresh: 95323, lifRate: 0 },
    noFederal,
  ).tax;

describe("Ontario 2026 benchmark (hand-derived)", () => {
  it("50,000 → 2,469.0555 (no surtax; OHP 600)", () => {
    // 50,000 × 5.05% = 2,525.00; less 12,989 × 5.05% (655.9445) = 1,869.0555
    // OHP: 48,000-72,000 band caps at 600
    expect(onTax(50000)).toBeCloseTo(2469.0555, 2);
  });

  it("100,000 → 7,127.8294 (first surtax tier; OHP 750)", () => {
    // 53,891 × 5.05% = 2,721.4955; 46,109 × 9.15% = 4,218.9735 → 6,940.469
    // less 655.9445 = 6,284.5245; surtax (6,284.5245 − 5,818) × 20% = 93.3049
    expect(onTax(100000)).toBeCloseTo(7127.8294, 2);
  });

  it("150,000 → 15,170.3918 (both surtax tiers; OHP 750)", () => {
    // 2,721.4955 + 53,894 × 9.15% (4,931.301) + 42,215 × 11.16% (4,711.194)
    // = 12,363.9905; less 655.9445 = 11,708.046
    // surtax 5,890.046 × 20% (1,178.0092) + 4,262.046 × 36% (1,534.3366)
    expect(onTax(150000)).toBeCloseTo(15170.39176, 2);
  });
});
