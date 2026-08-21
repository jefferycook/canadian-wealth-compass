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

  // BC Income Tax Act s.4.52(2) with s.4.52(4.25): indexation resumes
  // prospectively from the frozen 2030 (= 2026) amount, with no catch-up for
  // the four paused years.
  it("resumes with exactly ONE year of indexing in 2031, no catch-up", () => {
    const bc = getTaxYear(2031, 0.02).provinces["BC"]!;
    expect(bc.bpa).toBeGreaterThan(base.bpa);
    expect(bc.bpa).toBe(Math.round(base.bpa * 1.02));
    expect(bc.ageAmt).toBe(Math.round(base.ageAmt * 1.02));
    expect(bc.ageThresh).toBe(Math.round(base.ageThresh * 1.02));
    expect(bc.brackets[0]!.up).toBe(Math.round(base.brackets[0]!.up * 1.02));
    expect(bc.bpa).toBeLessThan(Math.round(base.bpa * Math.pow(1.02, 5)));
  });

  it("applies two years of indexing in 2032", () => {
    const bc = getTaxYear(2032, 0.02).provinces["BC"]!;
    const f = Math.pow(1.02, 2);
    expect(bc.bpa).toBe(Math.round(base.bpa * f));
    expect(bc.ageAmt).toBe(Math.round(base.ageAmt * f));
    expect(bc.ageThresh).toBe(Math.round(base.ageThresh * f));
    expect(bc.brackets[0]!.up).toBe(Math.round(base.brackets[0]!.up * f));
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

/**
 * Alberta correctness pass, 2026-08-21.
 *
 * Source: CRA, "TD1AB-WS Worksheet for the 2026 Alberta Personal Tax Credits
 * Return" (2026 form): age amount $6,345, phase-out from net income $47,234 to
 * $89,534. Alberta.ca, "Personal income tax": 2026 thresholds and credit
 * amounts rise by 2%.
 */
describe("AB 2026 personal credits", () => {
  const ab = getTaxYear(2026).provinces["AB"]!;

  it("pins the published 2026 age amount and threshold", () => {
    expect(ab.ageAmt).toBe(6345);
    expect(ab.ageThresh).toBe(47234);
  });

  it("is consistent with the 2025 amounts indexed by Alberta's published 2%", () => {
    // CRA 2025 AB428: age amount 6,221, threshold 46,308.
    expect(ab.ageAmt).toBe(Math.round(6221 * 1.02));
    expect(ab.ageThresh).toBe(Math.round(46308 * 1.02));
  });

  it("leaves the verified 2026 bracket table and BPA alone", () => {
    expect(ab.brackets.map((b) => b.up)).toEqual([
      61200, 154259, 185111, 246813, 370220, Infinity,
    ]);
    expect(ab.bpa).toBe(22769);
    expect(ab.divCredit).toBe(0.0812);
  });

  it("has no indexation pause, so 2027 credits index normally", () => {
    const ab27 = getTaxYear(2027, 0.02).provinces["AB"]!;
    expect(ab.indexationPause).toBeUndefined();
    expect(ab27.ageAmt).toBe(Math.round(6345 * 1.02));
    expect(ab27.ageThresh).toBe(Math.round(47234 * 1.02));
    // Alberta's pension income amount indexes in law (2024 1,685 -> 2025
    // 1,719), so the derived-year indexing of penAmt is correct for AB. The
    // 2026 *value* remains an open verification item (backlog AB-1).
    expect(ab27.penAmt).toBe(Math.round(ab.penAmt * 1.02));
  });
});
