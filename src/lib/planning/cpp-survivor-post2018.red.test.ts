/**
 * CPP survivor entitlement: POST-2018 statutory contract, RED on current engine.
 *
 * Read Justice Laws Canada Pension Plan Act s.44(1)(d)(ii) and s.58(1)(a.1)
 * (2026 consolidation), and OSFI 32nd CPP Actuarial Report A.7.2:
 * https://laws-lois.justice.gc.ca/eng/acts/C-8/section-44.html
 * https://laws-lois.justice.gc.ca/eng/acts/C-8/section-58.html
 * https://www.osfi-bsif.gc.ca/en/oca/actuarial-reports/actuarial-report-32nd-canada-pension-plan-revised-version
 *
 * From January 2019 onward, survivor age under 45 alone does NOT reduce or
 * eliminate the base CPP survivor pension, assuming sufficient contributor
 * eligibility. These are relative invariants, not approved payable amounts.
 *
 * IMPORTANT: it.fails means Vitest expects these assertions to fail against
 * the current legacy engine. This is an executable RED specification, NOT
 * verification that the survivor amount is correct. Converting to ordinary
 * passing tests requires separately reviewed financial-engine changes,
 * current-month applicability and CPP combination verification.
 * No production calculation, golden fixture or VERIFIED flag changes here.
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

describe("CPP survivor entitlement payable after December 2018 — RED statutory contract", () => {
  // A positive baseline is independently verified as a NORMAL test.
  // Otherwise any unrelated baseline error could satisfy it.fails.
  it("has a positive, under-65 reference entitlement with no own CPP", () => {
    expect(survivorAtAge(50)).toBeGreaterThan(0);
  });

  // Each age MUST fail independently against the obsolete production taper.
  // For otherwise identical post-2018 pensions, survivor age alone cannot
  // reintroduce the pre-2019 exclusion or 1/120-per-month reduction.
  it.fails.each([20, 30, 34, 35, 40, 44])(
    "does not exclude or age-reduce a qualifying survivor at age %i",
    (age) => {
      expect(survivorAtAge(age)).toBeCloseTo(survivorAtAge(50), 6);
    },
  );
});
