/**
 * CPP-5 EXPERIMENTAL fail-closed selector for CPP Act s.58(3)(c). NOT a production
 * calculation; nothing in the app or engine may import it. Computes no dollars or ratios.
 *
 * Reading (from Justice Laws s.58(3)(c) as paraphrased by the fetch tool; NOT verified
 * verbatim): event (c) is the commencement of the survivor's pension under the Act, or of the
 * survivor's retirement pension under the Act or a provincial plan, "whichever is the later".
 * Open questions that this module deliberately does NOT settle:
 *  - whether (c) applies when only ONE of the two pensions exists;
 *  - whether the "whichever is the later" ordering is month-granular;
 *  - how a provincial-plan commencement is evidenced.
 * Therefore a later-of month is reported only when BOTH commencements are supplied; every
 * absent or one-sided input returns UNRESOLVED. A CANDIDATE is a caller-declared research
 * ordering, never established entitlement.
 */
export type MonthKey = string;
export type CommencementDecl = MonthKey | null | undefined; // month | declared none | unknown

export interface EventCInput {
  readonly survivorPensionCommencementMonth: CommencementDecl;
  readonly ownRetirementCommencementMonth: CommencementDecl;
  readonly provincialRetirementCommencementMonth: CommencementDecl;
}

export type EventCResult =
  | { readonly status: "CANDIDATE"; readonly laterMonth: MonthKey; readonly reason: string }
  | { readonly status: "NOT_MET" | "UNRESOLVED"; readonly reason: string }
  | { readonly status: "INVALID_INPUT"; readonly reason: string };

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const idx = (m: string): number => {
  const h = MONTH_RE.exec(m)!;
  return Number(h[1]) * 12 + Number(h[2]) - 1;
};
const valid = (d: CommencementDecl): boolean =>
  d === undefined || d === null || (typeof d === "string" && MONTH_RE.test(d));

export function selectS583EventC(input: EventCInput): EventCResult {
  const { survivorPensionCommencementMonth: sp, ownRetirementCommencementMonth: own } = input;
  const prov = input.provincialRetirementCommencementMonth;
  for (const [k, v] of [
    ["survivorPensionCommencementMonth", sp],
    ["ownRetirementCommencementMonth", own],
    ["provincialRetirementCommencementMonth", prov],
  ] as const) {
    if (!valid(v))
      return { status: "INVALID_INPUT", reason: `${k} must be YYYY-MM, null or omitted` };
  }
  if (sp === undefined)
    return { status: "UNRESOLVED", reason: "survivor pension commencement unknown" };
  if (sp === null) return { status: "NOT_MET", reason: "declared: no survivor pension commences" };
  if (own === undefined)
    return { status: "UNRESOLVED", reason: "own CPP retirement commencement unknown" };
  if (prov === undefined)
    return { status: "UNRESOLVED", reason: "provincial-plan retirement data absent" };
  if (own === null && prov === null)
    return {
      status: "UNRESOLVED",
      reason:
        "no retirement pension declared; whether (c) applies to the survivor pension alone is unresolved",
    };
  if (own !== null && prov !== null)
    return {
      status: "UNRESOLVED",
      reason:
        "both a CPP and a provincial retirement pension declared; which one (c) means is unresolved",
    };
  const ret = (own ?? prov) as MonthKey;
  const later = idx(sp) >= idx(ret) ? sp : ret;
  return {
    status: "CANDIDATE",
    laterMonth: later,
    reason:
      "caller-declared later-of ordering of survivor and retirement commencement (research only)",
  };
}
