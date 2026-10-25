import { describe, it, expect } from "vitest";
import { rrifMinFactor } from "./registered";

/**
 * Independent benchmark: RRIF minimum withdrawal factor.
 *
 * Expected values are hand-keyed from the CRA published prescribed-factor table
 * (Income Tax Regulations s.7308(4); CRA "Minimum amount to be withdrawn from a
 * RRIF"), not read from engine constants:
 *   under 71: 1 / (90 - age)
 *   71-94: published percentages below
 *   95+: 20%
 * Arithmetic-wiring check only; a reviewer must confirm the table against CRA
 * primary sources. Passing tests are not independent proof of accuracy.
 */
const published: Array<[number, number]> = [
  [71, 5.28], [72, 5.4], [73, 5.53], [74, 5.67], [75, 5.82], [76, 5.98],
  [77, 6.17], [78, 6.36], [79, 6.58], [80, 6.82], [81, 7.08], [82, 7.38],
  [83, 7.71], [84, 8.08], [85, 8.51], [86, 8.99], [87, 9.55], [88, 10.21],
  [89, 10.99], [90, 11.92], [91, 13.06], [92, 14.49], [93, 16.34], [94, 18.79],
  [95, 20], [100, 20], [110, 20],
];

describe("RRIF minimum factor: hand-keyed CRA benchmarks", () => {
  it.each(published)("age %i -> %f%%", (age, pct) => {
    expect(rrifMinFactor(age)).toBeCloseTo(pct, 6);
  });

  it.each([
    [55, 100 / 35],
    [60, 100 / 30],
    [65, 4],
    [70, 5],
  ])("under 71, age %i follows 1/(90-age)", (age, pct) => {
    expect(rrifMinFactor(age)).toBeCloseTo(pct, 6);
  });

  it("is non-decreasing from 55 through 95", () => {
    for (let a = 55; a < 95; a++) {
      expect(rrifMinFactor(a + 1)).toBeGreaterThanOrEqual(rrifMinFactor(a));
    }
  });

  it("age 70 -> 71 steps from 5.00% to 5.28%", () => {
    expect(rrifMinFactor(71) - rrifMinFactor(70)).toBeCloseTo(0.28, 6);
  });
});
