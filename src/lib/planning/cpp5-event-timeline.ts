/**
 * CPP-5 EXPERIMENTAL month-timeline selector for CPP Act s.58(3) events (a), (b) and (d).
 * NOT a production calculation. Nothing in the app, the projection engine or
 * `benefits.ts` may import this module. It computes no dollar amounts and no ratios.
 *
 * Predicates follow the s.58(3) wording read directly from Justice Laws (see
 * docs/CPP-5-S58-3-EVENT-MATRIX.md): (a) survivor's pension payable by reason of a
 * disability that began after the contributor's death; (b) survivor reached 65, not having
 * reached that age at the death; (d) survivor's pension payable in circumstances other
 * than (a), (b) or (c). Event (c) is modelled only as a fail-closed ordering of two
 * caller-declared ACTUAL commencement months; event (e) is not modelled.
 *
 * The month in which an event "occurs" is NOT settled by the Act text (entitlement month vs
 * the month before the first paid month vs the triggering month), so `eventMonth` is never
 * reported. The s.58(9) qualification month and the s.72 start month are reported as
 * separate, labelled fields because they are different data. Anything that depends on an
 * unresolved reading returns UNRESOLVED with a reason instead of a guess.
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
  /** Month the survivor's disability began: a month, null = declared no disability, omitted = unknown. */
  readonly disabilityOnsetMonth?: MonthKey | null;
  /** Declared evidence that the survivor pension actually became payable BY REASON OF that
   *  disability (s.58(3)(a)). Omitted = unknown. Onset after the death is not enough by itself. */
  readonly payableByReasonOfDisability?: boolean;
  /** Declared s.44(1)(d) limb; omitted means unknown. */
  readonly s44d1dRegime?: S44d1dRegime;
  /** Survivor had a dependent child at the death (needed under d(i) when under 35). */
  readonly dependentChildAtDeath?: boolean;
  /** Survivor's own retirement pension commencement: a month, null = declared none, omitted = unknown. */
  readonly ownRetirementCommencementMonth?: MonthKey | null;
  /** Caller-declared ACTUAL month the survivor pension commenced to be payable (s.58(3)(c)):
   *  a month, null = declared never commenced, omitted = unknown. Not derived from the
   *  hypothetical s.72 schedule. */
  readonly survivorPensionCommencementMonth?: MonthKey | null;
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
  /** HYPOTHETICAL schedule, not an established fact: s.58(9) month following the month the
   *  s.44(1) criteria would first be met IF the survivor is entitled (contributor's minimum
   *  contributions, application, approval are not evidenced here). null when unknown. */
  readonly hypotheticalQualificationMonth: MonthKey | null;
  /** HYPOTHETICAL s.72 branch start month before the 12-month application limit and before any
   *  entitlement/approval evidence. It is not the actual first payable month. null when unknown. */
  readonly hypotheticalS72StartMonthBeforeRetroLimit: MonthKey | null;
  readonly eventA: EventSelection;
  readonly eventB: EventSelection;
  /** Caller-declared ordering of the two commencements named in s.58(3)(c). */
  readonly eventC: EventSelection & { readonly laterCommencement: EventCLater | null };
  readonly eventD: EventSelection;
}

/** Which declared commencement is the later one; a same-month tie is reported as such. */
export type EventCLater = "SURVIVOR_PENSION" | "OWN_RETIREMENT_PENSION" | "SAME_MONTH";

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
  const surv = input.survivorPensionCommencementMonth;
  let survIdx: number | null = null;
  if (surv !== undefined && surv !== null) {
    survIdx = toIndex(surv);
    if (survIdx === null)
      return bad("survivorPensionCommencementMonth must be a valid YYYY-MM or null");
    if (survIdx <= death)
      return bad("survivor pension cannot commence in or before the contributor's death month");
  }
  const ownIdx = own === undefined || own === null ? null : toIndex(own);
  const regime = input.s44d1dRegime;
  if (regime !== undefined && regime !== "d(i)" && regime !== "d(ii)")
    return bad("unknown s44d1dRegime");

  const turns65 = birth + 65 * 12;

  // Event (a): disability began after the death.
  let eventA: EventSelection;
  if (input.disabilityOnsetMonth === undefined) {
    eventA = sel("UNRESOLVED", "disability onset unknown (not the same as declared none)");
  } else if (onset === null) {
    eventA = sel("NOT_MET", "declared no disability");
  } else if (onset === death) {
    eventA = sel("UNRESOLVED", "onset in the death month cannot be ordered at month granularity");
  } else if (onset > death) {
    if (input.payableByReasonOfDisability === undefined) {
      eventA = sel(
        "UNRESOLVED",
        "disability began after the death, but no evidence the survivor pension became payable by reason of it",
      );
    } else if (input.payableByReasonOfDisability === false) {
      eventA = sel("NOT_MET", "declared: pension not payable by reason of the later disability");
    } else if (regime === undefined) {
      eventA = sel(
        "UNRESOLVED",
        "declared payable by reason of disability, but the s.44(1)(d) limb is unknown so the earlier s.72 start cannot be excluded",
      );
    } else if (regime === "d(ii)") {
      eventA = sel(
        "UNRESOLVED",
        "declared payable by reason of disability, but under d(ii) s.72(b) already starts the month after death",
      );
    } else if (death >= 2019 * 12) {
      eventA = sel(
        "UNRESOLVED",
        "d(i) declared for a death in 2019 or later; the keying of the 'before 2019' limb is unresolved, so the combination is not trusted",
      );
    } else if (onset >= turns65) {
      eventA = sel(
        "UNRESOLVED",
        "disability onset at or after the survivor's 65th birthday month; combination not modelled",
      );
    } else if (death - birth === 35 * 12) {
      eventA = sel(
        "UNRESOLVED",
        "35th-birthday month equals the death month; day-level order is unknown, so an earlier s.72(a)(i) start is not excluded",
      );
    } else if (death - birth > 35 * 12 || input.dependentChildAtDeath === true) {
      eventA = sel(
        "UNRESOLVED",
        "contradictory history: under d(i) a survivor over 35 (or with a dependent child) is already entitled from the month after death, so a later disability cannot be the cause",
      );
    } else if (input.dependentChildAtDeath === undefined) {
      eventA = sel(
        "UNRESOLVED",
        "under 35 at death: dependent-child status needed to exclude an earlier s.72(a)(i) start",
      );
    } else {
      eventA = sel(
        "MET",
        "d(i), under 35, no dependent child, disability began after the death and the pension is declared payable by reason of it (caller declaration; entitlement not evidenced)",
      );
    }
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

  // Event (c): the later of the survivor pension's and the survivor's own retirement pension's
  // commencement (CPP or provincial). Only an ordering of two declared months is computed. How
  // (c) interacts with (a)/(b) when several occur, the event month convention, and the case
  // where only one pension exists are unresolved, so those never yield MET or NOT_MET.
  const cSel = (
    status: EventStatus,
    reason: string,
    laterCommencement: EventCLater | null = null,
  ) => ({ ...sel(status, reason), laterCommencement });
  let eventC: EventTimelineComputed["eventC"];
  if (surv === undefined || own === undefined) {
    eventC = cSel("UNRESOLVED", "a commencement month is unknown (not the same as declared none)");
  } else if (surv === null || own === null) {
    eventC = cSel(
      "UNRESOLVED",
      "only one of the two pensions has commenced; how 'whichever is the later' applies is unresolved",
    );
  } else if (ownIdx! < birth + 60 * 12) {
    eventC = cSel(
      "UNRESOLVED",
      "own retirement commencement before the survivor's 60th birthday month; not modelled",
    );
  } else {
    const later: EventCLater =
      survIdx! === ownIdx!
        ? "SAME_MONTH"
        : survIdx! > ownIdx!
          ? "SURVIVOR_PENSION"
          : "OWN_RETIREMENT_PENSION";
    eventC = cSel(
      "UNRESOLVED",
      "ordering of the two declared commencements is reported only; whether (c) governs when (a) or (b) also holds, and the event month, are unresolved",
      later,
    );
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
      "s.58(3)(c) also names commencement of the survivor pension itself; absence of an own pension does not exclude it",
    );
  } else if (eq35 && input.dependentChildAtDeath !== true) {
    eventD = sel(
      "UNRESOLVED",
      "35th-birthday month equals the death month; day-level order is unknown",
    );
  } else if (ge35 || input.dependentChildAtDeath === true) {
    eventD = sel(
      "UNRESOLVED",
      "s.58(3)(c) also names commencement of the survivor pension itself; (c) vs (d) is not excluded",
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
    hypotheticalQualificationMonth: qualification,
    hypotheticalS72StartMonthBeforeRetroLimit: s72Start,
    eventA,
    eventB,
    eventC,
    eventD,
  };
}
