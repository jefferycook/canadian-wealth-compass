import { describe, expect, it } from "vitest";
import { selectS583Events, type EventTimelineInput } from "./cpp5-event-timeline";

// Hand-authored synthetic timelines. Predicates only; no dollar amounts, no ratios.
// Month conventions for the event month are unresolved, so none is asserted.
// Not approved fixtures. See docs/CPP-5-S58-3-EVENT-MATRIX.md.
const base: EventTimelineInput = {
  deathMonth: "2030-06",
  survivorBirthMonth: "1980-03", // 50 at death
  s44d1dRegime: "d(ii)",
  ownRetirementCommencementMonth: null,
  disabilityOnsetMonth: null, // declared none
};

const run = (o: Partial<EventTimelineInput>, omit: (keyof EventTimelineInput)[] = []) => {
  const merged: Record<string, unknown> = { ...base, ...o };
  for (const k of omit) delete merged[k];
  const r = selectS583Events(merged as unknown as EventTimelineInput);
  if (r.status !== "COMPUTED") throw new Error(r.reason);
  return r;
};

describe("selectS583Events", () => {
  it("separates qualification month, s.72 start month and the 65th-birthday month", () => {
    const r = run({});
    expect(r.survivor65Month).toBe("2045-03");
    expect(r.hypotheticalQualificationMonth).toBe("2030-07");
    expect(r.hypotheticalS72StartMonthBeforeRetroLimit).toBe("2030-07");
    expect(r.eventB.status).toBe("MET");
    expect(r.eventA.status).toBe("NOT_MET"); // declared no disability
    expect(r.eventD.status).toBe("UNRESOLVED"); // (c) names survivor-pension commencement
  });

  it("December death rolls qualification into the next year", () => {
    const r = run({ deathMonth: "2030-12" });
    expect(r.hypotheticalQualificationMonth).toBe("2031-01");
  });

  it("(a) needs evidence of causation: later onset alone is UNRESOLVED (reviewer reproduction)", () => {
    // death 2030-06, born 1980-03, d(ii), no own pension, onset 2031-02.
    const r = run({ disabilityOnsetMonth: "2031-02" });
    expect(r.eventA.status).toBe("UNRESOLVED");
    expect(r.eventD.status).toBe("UNRESOLVED");
  });

  it("(a) with declared causation: MET under d(i), contradictory under d(ii), NOT_MET if declared false", () => {
    const young = {
      s44d1dRegime: "d(i)" as const,
      survivorBirthMonth: "2000-01",
      dependentChildAtDeath: false,
      disabilityOnsetMonth: "2031-02",
    };
    expect(run({ ...young, payableByReasonOfDisability: true }).eventA.status).toBe("MET");
    expect(run({ ...young, payableByReasonOfDisability: false }).eventA.status).toBe("NOT_MET");
    expect(
      run({ disabilityOnsetMonth: "2031-02", payableByReasonOfDisability: true }).eventA.status,
    ).toBe("UNRESOLVED"); // d(ii): s.72(b) already starts 2030-07
  });

  it("(a) onset before death is NOT_MET, same month UNRESOLVED", () => {
    expect(run({ disabilityOnsetMonth: "2029-01" }).eventA.status).toBe("NOT_MET");
    expect(run({ disabilityOnsetMonth: "2030-06" }).eventA.status).toBe("UNRESOLVED");
  });

  it("(a) distinguishes unknown onset from declared none", () => {
    expect(run({}, ["disabilityOnsetMonth"]).eventA.status).toBe("UNRESOLVED");
    expect(run({ disabilityOnsetMonth: null }).eventA.status).toBe("NOT_MET");
  });

  it("(b) is NOT_MET when 65 before the death and UNRESOLVED in the death month", () => {
    expect(run({ survivorBirthMonth: "1960-01" }).eventB.status).toBe("NOT_MET");
    expect(run({ survivorBirthMonth: "1965-06" }).eventB.status).toBe("UNRESOLVED");
    expect(run({ survivorBirthMonth: "1965-07" }).eventB.status).toBe("MET");
  });

  it("(d) fails closed when the regime or event (c) status is unknown", () => {
    expect(run({}, ["s44d1dRegime"]).eventD.status).toBe("UNRESOLVED");
    expect(run({}, ["ownRetirementCommencementMonth"]).eventD.status).toBe("UNRESOLVED");
    expect(run({ ownRetirementCommencementMonth: "2040-01" }).eventD.status).toBe("UNRESOLVED");
  });

  it("(d) under d(i) depends on age 35 or a dependent child", () => {
    const d1 = { s44d1dRegime: "d(i)" as const };
    expect(run({ ...d1 }).eventD.status).toBe("UNRESOLVED"); // 50; (c) not excluded
    const young = { ...d1, survivorBirthMonth: "2000-01" }; // 30
    expect(run({ ...young }).eventD.status).toBe("UNRESOLVED");
    expect(run({ ...young, dependentChildAtDeath: true }).eventD.status).toBe("UNRESOLVED");
    expect(run({ ...young, dependentChildAtDeath: false }).eventD.status).toBe("NOT_MET");
    expect(
      run({ ...young, dependentChildAtDeath: false }).hypotheticalS72StartMonthBeforeRetroLimit,
    ).toBeNull();
  });

  it("d(i) under 35, no child, disabled before death is not modelled", () => {
    const r = run({
      s44d1dRegime: "d(i)",
      survivorBirthMonth: "2000-01",
      dependentChildAtDeath: false,
      disabilityOnsetMonth: "2029-01",
    });
    expect(r.eventD.status).toBe("UNRESOLVED");
  });

  it("35th-birthday month equal to the death month is UNRESOLVED under d(i) without a child", () => {
    const r = run({
      s44d1dRegime: "d(i)",
      survivorBirthMonth: "1995-06",
      dependentChildAtDeath: false,
    });
    expect(r.eventD.status).toBe("UNRESOLVED");
  });

  it("(d) is never MET while (c) cannot be excluded", () => {
    for (const regime of ["d(i)", "d(ii)"] as const) {
      expect(run({ s44d1dRegime: regime }).eventD.status).not.toBe("MET");
    }
  });

  it("rejects malformed or impossible input", () => {
    for (const o of [
      { deathMonth: "2030-13" },
      { deathMonth: "2030-6" },
      { survivorBirthMonth: "2031-01" },
      { disabilityOnsetMonth: "1970-01" },
      { ownRetirementCommencementMonth: "soon" },
    ]) {
      expect(selectS583Events({ ...base, ...o }).status).toBe("INVALID_INPUT");
    }
  });
});
