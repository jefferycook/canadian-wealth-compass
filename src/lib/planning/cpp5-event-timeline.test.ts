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
  disabilityOnsetMonth: null,
  eventCRuledOut: true, // caller-declared; NOT inferred from "no own pension"
  contributorMinimumContributionsMet: true,
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
    expect(r.qualificationMonth).toBe("2030-07");
    expect(r.s72StartMonthBeforeRetroLimit).toBe("2030-07");
    expect(r.eventB.status).toBe("MET");
    expect(r.eventA.status).toBe("NOT_MET");
    expect(r.eventD.status).toBe("MET");
    expect(r.scheduleBasis).toBe("HYPOTHETICAL_SCHEDULE_NOT_ESTABLISHED_ENTITLEMENT");
  });

  it("no schedule months are reported unless minimum contributions are declared met", () => {
    for (const omit of [["contributorMinimumContributionsMet" as const], []]) {
      const r = run(omit.length ? {} : { contributorMinimumContributionsMet: false }, omit);
      expect(r.qualificationMonth).toBeNull();
      expect(r.s72StartMonthBeforeRetroLimit).toBeNull();
      expect(r.survivor65Month).toBe("2045-03"); // purely mechanical birthday stays
    }
  });

  it("December death rolls qualification into the next year", () => {
    const r = run({ deathMonth: "2030-12" });
    expect(r.qualificationMonth).toBe("2031-01");
  });

  it("(a) needs causation evidence: a post-death onset alone is UNRESOLVED (reviewer reproduction)", () => {
    const r = run({ disabilityOnsetMonth: "2031-02" });
    expect(r.eventA.status).toBe("UNRESOLVED");
    // the survivor pension would already start 2030-07 under the declared d(ii) regime
    expect(r.s72StartMonthBeforeRetroLimit).toBe("2030-07");
    expect(
      run({ disabilityOnsetMonth: "2031-02", survivorPensionPayableByReasonOfDisability: true })
        .eventA.status,
    ).toBe("MET");
    expect(
      run({ disabilityOnsetMonth: "2031-02", survivorPensionPayableByReasonOfDisability: false })
        .eventA.status,
    ).toBe("NOT_MET");
  });

  it("(a) is NOT_MET for onset before the death, UNRESOLVED in the death month", () => {
    expect(run({ disabilityOnsetMonth: "2029-01" }).eventA.status).toBe("NOT_MET");
    expect(run({ disabilityOnsetMonth: "2030-06" }).eventA.status).toBe("UNRESOLVED");
  });

  it("(a) distinguishes declared-no-disability (null) from unknown (omitted)", () => {
    expect(run({ disabilityOnsetMonth: null }).eventA.status).toBe("NOT_MET");
    expect(run({}, ["disabilityOnsetMonth"]).eventA.status).toBe("UNRESOLVED");
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

  it("(d) is never MET from 'no own pension' alone; (c) must be declared ruled out", () => {
    expect(run({ eventCRuledOut: false }).eventD.status).toBe("UNRESOLVED");
    expect(run({}, ["eventCRuledOut"]).eventD.status).toBe("UNRESOLVED");
    expect(run({ eventCRuledOut: true }).eventD.status).toBe("MET");
  });

  it("(d) under d(i) depends on age 35 or a dependent child", () => {
    const d1 = { s44d1dRegime: "d(i)" as const };
    expect(run({ ...d1 }).eventD.status).toBe("MET"); // 50
    const young = { ...d1, survivorBirthMonth: "2000-01" }; // 30
    expect(run({ ...young }).eventD.status).toBe("UNRESOLVED");
    expect(run({ ...young, dependentChildAtDeath: true }).eventD.status).toBe("MET");
    expect(run({ ...young, dependentChildAtDeath: false }).eventD.status).toBe("NOT_MET");
    expect(
      run({ ...young, dependentChildAtDeath: false }).s72StartMonthBeforeRetroLimit,
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
