import { describe, expect, it } from "vitest";
import { pensionIndexFromCpi } from "./cpp5-pension-index";

// Expected values derived by hand from CPP Act s.43 and Regulations s.75 (see module
// header). Illustrative CPI series, not published data. Not approved fixtures.
// Window for year 2031 is 2029-11 .. 2030-10.
const WINDOW_2031 = [
  "2029-11",
  "2029-12",
  "2030-01",
  "2030-02",
  "2030-03",
  "2030-04",
  "2030-05",
  "2030-06",
  "2030-07",
  "2030-08",
  "2030-09",
  "2030-10",
];
const series = (values: (number | string)[]) =>
  Object.fromEntries(WINDOW_2031.map((k, i) => [k, values[i] ?? ""]));

describe("CPP-5 experimental Pension Index from monthly CPI", () => {
  it("uses Nov (Y-2) through Oct (Y-1) and ignores other months", () => {
    const cpi = { ...series(Array(12).fill("100.0")), "2030-11": "999.9", "2029-10": "1.0" };
    const r = pensionIndexFromCpi({ year: 2031, cpi });
    expect(r.status).toBe("COMPUTED");
    if (r.status !== "COMPUTED") return;
    expect(r.window).toEqual(WINDOW_2031);
    expect(r.pensionIndex).toBe("100.0");
  });

  it("rounds on the second decimal digit: sum 1205.4 / 12 = 100.45 -> 100.5", () => {
    // eleven months of 100.4 = 1104.4; plus 101.0 = 1205.4; /12 = 100.45
    const r = pensionIndexFromCpi({
      year: 2031,
      cpi: series([...Array(11).fill("100.4"), "101.0"]),
    });
    expect(r.status === "COMPUTED" && r.pensionIndex).toBe("100.5");
  });

  it("drops the second digit below five: sum 1205.2 / 12 = 100.4333 -> 100.4", () => {
    const r = pensionIndexFromCpi({
      year: 2031,
      cpi: series([...Array(11).fill("100.4"), "100.8"]),
    });
    expect(r.status === "COMPUTED" && r.pensionIndex).toBe("100.4");
  });

  it("does not round up on a third digit when the second digit is below five: 100.4499.. -> 100.4", () => {
    // sum = 1205.39 (needs two-decimal CPI input): /12 = 100.449166.. -> 100.44 -> 100.4
    const r = pensionIndexFromCpi({
      year: 2031,
      cpi: series([...Array(11).fill("100.40"), "100.99"]),
    });
    expect(r.status === "COMPUTED" && r.pensionIndex).toBe("100.4");
  });

  it("carries into the integer part: 100.95 -> 101.0", () => {
    // 12 x 100.95 = 1211.4
    const r = pensionIndexFromCpi({ year: 2031, cpi: series(Array(12).fill("100.95")) });
    expect(r.status === "COMPUTED" && r.pensionIndex).toBe("101.0");
  });

  it("holds the preceding PI when the calculation falls (s.43(2))", () => {
    const r = pensionIndexFromCpi({
      year: 2031,
      cpi: series(Array(12).fill("100.0")),
      precedingPensionIndex: "101.2",
    });
    expect(r).toMatchObject({
      status: "COMPUTED",
      pensionIndex: "101.2",
      calculatedPensionIndex: "100.0",
      heldAtPrecedingYear: true,
    });
  });

  it("does not hold when the calculation equals or exceeds the preceding PI", () => {
    const eq = pensionIndexFromCpi({
      year: 2031,
      cpi: series(Array(12).fill("100.0")),
      precedingPensionIndex: "100",
    });
    expect(eq).toMatchObject({ pensionIndex: "100.0", heldAtPrecedingYear: false });
    const up = pensionIndexFromCpi({
      year: 2031,
      cpi: series(Array(12).fill("100.0")),
      precedingPensionIndex: 99.9,
    });
    expect(up).toMatchObject({ pensionIndex: "100.0", heldAtPrecedingYear: false });
  });

  it("fails closed on a missing month", () => {
    const cpi = series(Array(12).fill("100.0"));
    delete (cpi as Record<string, unknown>)["2030-03"];
    const r = pensionIndexFromCpi({ year: 2031, cpi });
    expect(r).toMatchObject({ status: "INSUFFICIENT_DATA" });
  });

  it("fails closed on mixed CPI bases (s.43(3) not implemented)", () => {
    const cpiBasis = Object.fromEntries(
      WINDOW_2031.map((k, i) => [k, i < 6 ? "2002=100" : "2024=100"]),
    );
    const r = pensionIndexFromCpi({ year: 2031, cpi: series(Array(12).fill("100.0")), cpiBasis });
    expect(r).toMatchObject({ status: "UNVERIFIED_RULE", citation: "CPP Act s.43(3)" });
  });

  it("accepts a single consistent basis label", () => {
    const cpiBasis = Object.fromEntries(WINDOW_2031.map((k) => [k, "2002=100"]));
    const r = pensionIndexFromCpi({ year: 2031, cpi: series(Array(12).fill("100.0")), cpiBasis });
    expect(r.status).toBe("COMPUTED");
  });

  it("rejects malformed input", () => {
    expect(pensionIndexFromCpi({ year: 2031.5, cpi: {} }).status).toBe("INVALID_INPUT");
    expect(
      pensionIndexFromCpi({ year: 2031, cpi: series([...Array(11).fill("100.0"), "abc"]) }).status,
    ).toBe("INVALID_INPUT");
    expect(
      pensionIndexFromCpi({ year: 2031, cpi: series([...Array(11).fill("100.0"), 0]) }).status,
    ).toBe("INVALID_INPUT");
    expect(
      pensionIndexFromCpi({
        year: 2031,
        cpi: series(Array(12).fill("100.0")),
        precedingPensionIndex: "100.25",
      }).status,
    ).toBe("INVALID_INPUT");
  });
});
