import { describe, it, expect } from "vitest";
import { cppShare, estimateCppAt65 } from "./estimates";
import { TAX_2026 } from "./taxYears";

const TY = TAX_2026;

describe("cppAvgNew65 — the published average new retirement pension at 65", () => {
  it("pins the current Canada.ca figure of $877.01/month", () => {
    // VERIFIED 2026-08-21 against Canada.ca "CPP: How much you could receive",
    // July-September 2026 quarter. A statistic, not a statutory maximum.
    // Corrected on 2026-08-21 from a stale 10,464 ($872/mo).
    expect(TY.cppAvgNew65).toBeCloseTo(10_524.12, 6);
    expect(TY.cppAvgNew65 / 12).toBeCloseTo(877.01, 6);
  });

  it("feeds the estimator's average share of the maximum", () => {
    const avgShare = TY.cppAvgNew65 / TY.cppMax65;
    expect(cppShare("average", 2026)).toBeCloseTo(avgShare, 10);
    expect(cppShare("max", 2026)).toBe(1);
    expect(cppShare("aboveAverage", 2026)).toBeCloseTo((1 + avgShare) / 2, 10);
    expect(cppShare("partial", 2026)).toBeCloseTo(avgShare * 0.65, 10);
  });

  it("estimates the average earner's age-65 pension from that share", () => {
    expect(estimateCppAt65("average", 2026)).toBe(Math.round(TY.cppAvgNew65));
    expect(estimateCppAt65("max", 2026)).toBe(Math.round(TY.cppMax65));
    expect(estimateCppAt65("aboveAverage", 2026)).toBeGreaterThan(
      estimateCppAt65("average", 2026),
    );
    expect(estimateCppAt65("partial", 2026)).toBeLessThan(
      estimateCppAt65("average", 2026),
    );
  });
});
