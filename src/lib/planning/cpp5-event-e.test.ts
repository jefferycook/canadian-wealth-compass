import { describe, expect, it } from "vitest";
import { selectS583EventE, type EventEInput } from "./cpp5-event-e";

// Synthetic months only. Illustrative research fixtures, not approved expected values.
const s57: EventEInput = {
  branch: "S55_7_BENEFIT_IN_PAY",
  adjustedBenefitIsSurvivorRetirementPension: true,
  applicationReceivedMonth: "2031-05",
  applicationApproved: true,
  benefitFirstPayableMonth: "2030-01",
};
const s552: EventEInput = {
  branch: "S55_2_9_DIVISION_UNDER_55_1",
  adjustedBenefitIsSurvivorRetirementPension: true,
  divisionTakesPlaceMonth: "2031-05",
  benefitPayableAbsentDivision: true,
  benefitFirstPayableMonth: "2030-01",
};

describe("selectS583EventE (fail-closed, experimental)", () => {
  it("s.55(7): effective the month after application receipt", () => {
    expect(selectS583EventE(s57)).toMatchObject({
      status: "CANDIDATE",
      adjustedBenefitEffectiveMonth: "2031-06",
    });
  });
  it("s.55(7): receipt in December rolls into January of the next year", () => {
    expect(selectS583EventE({ ...s57, applicationReceivedMonth: "2031-12" })).toMatchObject({
      adjustedBenefitEffectiveMonth: "2032-01",
    });
  });
  it("s.55(7): benefit first payable in the receipt month still engages", () => {
    expect(selectS583EventE({ ...s57, benefitFirstPayableMonth: "2031-05" }).status).toBe(
      "CANDIDATE",
    );
  });
  it("s.55(7): benefit first payable after the receipt month is not engaged", () => {
    expect(selectS583EventE({ ...s57, benefitFirstPayableMonth: "2031-06" }).status).toBe(
      "NOT_MET",
    );
  });
  it("s.55(7): unapproved or undeclared approval fails closed", () => {
    expect(selectS583EventE({ ...s57, applicationApproved: false }).status).toBe("UNRESOLVED");
    expect(selectS583EventE({ ...s57, applicationApproved: undefined }).status).toBe("UNRESOLVED");
  });
  it("s.55.2(9): effective the month after the division month", () => {
    expect(selectS583EventE(s552)).toMatchObject({
      status: "CANDIDATE",
      adjustedBenefitEffectiveMonth: "2031-06",
    });
  });
  it("s.55.2(9): benefit first payable the month after the division still engages", () => {
    expect(selectS583EventE({ ...s552, benefitFirstPayableMonth: "2031-06" }).status).toBe(
      "CANDIDATE",
    );
  });
  it("s.55.2(9): benefit first payable two months after the division is not engaged", () => {
    expect(selectS583EventE({ ...s552, benefitFirstPayableMonth: "2031-07" }).status).toBe(
      "NOT_MET",
    );
  });
  it("the two branches differ at the same boundary month (not one rule)", () => {
    // payable month = receipt/division month + 1: engaged under s.55.2(9), not under s.55(7).
    expect(selectS583EventE({ ...s57, benefitFirstPayableMonth: "2031-06" }).status).toBe(
      "NOT_MET",
    );
    expect(selectS583EventE({ ...s552, benefitFirstPayableMonth: "2031-06" }).status).toBe(
      "CANDIDATE",
    );
  });
  it("mixing branch inputs is unresolved", () => {
    expect(selectS583EventE({ ...s57, divisionTakesPlaceMonth: "2031-05" }).status).toBe(
      "UNRESOLVED",
    );
    expect(selectS583EventE({ ...s552, applicationReceivedMonth: "2031-05" }).status).toBe(
      "UNRESOLVED",
    );
  });
  it.each([["adjustedBenefitIsSurvivorRetirementPension"], ["benefitFirstPayableMonth"]] as const)(
    "unknown %s fails closed with no month",
    (k) => {
      for (const base of [s57, s552]) {
        const r = selectS583EventE({ ...base, [k]: undefined });
        expect(r.status).toBe("UNRESOLVED");
        expect("adjustedBenefitEffectiveMonth" in r).toBe(false);
      }
    },
  );
  it("missing trigger month is unresolved", () => {
    expect(selectS583EventE({ ...s57, applicationReceivedMonth: undefined }).status).toBe(
      "UNRESOLVED",
    );
    expect(selectS583EventE({ ...s552, divisionTakesPlaceMonth: undefined }).status).toBe(
      "UNRESOLVED",
    );
  });
  it("rejects malformed months and unknown branches", () => {
    expect(selectS583EventE({ ...s57, applicationReceivedMonth: "2031-13" }).status).toBe(
      "INVALID_INPUT",
    );
    expect(selectS583EventE({ ...s552, benefitFirstPayableMonth: "2030-1" }).status).toBe(
      "INVALID_INPUT",
    );
    expect(
      selectS583EventE({ ...s57, branch: "S55_3" as unknown as EventEInput["branch"] }).status,
    ).toBe("INVALID_INPUT");
  });
  it("month range: 9999-12, 0000-01 and pre-CPP months are rejected, not overflowed", () => {
    for (const m of ["9999-12", "0000-01", "1965-12", "2200-01"]) {
      expect(selectS583EventE({ ...s57, applicationReceivedMonth: m }).status).toBe(
        "INVALID_INPUT",
      );
      expect(selectS583EventE({ ...s552, divisionTakesPlaceMonth: m }).status).toBe(
        "INVALID_INPUT",
      );
    }
  });
  it("month range: boundary months are accepted and the result stays in range", () => {
    expect(
      selectS583EventE({
        ...s57,
        applicationReceivedMonth: "2199-12",
        benefitFirstPayableMonth: "1966-01",
      }),
    ).toMatchObject({ status: "CANDIDATE", adjustedBenefitEffectiveMonth: "2200-01" });
    expect(
      selectS583EventE({
        ...s57,
        applicationReceivedMonth: "1966-01",
        benefitFirstPayableMonth: "1966-01",
      }).status,
    ).toBe("CANDIDATE");
  });
  it("s.55.2(9): payability absent the division must be declared true", () => {
    for (const v of [undefined, false]) {
      const r = selectS583EventE({ ...s552, benefitPayableAbsentDivision: v });
      expect(r.status).toBe("UNRESOLVED");
      expect("adjustedBenefitEffectiveMonth" in r).toBe(false);
    }
  });
  it("a CANDIDATE is labelled caller-declared and unverified, never MET", () => {
    for (const base of [s57, s552]) {
      expect(selectS583EventE(base)).toMatchObject({
        status: "CANDIDATE",
        provenance: "CALLER_DECLARED_UNVERIFIED",
      });
    }
  });
});
