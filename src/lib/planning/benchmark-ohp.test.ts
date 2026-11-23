import { describe, it, expect } from "vitest";
import { ontarioHealthPremium } from "./tax";

/**
 * Independent benchmark: Ontario Health Premium band boundaries.
 *
 * Expected values are hand-derived from the published Ontario schedule
 * (Taxation Act, 2007 (Ontario) s.24(2), Ontario Health Premium; unchanged for 2026):
 *   <= 20,000: 0
 *   20,000-25,000: 6% of excess over 20,000 (max 300); 25,000-36,000: 300
 *   36,000-38,500: 300 + 6% of excess over 36,000 (max 450); to 48,000: 450
 *   48,000-48,600: 450 + 25% of excess over 48,000 (max 600); to 72,000: 600
 *   72,000-72,600: 600 + 25% of excess over 72,000 (max 750); to 200,000: 750
 *   200,000-200,600: 750 + 25% of excess over 200,000 (max 900); above: 900
 * Does not read engine constants. Assumes combined income equals the supplied
 * income (no split-income adjustments). Arithmetic-wiring check only; a reviewer
 * must confirm the schedule against Ontario primary sources.
 */
const cases: Array<[number, number, string]> = [
  [0, 0, "zero income"],
  [20000, 0, "at first threshold"],
  [20001, 0.06, "one dollar over first threshold"],
  [22500, 150, "mid first band"],
  [25000, 300, "first cap reached"],
  [36000, 300, "end of flat 300"],
  [37000, 360, "mid second band"],
  [38500, 450, "second cap reached"],
  [48000, 450, "end of flat 450"],
  [48200, 500, "25% band, 200 over"],
  [48600, 600, "third cap reached"],
  [72000, 600, "end of flat 600"],
  [72400, 700, "25% band, 400 over"],
  [72600, 750, "fourth cap reached"],
  [200000, 750, "end of flat 750"],
  [200200, 800, "25% band, 200 over"],
  [200600, 900, "final cap reached"],
  [1000000, 900, "far above"],
];

describe("Ontario Health Premium boundaries (hand-derived)", () => {
  it.each(cases)("%i → %f (%s)", (income, expected) => {
    expect(ontarioHealthPremium(income)).toBeCloseTo(expected, 2);
  });
});
