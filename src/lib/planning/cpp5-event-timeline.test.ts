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

  it("(a) with declared causation: MET only for a consistent pre-2019 d(i) history", () => {
    const young = {
      deathMonth: "2018-06",
      s44d1dRegime: "d(i)" as const,
      survivorBirthMonth: "2000-01", // 18 at death
      dependentChildAtDeath: false,
      disabilityOnsetMonth: "2019-02",
    };
    expect(run({ ...young, payableByReasonOfDisability: true }).eventA.status).toBe("MET");
    expect(run({ ...young, payableByReasonOfDisability: false }).eventA.status).toBe("NOT_MET");
    expect(
      run({ disabilityOnsetMonth: "2031-02", payableByReasonOfDisability: true }).eventA.status,
    ).toBe("UNRESOLVED"); // d(ii): s.72(b) already starts 2030-07
  });

  it("(a) adversarial: a bare causation declaration is not trusted when entitlement timing contradicts it", () => {
    const ok = {
      deathMonth: "2018-06",
      s44d1dRegime: "d(i)" as const,
      survivorBirthMonth: "2000-01",
      dependentChildAtDeath: false,
      disabilityOnsetMonth: "2019-02",
      payableByReasonOfDisability: true,
    };
    // reviewer example: d(i), over 35 at death, later disability, declared causation
    expect(run({ ...ok, survivorBirthMonth: "1970-01" }).eventA.status).toBe("UNRESOLVED");
    // dependent child at death: entitled from the month after death
    expect(run({ ...ok, dependentChildAtDeath: true }).eventA.status).toBe("UNRESOLVED");
    // dependent-child status unknown
    expect(run({ ...ok }, ["dependentChildAtDeath"]).eventA.status).toBe("UNRESOLVED");
    // regime undeclared
    expect(run({ ...ok }, ["s44d1dRegime"]).eventA.status).toBe("UNRESOLVED");
    // d(i) with a 2019+ death is an unresolved keying combination
    expect(
      run({ ...ok, deathMonth: "2030-06", disabilityOnsetMonth: "2031-02" }).eventA.status,
    ).toBe("UNRESOLVED");
    // 35th-birthday month equals death month
    expect(run({ ...ok, deathMonth: "2018-06", survivorBirthMonth: "1983-06" }).eventA.status).toBe(
      "UNRESOLVED",
    );
    // onset at/after 65th-birthday month: the survivor is 68 at death (65th birthday 2015-01)
    // and 69 at onset, so the age-65 branch is the one selected (checked via its reason text).
    const at65 = run({ ...ok, survivorBirthMonth: "1950-01" }).eventA;
    expect(at65.status).toBe("UNRESOLVED");
    expect(at65.reason).toContain("65th birthday month");
    // boundary: onset exactly in the 65th-birthday month (born 1953-10, 65 in 2018-10, death 2018-06)
    const exact = run({
      ...ok,
      survivorBirthMonth: "1953-10",
      disabilityOnsetMonth: "2018-10",
    }).eventA;
    expect(exact.status).toBe("UNRESOLVED");
    expect(exact.reason).toContain("65th birthday month");
    // one month earlier the age-65 branch is not taken; the over-35 contradiction guard is
    const before = run({
      ...ok,
      survivorBirthMonth: "1953-10",
      disabilityOnsetMonth: "2018-09",
    }).eventA;
    expect(before.status).toBe("UNRESOLVED");
    expect(before.reason).toContain("contradictory history");
    // onset in the death month cannot be ordered
    expect(run({ ...ok, disabilityOnsetMonth: "2018-06" }).eventA.status).toBe("UNRESOLVED");
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

  describe("event (c): ordering of declared commencements (never MET/NOT_MET)", () => {
    const both = {
      survivorPensionCommencementMonth: "2030-07",
      ownRetirementCommencementMonth: "2040-03",
    };

    it("survivor pension later than own retirement pension", () => {
      const r = run({
        ownRetirementCommencementMonth: "2040-03",
        survivorPensionCommencementMonth: "2041-01",
        deathMonth: "2030-06",
      });
      expect(r.eventC.laterCommencement).toBe("SURVIVOR_PENSION");
      expect(r.eventC.status).toBe("UNRESOLVED");
    });

    it("own retirement pension later than survivor pension", () => {
      const r = run(both);
      expect(r.eventC.laterCommencement).toBe("OWN_RETIREMENT_PENSION");
      expect(r.eventC.status).toBe("UNRESOLVED");
    });

    it("same month is reported as a tie, not ordered", () => {
      const r = run({
        survivorPensionCommencementMonth: "2040-03",
        ownRetirementCommencementMonth: "2040-03",
      });
      expect(r.eventC.laterCommencement).toBe("SAME_MONTH");
    });

    it("unknown commencement is not treated as declared none", () => {
      const r = run({ ownRetirementCommencementMonth: "2040-03" }); // survivor commencement omitted
      expect(r.eventC.laterCommencement).toBeNull();
      expect(r.eventC.reason).toMatch(/unknown/);
    });

    it("one pension only stays UNRESOLVED with no ordering (whichever-later case unresolved)", () => {
      const a = run({
        survivorPensionCommencementMonth: "2030-07",
        ownRetirementCommencementMonth: null,
      });
      const b = run({
        survivorPensionCommencementMonth: null,
        ownRetirementCommencementMonth: "2040-03",
      });
      for (const r of [a, b]) {
        expect(r.eventC.status).toBe("UNRESOLVED");
        expect(r.eventC.laterCommencement).toBeNull();
        expect(r.eventC.reason).toMatch(/only one/);
      }
    });

    it("does not change (d): a declared own pension still leaves (d) UNRESOLVED", () => {
      expect(run(both).eventD.status).toBe("UNRESOLVED");
    });

    it("rejects a survivor pension commencing in or before the death month", () => {
      for (const m of ["2030-06", "2029-12"]) {
        const r = selectS583Events({ ...base, survivorPensionCommencementMonth: m });
        expect(r.status).toBe("INVALID_INPUT");
      }
      expect(
        selectS583Events({ ...base, survivorPensionCommencementMonth: "2030-13" }).status,
      ).toBe("INVALID_INPUT");
    });

    it("own retirement commencement before the 60th birthday month is not modelled", () => {
      // born 1980-03 => 60th birthday month 2040-03; 2040-02 is earlier
      const r = run({
        survivorPensionCommencementMonth: "2030-07",
        ownRetirementCommencementMonth: "2040-02",
      });
      expect(r.eventC.status).toBe("UNRESOLVED");
      expect(r.eventC.laterCommencement).toBeNull();
      expect(
        run({
          survivorPensionCommencementMonth: "2030-07",
          ownRetirementCommencementMonth: "2040-03",
        }).eventC.laterCommencement,
      ).toBe("OWN_RETIREMENT_PENSION");
    });
  });
});
