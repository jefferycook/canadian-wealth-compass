import { describe, expect, it } from "vitest";
import { selectS583EventC, type EventCInput } from "./cpp5-event-c";

const base: EventCInput = {
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
