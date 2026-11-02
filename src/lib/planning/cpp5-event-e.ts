/**
 * CPP-5 EXPERIMENTAL fail-closed selector for CPP Act s.58(3)(e) trigger timing. NOT a production
 * calculation; nothing in the app or engine may import it. Computes no dollars or ratios.
 *
 * Primary text read directly from Justice Laws on 2026-11-02 (Act current to 2026-09-30,
 * last amended 2024-12-17); a second-party verbatim check is still wanted:
 *  - s.55(7): where an application under s.55(1) "has been approved and a benefit is payable ...
 *    for any month commencing on or before the day of receipt of an application", the benefit is
 *    recalculated subject to the division "and the adjusted benefit shall be paid effective the
 *    month following the month the application ... is received".
 *  - s.55.2(9): where there is a division under s.55.1 and a benefit "is or becomes payable ... for
 *    a month not later than the month following the month in which the division takes place", the
 *    adjusted benefit "shall be paid effective the month following the month in which the division
 *    takes place but in no case shall a benefit that was not payable in the absence of the
 *    division be paid in respect of the month in which the division takes place or any prior month."
 * These are two distinct legal triggers and are never merged. The output is the statutory
 * "adjusted benefit effective" month ONLY. Whether that month is the month in which s.58(3)(e)
 * "occurs" (and what the s.58(3) factor then adjusts) is UNRESOLVED and is not decided here.
 * Approval/notification timing (s.62, s.55(8), s.55.2(10)) does not move the effective month and
 * is deliberately not an input. A CANDIDATE is a caller-declared research result, never entitlement.
 *
 * Provenance: `branch`, `adjustedBenefitIsSurvivorRetirementPension`, `applicationApproved` and
 * `benefitPayableAbsentDivision` are CALLER ASSERTIONS. No s.55 approval record or s.55.1 division
 * record is evidenced here, so a CANDIDATE carries provenance CALLER_DECLARED_UNVERIFIED and is
 * never promoted to a "MET" status by this module.
 *
 * s.55.2(9) final clause: no benefit that "was not payable in the absence of the division" may be
 * paid for the division month or any prior month. This module therefore never infers back pay or
 * historical entitlement; for s.55.2(9) it requires an explicit caller declaration
 * (`benefitPayableAbsentDivision`) and fails closed (UNRESOLVED) until one is given.
 *
 * Month range: inputs must be YYYY-MM within MIN_MONTH (1966-01, CPP in force) and MAX_MONTH
 * (2199-12). The range is a guard-rail against nonsensical or overflowing months (e.g. 9999-12 + 1
 * would be 10000-01, 0000-01 is not a pension month); it is not a statutory limit.
 */
export type MonthKey = string;

export type EventEBranch = "S55_7_BENEFIT_IN_PAY" | "S55_2_9_DIVISION_UNDER_55_1";

export interface EventEInput {
  readonly branch: EventEBranch;
  /** Caller declaration that the adjusted benefit is the SURVIVOR's retirement pension (s.58(3)(e)). */
  readonly adjustedBenefitIsSurvivorRetirementPension?: boolean | undefined;
  /** s.55(7) only: month the s.55(1) application was received. Must be omitted for s.55.2(9). */
  readonly applicationReceivedMonth?: MonthKey | undefined;
  /** s.55(7) only: caller declaration that the application was approved. */
  readonly applicationApproved?: boolean | undefined;
  /** s.55.2(9) only: month the s.55.1 division takes place. Must be omitted for s.55(7). */
  readonly divisionTakesPlaceMonth?: MonthKey | undefined;
  /**
   * s.55.2(9) only: caller declaration that the affected benefit would have been payable in the
   * absence of the division (so the final clause of s.55.2(9) does not bar it). Must be true.
   */
  readonly benefitPayableAbsentDivision?: boolean | undefined;
  /** First month for which the affected benefit is payable. Undefined = unknown. */
  readonly benefitFirstPayableMonth?: MonthKey | undefined;
}

export type EventEResult =
  | {
      readonly status: "CANDIDATE";
      readonly adjustedBenefitEffectiveMonth: MonthKey;
      readonly provenance: "CALLER_DECLARED_UNVERIFIED";
      readonly reason: string;
    }
  | { readonly status: "NOT_MET" | "UNRESOLVED"; readonly reason: string }
  | { readonly status: "INVALID_INPUT"; readonly reason: string };

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const MIN_MONTH = "1966-01";
export const MAX_MONTH = "2199-12";
const isMonth = (m: unknown): m is MonthKey =>
  typeof m === "string" && MONTH_RE.test(m) && m >= MIN_MONTH && m <= MAX_MONTH;
const idx = (m: string): number => {
  const h = MONTH_RE.exec(m)!;
  return Number(h[1]) * 12 + Number(h[2]) - 1;
};
const addMonths = (m: string, n: number): string => {
  const i = idx(m) + n;
  return `${String(Math.floor(i / 12)).padStart(4, "0")}-${String((i % 12) + 1).padStart(2, "0")}`;
};

export function selectS583EventE(input: EventEInput): EventEResult {
  const { branch } = input;
  if (branch !== "S55_7_BENEFIT_IN_PAY" && branch !== "S55_2_9_DIVISION_UNDER_55_1")
    return { status: "INVALID_INPUT", reason: "branch must name exactly one statutory trigger" };
  for (const [k, v] of [
    ["applicationReceivedMonth", input.applicationReceivedMonth],
    ["divisionTakesPlaceMonth", input.divisionTakesPlaceMonth],
    ["benefitFirstPayableMonth", input.benefitFirstPayableMonth],
  ] as const) {
    if (v !== undefined && !isMonth(v))
      return {
        status: "INVALID_INPUT",
        reason: `${k} must be YYYY-MM within ${MIN_MONTH}..${MAX_MONTH} or omitted`,
      };
  }
  const is57 = branch === "S55_7_BENEFIT_IN_PAY";
  const own = is57 ? input.applicationReceivedMonth : input.divisionTakesPlaceMonth;
  const foreign = is57 ? input.divisionTakesPlaceMonth : input.applicationReceivedMonth;
  if (foreign !== undefined)
    return {
      status: "UNRESOLVED",
      reason: "inputs for the other statutory branch supplied; the two triggers are never merged",
    };
  if (input.adjustedBenefitIsSurvivorRetirementPension !== true)
    return {
      status: "UNRESOLVED",
      reason: "adjusted benefit not declared to be the survivor's retirement pension",
    };
  if (own === undefined)
    return {
      status: "UNRESOLVED",
      reason: is57 ? "application receipt month unknown" : "division month unknown",
    };
  if (input.benefitFirstPayableMonth === undefined)
    return { status: "UNRESOLVED", reason: "first payable month of the affected benefit unknown" };
  const payable = idx(input.benefitFirstPayableMonth);
  if (is57) {
    if (input.applicationApproved !== true)
      return { status: "UNRESOLVED", reason: "s.55(7) requires an approved application" };
    // "for any month commencing on or before the day of receipt": payable month <= receipt month.
    if (payable > idx(own))
      return {
        status: "NOT_MET",
        reason:
          "benefit not payable for a month on or before application receipt; s.55(7) not engaged",
      };
    return {
      status: "CANDIDATE",
      adjustedBenefitEffectiveMonth: addMonths(own, 1),
      provenance: "CALLER_DECLARED_UNVERIFIED",
      reason:
        "s.55(7): adjusted benefit effective the month after application receipt (research only)",
    };
  }
  if (input.benefitPayableAbsentDivision !== true)
    return {
      status: "UNRESOLVED",
      reason:
        "s.55.2(9) bars a benefit not payable absent the division; payability absent the division not declared",
    };
  // s.55.2(9): payable "for a month not later than the month following" the division month.
  if (payable > idx(own) + 1)
    return {
      status: "NOT_MET",
      reason:
        "benefit first payable later than the month after the division; s.55.2(9) not engaged",
    };
  return {
    status: "CANDIDATE",
    adjustedBenefitEffectiveMonth: addMonths(own, 1),
    provenance: "CALLER_DECLARED_UNVERIFIED",
    reason:
      "s.55.2(9): adjusted benefit effective the month after the division takes place (research only)",
  };
}
