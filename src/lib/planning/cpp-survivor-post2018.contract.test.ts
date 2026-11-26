/**
 * CPP survivor entitlement: POST-2018 statutory contract (GREEN).
 *
 * Reconciles the RED contract proposed in draft PR #73
 * (`cpp-survivor-post2018.red.test.ts`, head b5e1f71) with the corrected
 * engine. Every #73 assertion is kept unchanged; only the Vitest modifier
 * changes, because the engine now satisfies the contract:
 *
 *  | #73 assertion                                   | #73        | here    |
 *  |-------------------------------------------------|------------|---------|
 *  | positive under-65 baseline at age 50            | it         | it      |
 *  | age 20/30/34 equals age-50 reference            | it.fails   | it      |
 *  |   (s.44(1)(d)(ii): no under-35 exclusion)       |            |         |
 *  | age 35/40/44 equals age-50 reference            | it.fails   | it      |
 *  |   (s.58(1)(a.1): no 1/120 taper under 45)       |            |         |
 *
 * #73's file must NOT also land: against the corrected engine its
 * `it.fails` cases pass, which Vitest reports as failures.
 *
 * Primary sources, Justice Laws Canada Pension Plan Act (consolidation
 * current to 2026-10-19, last amended 2024-12-17):
 * https://laws-lois.justice.gc.ca/eng/acts/C-8/section-44.html
 * https://laws-lois.justice.gc.ca/eng/acts/C-8/section-58.html
 *
 * These are relative invariants, not approved payable amounts. Combined
 * retirement/survivor calculation (s.58(2)), rounding and indexing are out of
 * scope. The pre-2019 historical rule is covered in `benefits.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { cppSurvivorBenefit } from "./benefits";
import { TAX_2026 } from "./taxYears";

const deceasedAge65Pension = 12_000;
const inflationFactor = 1;
const ownRetirementPension = 0;

function survivorAtAge(age: number): number {
  return cppSurvivorBenefit(
    deceasedAge65Pension,
    age,
    ownRetirementPension,
    inflationFactor,
    TAX_2026,
  );
}

describe("CPP survivor entitlement payable after December 2018 — statutory contract", () => {
  it("has a positive, under-65 reference entitlement with no own CPP", () => {
    expect(survivorAtAge(50)).toBeGreaterThan(0);
  });

  it.each([20, 30, 34, 35, 40, 44])(
    "does not exclude or age-reduce a qualifying survivor at age %i",
    (age) => {
      expect(survivorAtAge(age)).toBeCloseTo(survivorAtAge(50), 6);
    },
  );
});
