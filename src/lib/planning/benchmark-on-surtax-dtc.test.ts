/**
 * Issue #79 — Ontario surtax is computed BEFORE the Ontario dividend tax
 * credit. DRAFT fixtures: the statutory reading below has not had independent
 * review or owner approval.
 *
 * Statutory basis (Taxation Act, 2007, S.O. 2007, c. 11, Sched. A, e-Laws
 * consolidation from July 1, 2026):
 *  - s. 5(1): para. 4 deducts subdivision d credits, para. 5 adds the surtax
 *    (subdivision e), and para. 6 then deducts the subdivision g credit.
 *  - s. 16(2): the surtax "gross tax amount" is basic tax less subdivision b
 *    non-refundable credits, plus subdivision c additional tax, less
 *    subdivision d credits. It does not include subdivision g.
 *  - s. 19.1 (subdivision g): the Ontario dividend tax credit for taxation
 *    years ending after December 31, 2015.
 *  - CRA Form ON428 (5006-C) 2025: the surtax is computed on line 65 at lines
 *    66-68, and the dividend tax credit is subtracted at line 70.
 *
 * Every expected value is hand-derived. None is read back from the engine.
 * Inputs come from CRA T4032ON "Effective January 1, 2026" (Chart 2 brackets,
 * BPA $12,989, surtax thresholds $5,818 / $7,446) and the ON428 2025 health
 * premium chart. The dividend credit is 10% of the grossed-up eligible
 * dividend, per Ontario.ca and the ON428 worksheet. The statutory form
 * (36.3158% of the 38% gross-up) differs by at most $0.0012 at these inputs.
 *
 * Isolation: federal tax is zeroed with a single 0% bracket and a zero federal
 * dividend credit, so `tax` = Ontario tax + Ontario Health Premium. The age is
 * 40 and there is no pension or OAS income.
 * Reproducible arithmetic: Python Decimal, documented in the PR body.
 */

import { describe, expect, it } from "vitest";

import { computeTax } from "./tax";
import { getTaxYear } from "./taxYears";
import type { TaxYear } from "./taxYears";
import type { IncomeComponents, TaxSettings } from "./types";

const BASE = getTaxYear(2026);
const ON_ONLY: TaxYear = {
  ...BASE,
  federal: [{ up: Infinity, rate: 0 }],
  fedDivCredit: 0,
};

const SETTINGS: TaxSettings = {
  provinceKey: "ON",
  fedBPA: 16452,
  provBPA: 12989,
  oasThresh: 95323,
  lifRate: 6,
};

const person = (ordinary: number, eligDiv: number): IncomeComponents => ({
  ordinary,
  eligDiv,
  capGainsTaxable: 0,
  oasReceived: 0,
  age: 40,
});

describe("Issue #79 — Ontario surtax before dividend tax credit (DRAFT)", () => {
  it("ONSD-1: the floor holds when the dividend credit exceeds tax (unchanged)", () => {
    // X = 69,000; T = 3,448.0245; DTC 6,900 → Ontario tax 0; OHP 600.
    expect(computeTax(person(0, 50000), SETTINGS, ON_ONLY).tax).toBeCloseTo(600, 6);
  });

  it("ONSD-2: pre-credit tax below the $5,818 threshold, no surtax (unchanged)", () => {
    // X = 87,600; T = 5,149.9245; DTC 2,760; OHP 750.
    expect(computeTax(person(60000, 20000), SETTINGS, ON_ONLY).tax).toBeCloseTo(3139.9245, 6);
  });

  it("ONSD-3: tier-1 surtax that the credit-first order would erase", () => {
    // X = 97,600; T = 6,064.9245; surtax 20% × 246.9245 = 49.3849;
    // 6,064.9245 + 49.3849 − 2,760 = 3,354.3094; OHP 750.
    // The credit-first order would give 3,304.9245 + 750 = 4,054.9245.
    expect(computeTax(person(70000, 20000), SETTINGS, ON_ONLY).tax).toBeCloseTo(4104.3094, 6);
  });

  it("ONSD-4: both surtax tiers measured on the pre-credit amount", () => {
    // X = 141,400; T = 10,748.286; surtax 986.0572 + 1,188.82296 = 2,174.88016;
    // DTC 4,140 → 8,783.16616; OHP 750.
    // The credit-first order would give 7,516.3432.
    expect(computeTax(person(100000, 30000), SETTINGS, ON_ONLY).tax).toBeCloseTo(9533.16616, 6);
  });

  it("ONSD-5: no dividends, so the surtax path is unchanged", () => {
    // X = 120,000; T = 8,360.046; surtax 508.4092 + 329.05656; OHP 750.
    expect(computeTax(person(120000, 0), SETTINGS, ON_ONLY).tax).toBeCloseTo(9947.51176, 6);
  });

  it("ONSD-6: provinces without a surtax table are not affected by the order", () => {
    // A wiring check, not a value benchmark. With an empty surtax table, the
    // provincial result must equal the bracket tax less credits less the
    // dividend credit, floored at zero, whichever order is used.
    for (const key of ["BC", "AB"] as const) {
      const prov = ON_ONLY.provinces[key]!;
      expect(prov.surtax).toEqual([]);
      const inc = person(100000, 30000);
      const x = inc.ordinary + inc.eligDiv * ON_ONLY.divGrossUp;
      let basic = 0;
      let lo = 0;
      for (const b of prov.brackets) {
        if (x <= lo) break;
        basic += (Math.min(x, b.up) - lo) * b.rate;
        lo = b.up;
      }
      const credit = prov.bpa * prov.brackets[0]!.rate;
      const expected = Math.max(
        0,
        Math.max(0, basic - credit) - inc.eligDiv * ON_ONLY.divGrossUp * prov.divCredit,
      );
      const got = computeTax(
        inc,
        { ...SETTINGS, provinceKey: key, provBPA: prov.bpa },
        ON_ONLY,
      ).tax;
      expect(got).toBeCloseTo(expected, 6);
    }
  });
});
