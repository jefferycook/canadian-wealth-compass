import { describe, it, expect } from "vitest";
import { getTaxYear } from "./taxYears";

/**
 * BC correctness pass, 2026-08-21.
 *
 * Sources: Province of British Columbia, "B.C. basic personal income tax
 * credits" (last updated 2026-04-20); Province of British Columbia, "Personal
 * income tax rates" (last updated 2026-04-17) / Budget 2026 tax measures.
 */
describe("BC 2026 personal credits", () => {
  const bc = getTaxYear(2026).provinces["BC"]!;

  it("pins the published 2026 age amount and threshold", () => {
    expect(bc.ageAmt).toBe(5927);
    expect(bc.ageThresh).toBe(44119);
  });

  it("leaves the verified 2026 bracket table, BPA, pension amount and DTC alone", () => {
    expect(bc.brackets.map((b) => b.up)).toEqual([
      50363, 100728, 115648, 140430, 190405, 265545, Infinity,
    ]);
    expect(bc.bpa).toBe(13216);
    expect(bc.penAmt).toBe(1000);
    expect(bc.divCredit).toBe(0.12);
  });
});

describe("BC indexation pause, 2027-2030", () => {
  const base = getTaxYear(2026).provinces["BC"]!;

  for (const yr of [2027, 2028, 2029, 2030]) {
    it(`freezes BC brackets and credits at 2026 values in ${yr}`, () => {
      const bc = getTaxYear(yr, 0.02).provinces["BC"]!;
      expect(bc.brackets.map((b) => b.up)).toEqual(base.brackets.map((b) => b.up));
      expect(bc.bpa).toBe(base.bpa);
      expect(bc.ageAmt).toBe(base.ageAmt);
      expect(bc.ageThresh).toBe(base.ageThresh);
      expect(bc.penAmt).toBe(base.penAmt);
    });
  }

  it("resumes indexing in 2031 from the 2026 base", () => {
    const bc = getTaxYear(2031, 0.02).provinces["BC"]!;
    expect(bc.bpa).toBeGreaterThan(base.bpa);
    expect(bc.ageAmt).toBeGreaterThan(base.ageAmt);
    expect(bc.ageThresh).toBeGreaterThan(base.ageThresh);
    expect(bc.brackets[0]!.up).toBeGreaterThan(base.brackets[0]!.up);
    expect(bc.bpa).toBe(Math.round(base.bpa * Math.pow(1.02, 5)));
  });

  it("control: Ontario still indexes in 2027", () => {
    const on26 = getTaxYear(2026).provinces["ON"]!;
    const on27 = getTaxYear(2027, 0.02).provinces["ON"]!;
    expect(on27.bpa).toBeGreaterThan(on26.bpa);
    expect(on27.ageAmt).toBeGreaterThan(on26.ageAmt);
    expect(on27.brackets[0]!.up).toBeGreaterThan(on26.brackets[0]!.up);
  });

  it("control: Alberta still indexes in 2028", () => {
    const ab26 = getTaxYear(2026).provinces["AB"]!;
    const ab28 = getTaxYear(2028, 0.02).provinces["AB"]!;
    expect(ab28.bpa).toBeGreaterThan(ab26.bpa);
  });
});
