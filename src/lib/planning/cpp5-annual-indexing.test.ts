import { describe, expect, it } from "vitest";
import { indexBenefitAnnually } from "./cpp5-annual-indexing";

// Every expected value below was derived by hand from CPP Act s.45(2) and Regulations
// s.62 (see the module header), not from the module. Illustrative PI series, not real.
describe("CPP-5 experimental annual indexing chain", () => {
  it("rounds each year to the cent, third digit 5 rounding up (1045.50 x 1.03 = 1076.865)", () => {
    const r = indexBenefitAnnually({
      startYear: 2030,
      startAmountCents: 100000,
      pensionIndex: {
        2030: "100",
        2031: "102.5",
        2032: "104.55",
        2033: "104.55",
        2034: "107.6865",
      },
      throughYear: 2034,
    });
    expect(r.status).toBe("COMPUTED");
    if (r.status !== "COMPUTED") return;
    expect(r.basis).toBe("STATUTORY_TEXT");
    // 1000.00 x 1.025 = 1025.00; x 1.02 = 1045.50; x 1.000 = 1045.50; x 1.03 = 1076.865 -> 1076.87
    expect(r.steps.map((s) => s.amountCents)).toEqual([102500, 104550, 104550, 107687]);
    expect(r.steps.map((s) => s.ratioApplied)).toEqual(["1.025", "1.020", "1.000", "1.030"]);
  });

  it("cascades rounding: 333.33 -> 333.66 -> 333.99, not the direct 334.00", () => {
    // 333.33 x 1.001 = 333.66333 -> 333.66; 333.66 x 1.001 = 333.99366 -> 333.99
    // (direct 333.33 x 1.002001 = 333.99699... -> 334.00 would be wrong)
    const r = indexBenefitAnnually({
      startYear: 2030,
      startAmountCents: 33333,
      pensionIndex: { 2030: "100", 2031: "100.1", 2032: "100.2001" },
      throughYear: 2032,
    });
    expect(r.status === "COMPUTED" && r.steps.map((s) => s.amountCents)).toEqual([33366, 33399]);
  });

  it("drops a third digit below 5 and rounds up at exactly 5", () => {
    const hi = indexBenefitAnnually({
      startYear: 2030,
      startAmountCents: 9950,
      pensionIndex: { 2030: "100", 2031: "100.5" },
      throughYear: 2031,
    });
    // 99.50 x 1.005 = 99.9975 -> 100.00
    expect(hi.status === "COMPUTED" && hi.finalAmountCents).toBe(10000);
    const lo = indexBenefitAnnually({
      startYear: 2030,
      startAmountCents: 10010,
      pensionIndex: { 2030: "100", 2031: "100.5" },
      throughYear: 2031,
    });
    // 100.10 x 1.005 = 100.6005 -> 100.60
    expect(lo.status === "COMPUTED" && lo.finalAmountCents).toBe(10060);
  });

  it("returns the start amount when throughYear equals startYear", () => {
    const r = indexBenefitAnnually({
      startYear: 2030,
      startAmountCents: 12345,
      pensionIndex: { 2030: "100" },
      throughYear: 2030,
    });
    expect(r).toMatchObject({ status: "COMPUTED", finalAmountCents: 12345, steps: [] });
  });

  it("fails closed when the ratio is not exact to three decimals and no policy is given", () => {
    const r = indexBenefitAnnually({
      startYear: 2030,
      startAmountCents: 100000,
      pensionIndex: { 2030: "100", 2031: "101.234" },
      throughYear: 2031,
    });
    expect(r.status).toBe("UNVERIFIED_RULE");
  });

  it("applies an explicit ratio policy but tags the result as not verified", () => {
    const base = {
      startYear: 2030,
      startAmountCents: 100000,
      pensionIndex: { 2030: "100", 2031: "101.234" },
      throughYear: 2031,
    };
    // ratio 1.01234: three decimals 1.012 -> 1012.00; four decimals 1.0123 -> 1012.30
    const three = indexBenefitAnnually({ ...base, ratioPolicy: "THREE_DECIMALS_LITERAL_REG62_3" });
    const four = indexBenefitAnnually({
      ...base,
      ratioPolicy: "FOUR_DECIMALS_ALTERNATIVE_READING",
    });
    expect(three).toMatchObject({
      status: "COMPUTED",
      basis: "ASSUMED_RATIO_POLICY_NOT_VERIFIED",
      finalAmountCents: 101200,
    });
    expect(four).toMatchObject({
      status: "COMPUTED",
      basis: "ASSUMED_RATIO_POLICY_NOT_VERIFIED",
      finalAmountCents: 101230,
    });
  });

  it("rounds the ratio half-up on the fourth digit (1.0125 -> 1.013)", () => {
    const r = indexBenefitAnnually({
      startYear: 2030,
      startAmountCents: 100000,
      pensionIndex: { 2030: "100", 2031: "101.25" },
      throughYear: 2031,
      ratioPolicy: "THREE_DECIMALS_LITERAL_REG62_3",
    });
    expect(r.status === "COMPUTED" && r.finalAmountCents).toBe(101300);
  });

  it("rejects a falling PI (s.43(2)), missing years and malformed values", () => {
    expect(
      indexBenefitAnnually({
        startYear: 2030,
        startAmountCents: 1,
        pensionIndex: { 2030: "100", 2031: "99" },
        throughYear: 2031,
      }).status,
    ).toBe("INVALID_INPUT");
    expect(
      indexBenefitAnnually({
        startYear: 2030,
        startAmountCents: 1,
        pensionIndex: { 2030: "100" },
        throughYear: 2031,
      }).status,
    ).toBe("INSUFFICIENT_DATA");
    expect(
      indexBenefitAnnually({
        startYear: 2030,
        startAmountCents: 1,
        pensionIndex: { 2030: "1e2" },
        throughYear: 2030,
      }).status,
    ).toBe("INVALID_INPUT");
    expect(
      indexBenefitAnnually({
        startYear: 2030,
        startAmountCents: 1.5,
        pensionIndex: { 2030: "100" },
        throughYear: 2030,
      }).status,
    ).toBe("INVALID_INPUT");
    expect(
      indexBenefitAnnually({
        startYear: 2031,
        startAmountCents: 1,
        pensionIndex: { 2031: "100" },
        throughYear: 2030,
      }).status,
    ).toBe("INVALID_INPUT");
  });

  it("is exact where floating point is not (0.1+0.2-style PI inputs)", () => {
    const r = indexBenefitAnnually({
      startYear: 2030,
      startAmountCents: 100000,
      pensionIndex: { 2030: "0.3", 2031: "0.30000000000000004" },
      throughYear: 2031,
      ratioPolicy: "THREE_DECIMALS_LITERAL_REG62_3",
    });
    // ratio 1.00000000000000013 -> 1.000
    expect(r.status === "COMPUTED" && r.finalAmountCents).toBe(100000);
  });
});
