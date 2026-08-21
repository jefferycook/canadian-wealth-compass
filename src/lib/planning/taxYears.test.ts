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
 * Sources: CRA, "TD1AB-WS Worksheet for the 2026 Alberta Personal Tax Credits
 * Return" (2026 form): age amount $6,345, phase-out from net income $47,234 to
 * $89,534. CRA, Form "TD1AB 2026 Alberta Personal Tax Credits Return"
 * (td1ab-26e.pdf), line 3: pension income amount $1,753. Alberta.ca, "Personal
 * income tax": 2026 thresholds and credit amounts rise by 2%.
 */
describe("AB 2026 personal credits", () => {
  const ab = getTaxYear(2026).provinces["AB"]!;

  it("pins the published 2026 age amount and threshold", () => {
    expect(ab.ageAmt).toBe(6345);
    expect(ab.ageThresh).toBe(47234);
  });

  // CRA Form TD1AB 2026, line 3: "Pension income amount - If you will receive
  // regular pension payments ... enter whichever is less: $1,753 or your
  // estimated annual pension income." Checked 2026-08-21.
  it("pins the official 2026 TD1AB pension income amount", () => {
    expect(ab.penAmt).toBe(1753);
  });

  it("is consistent with the 2025 amounts indexed by Alberta's published 2%", () => {
    // CRA 2025 AB428: age amount 6,221, threshold 46,308.
    expect(ab.ageAmt).toBe(Math.round(6221 * 1.02));
    expect(ab.ageThresh).toBe(Math.round(46308 * 1.02));
    // CRA 2025 AB428 line 58360: pension income amount 1,719.
    expect(ab.penAmt).toBe(Math.round(1719 * 1.02));
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
    // 1,719 -> 2026 1,753), so the derived-year indexing of penAmt is correct
    // for AB and runs from the verified 2026 value.
    expect(ab27.penAmt).toBe(Math.round(1753 * 1.02));
  });
});

/**
 * Ontario correctness pass, 2026-08-21 (verification only — nothing changed).
 *
 * Sources (tier 1): CRA, Form "TD1ON 2026 Ontario Personal Tax Credits Return"
 * (td1on-26e.pdf) — line 1 basic personal amount $12,989; line 2 age amount
 * $6,342 with the phase-out running from net income $47,210 to $89,490; line 3
 * pension income amount, the lesser of $1,796 or estimated annual pension.
 * Ontario.ca, "Ontario dividend tax credit" (updated 2026-04-27): the eligible
 * dividend credit is 10.0% of the taxable (grossed-up) dividend for 2020-2026.
 */
describe("ON 2026 personal credits", () => {
  const on = getTaxYear(2026).provinces["ON"]!;

  it("pins the official TD1ON 2026 amounts", () => {
    expect(on.bpa).toBe(12989);
    expect(on.ageAmt).toBe(6342);
    expect(on.ageThresh).toBe(47210);
    expect(on.penAmt).toBe(1796);
  });

  it("pins the Ontario eligible-dividend tax credit at 10%", () => {
    expect(on.divCredit).toBe(0.1);
  });

  it("leaves the verified 2026 bracket and surtax tables alone", () => {
    expect(on.brackets.map((b) => b.up)).toEqual([
      53891, 107785, 150000, 220000, Infinity,
    ]);
    expect(on.surtax.map((s) => s.over)).toEqual([5818, 7446]);
    expect(on.healthPremium).toBe(true);
    expect(on.indexationPause).toBeUndefined();
  });
});

/**
 * Provincial eligible-dividend credits and the BC pension amount, verified
 * 2026-08-21 against the current provincial pages:
 *  - Province of BC, "B.C. basic personal income tax credits" (2026 table):
 *    pension amount $1,000, marked NOT indexed; eligible-dividend credit 12%.
 *  - Ontario.ca, "Ontario dividend tax credit": 10.0% for 2020-2026.
 *  - Alberta Personal Income Tax Act s.21 as amended by Bill 35 (2020):
 *    eligible-dividend credit 8.12% of the grossed-up dividend for 2021 and
 *    subsequent taxation years; no later change found.
 */
describe("provincial eligible-dividend credits, 2026", () => {
  const t = getTaxYear(2026);

  it("pins ON 10%, BC 12%, AB 8.12%", () => {
    expect(t.provinces["ON"]!.divCredit).toBe(0.1);
    expect(t.provinces["BC"]!.divCredit).toBe(0.12);
    expect(t.provinces["AB"]!.divCredit).toBe(0.0812);
  });

  it("keeps the dividend credits out of indexation entirely", () => {
    const t35 = getTaxYear(2035, 0.02);
    expect(t35.provinces["ON"]!.divCredit).toBe(0.1);
    expect(t35.provinces["BC"]!.divCredit).toBe(0.12);
    expect(t35.provinces["AB"]!.divCredit).toBe(0.0812);
  });

  // BC-2 RESOLVED 2026-08-21. BC Income Tax Act s.4.32 fixes the pension credit
  // base at the smaller of $1,000 and eligible pension income; it is a fixed
  // statutory amount, not an indexed one. `penAmtIndexed: false` keeps it at
  // $1,000 in every derived year.
  it("keeps BC's non-indexed pension amount at exactly $1,000 in every year", () => {
    expect(getTaxYear(2026).provinces["BC"]!.penAmt).toBe(1000);
    expect(getTaxYear(2030, 0.02).provinces["BC"]!.penAmt).toBe(1000);
    expect(getTaxYear(2031, 0.02).provinces["BC"]!.penAmt).toBe(1000);
    expect(getTaxYear(2055, 0.03).provinces["BC"]!.penAmt).toBe(1000);
  });

  it("still indexes the ON and AB pension amounts, which do index in law", () => {
    const on = getTaxYear(2026).provinces["ON"]!.penAmt;
    const ab = getTaxYear(2026).provinces["AB"]!.penAmt;
    expect(getTaxYear(2031, 0.02).provinces["ON"]!.penAmt).toBe(
      Math.round(on * Math.pow(1.02, 5)),
    );
    expect(getTaxYear(2031, 0.02).provinces["AB"]!.penAmt).toBe(
      Math.round(ab * Math.pow(1.02, 5)),
    );
  });
});
