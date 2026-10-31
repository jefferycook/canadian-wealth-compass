import { describe, expect, it } from "vitest";
import { selectS583EventC, type EventCInput } from "./cpp5-event-c";

const base: EventCInput = {
  deathMonth: "2030-01",
  survivorBirthMonth: "1965-01",
  provincialPlanProvenanceDeclared: true,
  survivorPensionCommencementMonth: "2030-06",
  ownRetirementCommencementMonth: "2032-01",
  provincialRetirementCommencementMonth: null,
};

describe("selectS583EventC (fail-closed, experimental)", () => {
  it("reports the later month only when both commencements are supplied", () => {
    expect(selectS583EventC(base)).toMatchObject({ status: "CANDIDATE", laterMonth: "2032-01" });
    expect(selectS583EventC({ ...base, ownRetirementCommencementMonth: "2029-01" })).toMatchObject({
      status: "CANDIDATE",
      laterMonth: "2030-06",
    });
  });
  it("same-month commencement yields that month", () => {
    expect(selectS583EventC({ ...base, ownRetirementCommencementMonth: "2030-06" })).toMatchObject({
      status: "CANDIDATE",
      laterMonth: "2030-06",
    });
  });
  it("provincial-plan retirement substitutes for an absent CPP one", () => {
    expect(
      selectS583EventC({
        ...base,
        ownRetirementCommencementMonth: null,
        provincialRetirementCommencementMonth: "2031-03",
      }),
    ).toMatchObject({ status: "CANDIDATE", laterMonth: "2031-03" });
  });
  it.each([
    ["survivorPensionCommencementMonth"],
    ["ownRetirementCommencementMonth"],
    ["provincialRetirementCommencementMonth"],
  ] as const)("unknown %s fails closed", (k) => {
    const r = selectS583EventC({ ...base, [k]: undefined });
    expect(r.status).toBe("UNRESOLVED");
    expect("laterMonth" in r).toBe(false);
  });
  it("no retirement pension at all is unresolved, not a guess", () => {
    expect(selectS583EventC({ ...base, ownRetirementCommencementMonth: null }).status).toBe(
      "UNRESOLVED",
    );
  });
  it("CPP and provincial both declared is unresolved", () => {
    expect(
      selectS583EventC({ ...base, provincialRetirementCommencementMonth: "2031-01" }).status,
    ).toBe("UNRESOLVED");
  });
  it("declared no survivor pension is NOT_MET", () => {
    expect(selectS583EventC({ ...base, survivorPensionCommencementMonth: null }).status).toBe(
      "NOT_MET",
    );
  });
  it("rejects malformed months", () => {
    expect(selectS583EventC({ ...base, ownRetirementCommencementMonth: "2032-13" }).status).toBe(
      "INVALID_INPUT",
    );
    expect(selectS583EventC({ ...base, survivorPensionCommencementMonth: "2030-6" }).status).toBe(
      "INVALID_INPUT",
    );
  });
});

describe("selectS583EventC input-history hardening", () => {
  it("fails closed when the death month is missing", () => {
    expect(selectS583EventC({ ...base, deathMonth: undefined }).status).toBe("UNRESOLVED");
  });
  it("survivor pension in or before the death month is inconsistent", () => {
    for (const m of ["2030-01", "2029-12"])
      expect(selectS583EventC({ ...base, survivorPensionCommencementMonth: m }).status).toBe(
        "UNRESOLVED",
      );
  });
  it("own CPP retirement before age 60 is not trusted; exactly 60 is", () => {
    // born 1965-01 => 60 in 2025-01
    expect(selectS583EventC({ ...base, ownRetirementCommencementMonth: "2024-12" }).status).toBe(
      "UNRESOLVED",
    );
    expect(selectS583EventC({ ...base, ownRetirementCommencementMonth: "2025-01" }).status).toBe(
      "CANDIDATE",
    );
    expect(selectS583EventC({ ...base, survivorBirthMonth: undefined }).status).toBe("UNRESOLVED");
  });
  it("a provincial month needs declared provenance", () => {
    const prov = {
      ...base,
      ownRetirementCommencementMonth: null,
      provincialRetirementCommencementMonth: "2031-03",
    };
    expect(selectS583EventC(prov).status).toBe("CANDIDATE");
    expect(selectS583EventC({ ...prov, provincialPlanProvenanceDeclared: false }).status).toBe(
      "UNRESOLVED",
    );
    expect(selectS583EventC({ ...prov, provincialPlanProvenanceDeclared: undefined }).status).toBe(
      "UNRESOLVED",
    );
  });
  it("rejects a malformed or contradictory death/birth", () => {
    expect(selectS583EventC({ ...base, deathMonth: "2030-13" }).status).toBe("INVALID_INPUT");
    expect(selectS583EventC({ ...base, survivorBirthMonth: "2031-01" }).status).toBe(
      "INVALID_INPUT",
    );
  });
});
