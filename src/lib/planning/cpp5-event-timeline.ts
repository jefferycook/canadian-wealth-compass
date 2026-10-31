/**
 * CPP-5 EXPERIMENTAL month-timeline selector for CPP Act s.58(3) events (a), (b) and (d).
 * NOT a production calculation. Nothing in the app, the projection engine or
 * `benefits.ts` may import this module. It computes no dollar amounts and no ratios.
 *
 * Predicates follow the s.58(3) wording read directly from Justice Laws (see
 * docs/CPP-5-S58-3-EVENT-MATRIX.md): (a) survivor's pension payable by reason of a
 * disability that began after the contributor's death; (b) survivor reached 65, not having
 * reached that age at the death; (d) survivor's pension payable in circumstances other
 * than (a), (b) or (c). Event (c) and (e) are not modelled.
 *
 * The month in which an event "occurs" is NOT settled by the Act text (entitlement month vs
 * the month before the first paid month vs the triggering month), so `eventMonth` is never
 * reported. The s.58(9) qualification month and the s.72 start month are reported as
 * separate, labelled fields because they are different data. Anything that depends on an
 * unresolved reading returns UNRESOLVED with a reason instead of a guess.
 *
 * Event (d) is never reported MET: s.58(3)(c) names the commencement of the survivor pension
 * itself, so exclusion of (c) needs a verified statutory reading. qualificationMonth and
 * s72StartMonthBeforeRetroLimit are HYPOTHETICAL schedules that assume entitlement (minimum
 * contributions) and an approved application; they are not established beneficiary facts.
 *
 * Granularity is the calendar month. A same-month coincidence (for example disability onset
 * in the death month) cannot be ordered at month granularity and is UNRESOLVED.
 */

/** "YYYY-MM" */
export type MonthKey = string;

/** Which limb of s.44(1)(d) governs. Its keying ("before 2019" / "after 2018") is unresolved,
 *  so the caller must declare it; it is never inferred from dates. */
export type S44d1dRegime = "d(i)" | "d(ii)";

export interface EventTimelineInput {
  readonly deathMonth: MonthKey;
  readonly survivorBirthMonth: MonthKey;
  /** Month the survivor's disability began: a month, null = declared none, omitted = unknown. */
  readonly disabilityOnsetMonth?: MonthKey | null;
  /** Evidence that the survivor pension became payable BY REASON OF that disability (s.58(3)(a)).
   *  Omitted or false leaves event (a) UNRESOLVED; a later onset alone is not proof of cause. */
  readonly payableByReasonOfDisability?: boolean;
  /** Declared s.44(1)(d) limb; omitted means unknown. */
  readonly s44d1dRegime?: S44d1dRegime;
  /** Survivor had a dependent child at the death (needed under d(i) when under 35). */
  readonly dependentChildAtDeath?: boolean;
  /** Survivor's own retirement pension commencement: a month, null = declared none, omitted = unknown. */
  readonly ownRetirementCommencementMonth?: MonthKey | null;
}

export type EventStatus = "MET" | "NOT_MET" | "UNRESOLVED";

export interface EventSelection {
  readonly status: EventStatus;
  readonly reason: string;
  readonly citation: string;
}

export interface EventTimelineComputed {
  readonly status: "COMPUTED";
  /** Month the survivor turns 65 (birth month + 780 months). */
  readonly survivor65Month: MonthKey;
  /** s.58(9): month following the month the s.44(1) criteria were first met; null when unknown. */
  readonly qualificationMonth: MonthKey | null;
  /** s.72 branch start month before the 12-month application limit; null when unknown. */
  readonly s72StartMonthBeforeRetroLimit: MonthKey | null;
  readonly eventA: EventSelection;
  readonly eventB: EventSelection;
  readonly eventD: EventSelection;
}

export interface EventTimelineInvalid {
  readonly status: "INVALID_INPUT";
  readonly reason: string;
  readonly citation: string;
}

export type EventTimelineResult = EventTimelineComputed | EventTimelineInvalid;

const CITE = "CPP Act s.58(3), s.58(9), s.72, s.44(1)(d)";
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function toIndex(m: unknown): number | null {
  if (typeof m !== "string") return null;
  const hit = MONTH_RE.exec(m);
  if (!hit) return null;
  return Number(hit[1]) * 12 + Number(hit[2]) - 1;
}

function fromIndex(i: number): MonthKey {
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

const sel = (status: EventStatus, reason: string): EventSelection => ({
  status,
  reason,
  citation: CITE,
});

export function selectS583Events(input: EventTimelineInput): EventTimelineResult {
  const bad = (reason: string): EventTimelineInvalid => ({
    status: "INVALID_INPUT",
    reason,
    citation: CITE,
  });
  const death = toIndex(input.deathMonth);
  const birth = toIndex(input.survivorBirthMonth);
  if (death === null) return bad("deathMonth must be a valid YYYY-MM");
  if (birth === null) return bad("survivorBirthMonth must be a valid YYYY-MM");
  if (birth > death) return bad("survivor cannot be born after the contributor's death");
  let onset: number | null = null;
  if (input.disabilityOnsetMonth !== undefined && input.disabilityOnsetMonth !== null) {
    onset = toIndex(input.disabilityOnsetMonth);
    if (onset === null) return bad("disabilityOnsetMonth must be a valid YYYY-MM");
    if (onset < birth) return bad("disability cannot begin before the survivor's birth");
  }
  const own = input.ownRetirementCommencementMonth;
  if (own !== undefined && own !== null && toIndex(own) === null) {
    return bad("ownRetirementCommencementMonth must be a valid YYYY-MM or null");
  }
  const regime = input.s44d1dRegime;
  if (regime !== undefined && regime !== "d(i)" && regime !== "d(ii)")
    return bad("unknown s44d1dRegime");

  const turns65 = birth + 65 * 12;

  // Event (a): disability began after the death.
  let eventA: EventSelection;
  if (input.disabilityOnsetMonth === undefined) {
    eventA = sel(
      "UNRESOLVED",
      "disability onset unknown (omitted is not the same as declared none)",
    );
  } else if (onset === null) {
    eventA = sel("NOT_MET", "declared no disability");
  } else if (onset === death) {
    eventA = sel("UNRESOLVED", "onset in the death month cannot be ordered at month granularity");
  } else if (onset > death) {
    eventA =
      input.payableByReasonOfDisability === true
        ? sel(
            "MET",
            "disability began after the death and the pension is declared payable by reason of it",
          )
        : sel(
            "UNRESOLVED",
            "disability began after the death, but causation of payability is not evidenced (s.72(b) may already start the pension)",
          );
  } else {
    eventA = sel("NOT_MET", "disability began on or before the death month");
  }

  // Event (b): reaches 65 after the death.
  let eventB: EventSelection;
  if (turns65 === death) {
    eventB = sel(
      "UNRESOLVED",
      "65th birthday month equals the death month; day-level order is unknown",
    );
  } else if (turns65 > death) {
    eventB = sel("MET", "survivor had not reached 65 at the death and reaches it in a later month");
  } else {
    eventB = sel("NOT_MET", "survivor had already reached 65 at the death");
  }

  // s.72 start month and s.58(9) qualification month (separate, labelled fields).
  let s72Start: MonthKey | null = null;
  let qualification: MonthKey | null = null;
  const ageAtDeathMonths = death - birth;
  const ge35 = ageAtDeathMonths > 35 * 12; // month granularity: strictly past the 35th-birthday month
  const eq35 = ageAtDeathMonths === 35 * 12;
  if (regime === "d(ii)") {
    s72Start = fromIndex(death + 1);
    qualification = fromIndex(death + 1);
  } else if (regime === "d(i)" && (ge35 || input.dependentChildAtDeath === true)) {
    s72Start = fromIndex(death + 1);
    qualification = fromIndex(death + 1);
  }

  // Event (d): residual, needs (c) to be excluded.
  let eventD: EventSelection;
  if (regime === undefined) {
    eventD = sel("UNRESOLVED", "s.44(1)(d) limb not declared; its keying is unresolved");
  } else if (own === undefined) {
    eventD = sel(
      "UNRESOLVED",
      "own retirement pension status unknown, so event (c) cannot be excluded",
    );
  } else if (own !== null) {
    eventD = sel(
      "UNRESOLVED",
      "own retirement pension exists; the (c) 'whichever is later' ordering is not modelled",
    );
  } else if (regime === "d(ii)") {
    eventD = sel(
      "UNRESOLVED",
      "d(ii): (c) also names the survivor pension's own commencement, so (c) cannot be excluded without a verified reading",
    );
  } else if (eq35 && input.dependentChildAtDeath !== true) {
    eventD = sel(
      "UNRESOLVED",
      "35th-birthday month equals the death month; day-level order is unknown",
    );
  } else if (ge35 || input.dependentChildAtDeath === true) {
    eventD = sel(
      "UNRESOLVED",
      "d(i): payable from the month after the death, but (c) cannot be excluded without a verified reading",
    );
  } else if (input.dependentChildAtDeath === undefined) {
    eventD = sel("UNRESOLVED", "under 35 at death: dependent-child status needed");
  } else if (onset !== null && onset <= death) {
    eventD = sel(
      "UNRESOLVED",
      "d(i), under 35, no dependent child, disabled at or before death: s.72(a)(ii) branch not modelled",
    );
  } else if (turns65 > death || (onset !== null && onset > death)) {
    eventD = sel(
      "NOT_MET",
      "d(i), under 35 and no dependent child: payable only via later disability or age 65, i.e. (a)/(b)",
    );
  } else {
    eventD = sel("UNRESOLVED", "d(i), under 35, no dependent child, already 65: not reachable");
  }

  return {
    status: "COMPUTED",
    survivor65Month: fromIndex(turns65),
    qualificationMonth: qualification,
    s72StartMonthBeforeRetroLimit: s72Start,
    eventA,
    eventB,
    eventD,
  };
}
