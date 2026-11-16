import { describe, expect, it } from "vitest";

import { ontarioHealthPremium } from "./tax";

/**
 * Boundary regression tests for ontarioHealthPremium (tax.ts).
 *
 * Tests only. The Ontario Health Premium is a six-band piecewise schedule:
 * nil to $20,000, then 6% ramps capped at $300 and $450, then 25% ramps
 * capped at $600, $750 and $900. Existing coverage (engine.test.ts) pins
 * exactly three points (19,000 -> 0; 25,000 -> 300; 1,000,000 -> 900) and
 * none of the band joins, cap-attainment incomes, or plateaus, so a
 * regression inside any single band could pass the current suite.
 *
 * Every expected value below is hand arithmetic on the implemented
 * schedule's published band structure, not an engine output and not a
 * statement about which income measure the premium should be levied on;
 * that is methodology and out of scope for a tests-only change.
 */

describe("ontarioHealthPremium band boundaries", () => {
  it("is nil up to and including the $20,000 threshold", () => {
    expect(ontarioHealthPremium(0)).toBe(0);
    expect(ontarioHealthPremium(19_999.99)).toBe(0);
    expect(ontarioHealthPremium(20_000)).toBe(0);
  });

  it("ramps at 6% above $20,000 and attains the $300 cap at exactly $25,000", () => {
    expect(ontarioHealthPremium(20_001)).toBeCloseTo(0.06, 10);
    expect(ontarioHealthPremium(22_000)).toBeCloseTo(120, 10);
    expect(ontarioHealthPremium(24_999)).toBeCloseTo(299.94, 10);
    expect(ontarioHealthPremium(25_000)).toBeCloseTo(300, 10);
  });

  it("plateaus at $300 through the top of the second band", () => {
    expect(ontarioHealthPremium(30_000)).toBeCloseTo(300, 10);
    expect(ontarioHealthPremium(36_000)).toBeCloseTo(300, 10);
  });

  it("ramps at 6% above $36,000 and attains the $450 cap at exactly $38,500", () => {
    expect(ontarioHealthPremium(36_001)).toBeCloseTo(300.06, 10);
    expect(ontarioHealthPremium(37_000)).toBeCloseTo(360, 10);
    expect(ontarioHealthPremium(38_500)).toBeCloseTo(450, 10);
    expect(ontarioHealthPremium(48_000)).toBeCloseTo(450, 10);
  });

  it("ramps at 25% above $48,000 and attains the $600 cap at exactly $48,600", () => {
    expect(ontarioHealthPremium(48_001)).toBeCloseTo(450.25, 10);
    expect(ontarioHealthPremium(48_300)).toBeCloseTo(525, 10);
    expect(ontarioHealthPremium(48_600)).toBeCloseTo(600, 10);
    expect(ontarioHealthPremium(60_000)).toBeCloseTo(600, 10);
    expect(ontarioHealthPremium(72_000)).toBeCloseTo(600, 10);
  });

  it("ramps at 25% above $72,000 and attains the $750 cap at exactly $72,600", () => {
    expect(ontarioHealthPremium(72_001)).toBeCloseTo(600.25, 10);
    expect(ontarioHealthPremium(72_300)).toBeCloseTo(675, 10);
    expect(ontarioHealthPremium(72_600)).toBeCloseTo(750, 10);
    expect(ontarioHealthPremium(150_000)).toBeCloseTo(750, 10);
    expect(ontarioHealthPremium(200_000)).toBeCloseTo(750, 10);
  });

  it("ramps at 25% above $200,000 and attains the $900 cap at exactly $200,600", () => {
    expect(ontarioHealthPremium(200_001)).toBeCloseTo(750.25, 10);
    expect(ontarioHealthPremium(200_300)).toBeCloseTo(825, 10);
    expect(ontarioHealthPremium(200_600)).toBeCloseTo(900, 10);
    expect(ontarioHealthPremium(10_000_000)).toBe(900);
  });

  it("is continuous at every band join (no step at a threshold)", () => {
    const epsilon = 0.01;
    for (const threshold of [20_000, 36_000, 48_000, 72_000, 200_000]) {
      const below = ontarioHealthPremium(threshold - epsilon);
      const above = ontarioHealthPremium(threshold + epsilon);
      expect(Math.abs(above - below)).toBeLessThanOrEqual(0.25 * epsilon * 2 + 1e-9);
    }
  });

  it("is monotonically non-decreasing across the whole schedule", () => {
    let previous = -1;
    for (let income = 0; income <= 210_000; income += 50) {
      const premium = ontarioHealthPremium(income);
      expect(premium).toBeGreaterThanOrEqual(previous);
      previous = premium;
    }
  });
});
