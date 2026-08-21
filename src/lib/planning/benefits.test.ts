import { describe, it, expect } from "vitest";
import { cppFactor, oasFactor, cppSurvivorBenefit } from "./benefits";
import { TAX_2026 } from "./taxYears";

const TY = TAX_2026;

describe("cppFactor — statutory early/late adjustment", () => {
  it("returns the statutory 36% reduction at 60 and 42% increase at 70", () => {
    expect(cppFactor(60)).toBeCloseTo(0.64, 10);
    expect(cppFactor(70)).toBeCloseTo(1.42, 10);
    expect(cppFactor(65)).toBe(1);
  });

  it("uses 0.6%/month below 65 and 0.7%/month above", () => {
    expect(cppFactor(64)).toBeCloseTo(1 - 12 * 0.006, 10);
    expect(cppFactor(66)).toBeCloseTo(1 + 12 * 0.007, 10);
  });

  it("clamps outside the 60-70 window", () => {
    expect(cppFactor(55)).toBeCloseTo(0.64, 10);
    expect(cppFactor(75)).toBeCloseTo(1.42, 10);
  });
});

describe("oasFactor — deferral only", () => {
  it("is 1 at 65 and 1.36 at 70", () => {
    expect(oasFactor(65)).toBe(1);
    expect(oasFactor(70)).toBeCloseTo(1.36, 10);
  });

  it("never reduces: ages below 65 clamp to 1", () => {
    expect(oasFactor(60)).toBe(1);
    expect(oasFactor(64)).toBe(1);
    expect(oasFactor(75)).toBeCloseTo(1.36, 10);
  });
});

describe("cppSurvivorBenefit — settled parts", () => {
  const base65 = 12_000; // deceased's calculated age-65 pension

  it("pays a survivor 65+ 60% of the deceased's age-65 pension", () => {
    expect(cppSurvivorBenefit(base65, 70, 0, 1, TY)).toBeCloseTo(base65 * 0.6, 6);
  });

  it("does not depend on when the deceased started their own pension", () => {
    // The function takes the deceased's CALCULATED age-65 entitlement. The
    // caller (projection.ts) passes raw[j].base65 with no cppFactor applied,
    // so an early or late start by the deceased cannot move this number.
    const early = base65 * cppFactor(60);
    const late = base65 * cppFactor(70);
    const fromBase = cppSurvivorBenefit(base65, 70, 0, 1, TY);
    expect(cppSurvivorBenefit(base65, 70, 0, 1, TY)).toBe(fromBase);
    // Had the received amount been used, these would differ from fromBase.
    expect(cppSurvivorBenefit(early, 70, 0, 1, TY)).not.toBeCloseTo(fromBase, 2);
    expect(cppSurvivorBenefit(late, 70, 0, 1, TY)).not.toBeCloseTo(fromBase, 2);
  });

  it("pays a survivor 45-64 the flat-rate portion plus 37.5%", () => {
    const b = cppSurvivorBenefit(base65, 50, 0, 1, TY);
    expect(b).toBeCloseTo(TY.cppSurvFlat + base65 * 0.375, 6);
  });

  it("reduces by 1/120 per month under 45 at ages 44, 40 and 35", () => {
    const full = TY.cppSurvFlat + base65 * 0.375;
    expect(cppSurvivorBenefit(base65, 44, 0, 1, TY)).toBeCloseTo(full * 0.9, 6);
    expect(cppSurvivorBenefit(base65, 40, 0, 1, TY)).toBeCloseTo(full * 0.5, 6);
    expect(cppSurvivorBenefit(base65, 35, 0, 1, TY)).toBeCloseTo(0, 10);
  });

  it("pays a survivor under 35 nothing", () => {
    expect(cppSurvivorBenefit(base65, 34, 0, 1, TY)).toBe(0);
    expect(cppSurvivorBenefit(base65, 20, 0, 1, TY)).toBe(0);
  });

  it("caps a survivor at 65 with no pension of their own at cppSurvMax65", () => {
    const huge = 100_000;
    expect(cppSurvivorBenefit(huge, 65, 0, 1, TY)).toBeCloseTo(TY.cppSurvMax65, 6);
  });

  it("caps a survivor under 65 at cppSurvMaxU65", () => {
    const huge = 100_000;
    expect(cppSurvivorBenefit(huge, 50, 0, 1, TY)).toBeCloseTo(TY.cppSurvMaxU65, 6);
  });

  it("returns 0 when the deceased had no pension", () => {
    expect(cppSurvivorBenefit(0, 70, 0, 1, TY)).toBe(0);
  });
});

describe("cppSurvivorBenefit — combined-benefit ceiling (OPEN question)", () => {
  // This test DOCUMENTS today's behaviour; it does not assert the behaviour is
  // correct. See docs/AGENT-STATUS.md, "OPEN — the CPP combined-benefit ceiling
  // ignores when the survivor took their own pension". The published
  // cppCombinedMax VALUE is VERIFIED against ESDC; the RULE for applying it is
  // APPROXIMATE in the §13.2 sense. If the rule is resolved as reading (b) or
  // (c), this test is the thing that fails and points at the decision.
  it("currently eliminates the survivor benefit when the survivor's own deferred pension exceeds the combined maximum", () => {
    const survOwnDeferred = TY.cppMax65 * cppFactor(70); // ~$25,690/yr
    expect(survOwnDeferred).toBeGreaterThan(TY.cppCombinedMax);
    expect(cppSurvivorBenefit(TY.cppMax65, 70, survOwnDeferred, 1, TY)).toBe(0);
  });

  it("currently applies the age-65 combined ceiling unadjusted for the survivor's start age", () => {
    const own = TY.cppMax65 * 0.5 * cppFactor(70);
    const b = cppSurvivorBenefit(TY.cppMax65, 70, own, 1, TY);
    expect(b).toBeCloseTo(Math.max(0, TY.cppCombinedMax - own), 6);
  });
});
