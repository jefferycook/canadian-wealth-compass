/**
 * Hand-keyed RRIF minimum-withdrawal factor benchmarks (CWC-T-04, #93).
 *
 * Ported from the stale draft PRs #35 / #51 (`benchmark-rrif-min.test.ts`)
 * onto current main and extended to cover every entry of the 25-row
 * prescribed-factor table (ages 71 to 95-or-older), a spread of under-71
 * formula ages, and the 70 -> 71 and 94 -> 95+ boundaries.
 *
 * SCOPE — TABLE VALUES ONLY. These tests pin the factor returned for a given
 * integer age key. They deliberately do NOT test which age the engine feeds
 * in (age attained at the beginning of the year vs. during the year). That
 * age-basis question is LIF-2 (CWC-T-14) and is out of scope here.
 *
 * Every expected value is a literal percentage keyed by hand from the sources
 * below (factor × 100). No expected value reads `RRIF_MIN` or any other engine
 * constant, and none was copied from engine output.
 *
 * Sources (retrieved 2026-11-25):
 *  [R1] Income Tax Regulations, C.R.C., c. 945, s. 7308(4) (Justice Laws,
 *       laws-lois.justice.gc.ca/eng/regulations/C.R.C.,_c._945/section-7308):
 *       prescribed factor by age in whole years "Y" attained at the beginning
 *       of the year — under 71: 1/(90 – Y); 71: 0.0528; 72: 0.0540;
 *       73: 0.0553; 74: 0.0567; 75: 0.0582; 76: 0.0598; 77: 0.0617;
 *       78: 0.0636; 79: 0.0658; 80: 0.0682; 81: 0.0708; 82: 0.0738;
 *       83: 0.0771; 84: 0.0808; 85: 0.0851; 86: 0.0899; 87: 0.0955;
 *       88: 0.1021; 89: 0.1099; 90: 0.1192; 91: 0.1306; 92: 0.1449;
 *       93: 0.1634; 94: 0.1879; 95 or older: 0.2000.
 *  [R2] CRA, "Chart – Prescribed factors" (T4RSP/T4RIF guide pages, date
 *       modified 2025-10-01), "All other RRIFs" column: identical values to
 *       [R1] for 71 through 95-or-older; "If the age is 70 years or younger,
 *       the prescribed factor is calculated as follows: 1 divided by
 *       (90 minus the age)."
 *
 * Not modelled / not tested: the "Qualifying RRIFs" column (pre-1993 funds,
 * s. 7308(3)), which differs from [R1] only at age 71 (0.0526 vs 0.0528).
 * The engine models the general ("All other RRIFs") table only.
 *
 * Passing tests confirm the engine matches these hand-keyed values; they are
 * not by themselves a statutory review of how the factor is applied.
 */
import { describe, it, expect } from "vitest";
import { rrifMinFactor } from "./registered";

/** [R1]/[R2] table, hand-keyed as percentages (factor × 100). 25 rows. */
const TABLE: ReadonlyArray<readonly [age: number, pct: number]> = [
  [71, 5.28],
  [72, 5.4],
  [73, 5.53],
  [74, 5.67],
  [75, 5.82],
  [76, 5.98],
  [77, 6.17],
  [78, 6.36],
  [79, 6.58],
  [80, 6.82],
  [81, 7.08],
  [82, 7.38],
  [83, 7.71],
  [84, 8.08],
  [85, 8.51],
  [86, 8.99],
  [87, 9.55],
  [88, 10.21],
  [89, 10.99],
  [90, 11.92],
  [91, 13.06],
  [92, 14.49],
  [93, 16.34],
  [94, 18.79],
  [95, 20.0], // "95 or older"
];

/** Under-71 formula 1/(90 – age), worked by hand as percentages. */
const UNDER_71: ReadonlyArray<readonly [age: number, pct: number]> = [
  [50, 2.5], // 100 / 40
  [55, 2.857142857142857], // 100 / 35
  [60, 3.333333333333333], // 100 / 30
  [64, 3.846153846153846], // 100 / 26
  [65, 4.0], // 100 / 25
  [69, 4.761904761904762], // 100 / 21
  [70, 5.0], // 100 / 20
];

describe("RRIF minimum factor — 25-entry prescribed table [R1][R2]", () => {
  it("the hand-keyed table has exactly 25 consecutive rows, 71 through 95", () => {
    expect(TABLE).toHaveLength(25);
    TABLE.forEach(([age], i) => expect(age).toBe(71 + i));
  });

  it.each(TABLE)("age %i -> %f%%", (age, pct) => {
    expect(rrifMinFactor(age)).toBeCloseTo(pct, 10);
  });
});

describe("RRIF minimum factor — under-71 formula 1/(90 – age) [R1][R2]", () => {
  it.each(UNDER_71)("age %i -> %f%%", (age, pct) => {
    expect(rrifMinFactor(age)).toBeCloseTo(pct, 10);
  });
});

describe("RRIF minimum factor — boundaries", () => {
  it("age 70 is the last formula age (5.00%) and 71 the first table age (5.28%)", () => {
    expect(rrifMinFactor(70)).toBeCloseTo(5.0, 10);
    expect(rrifMinFactor(71)).toBeCloseTo(5.28, 10);
  });

  it("age 94 is the last graduated row (18.79%) and 95 hits the 20% cap", () => {
    expect(rrifMinFactor(94)).toBeCloseTo(18.79, 10);
    expect(rrifMinFactor(95)).toBeCloseTo(20.0, 10);
  });

  it.each([96, 99, 100, 105, 110, 120])("age %i ('95 or older') -> 20%%", (age) => {
    expect(rrifMinFactor(age)).toBeCloseTo(20.0, 10);
  });

  it("is non-decreasing from age 50 through 120", () => {
    for (let a = 50; a < 120; a++) {
      expect(rrifMinFactor(a + 1)).toBeGreaterThanOrEqual(rrifMinFactor(a));
    }
  });
});
