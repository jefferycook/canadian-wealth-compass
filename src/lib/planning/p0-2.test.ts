import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { whatIfRetirementAgeMinimum } from "@/components/plan/PlanWhatIf";
import { goalProgress } from "./analysis";
import { ageFromDob, effectiveCurrentAge } from "./ages";
import { isPlanReady, missingRequiredInputs } from "./defaults";
import { draftFromInputs, normalizeDraft, type PersonDraft, type PlanDraft } from "./draft";
import { runPlan } from "./engine";
import { regressionFixturePlan } from "./fixtures";
import {
  patchToDraft,
  runScenario,
  scenarioInputs,
  type ScenarioPatch,
} from "./scenario";
import {
  parseStoredScenario,
  SCENARIO_SCHEMA_VERSION,
  serializeScenarioPatch,
} from "./scenario-persist";
import type { AccountInput, AccountType, PlanInputs } from "./types";

const localDate = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12, 0, 0);

function setToday(year: number, month: number, day: number): void {
  vi.setSystemTime(localDate(year, month, day));
}

function staleDraft(): PlanDraft {
  const input = regressionFixturePlan();
  return draftFromInputs({
    ...input,
    strategy: "nonreg_reg_tfsa",
    endAge: 75,
    inflation: 0,
    currentSpend: 40000,
    spendNeed: 60000,
    people: [
      {
        ...input.people[0]!,
        dob: "1966-09-15",
        curAge: 59,
        retAge: 65,
        employ: 50000,
        deathAge: 0,
        cpp: { amt: 12000, age: 65 },
        oas: { amt: 9000, age: 65 },
        pen: { amt: 12000, age: 67 },
        bridge: { amt: 6000, end: 67 },
      },
    ],
    expenses: [],
    lumpSums: [],
    otherIncome: [],
    hardAssets: [],
    liabilities: [],
  });
}

function runDraft(draft: PlanDraft, startYear = 2026) {
  const inputs = normalizeDraft(draft);
  return { inputs, result: runPlan(inputs, { startYear }) };
}

function conversionPlan(type: Extract<AccountType, "RRSP" | "LIRA">): PlanInputs {
  const draft = staleDraft();
  draft.currentSpend = 0;
  draft.spendNeed = 0;
  draft.endAge = 73;
  const person = draft.people[0]!;
  person.employ = 0;
  person.cpp = { amt: 0, age: 65 };
  person.oas = { amt: 0, age: 65 };
  person.pen = { amt: 0, age: 65 };
  person.bridge = { amt: 0, end: 65 };
  const source = draft.accounts[0]!;
  const account: AccountInput = {
    ...source,
    id: type.toLowerCase(),
    name: type,
    type,
    bal: 100000,
    acb: 100000,
    eq: 0,
    conv: type === "LIRA" ? 65 : 0,
    unlock: 0,
  };
  draft.accounts = [account];
  return normalizeDraft(draft);
}

describe("P0-2 — refresh persisted current age from DOB", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("P02-1: DOB is authoritative before, on, and after the birthday", () => {
    const draft = staleDraft();

    setToday(2026, 9, 14);
    expect(normalizeDraft(draft).people[0]!.curAge).toBe(59);

    setToday(2026, 9, 15);
    expect(normalizeDraft(draft).people[0]!.curAge).toBe(60);

    setToday(2026, 9, 16);
    expect(normalizeDraft(draft).people[0]!.curAge).toBe(60);
    expect(draft.people[0]!.curAge).toBe(59);
  });

  it("P02-2: reopening later refreshes age without rewriting persisted data", () => {
    const draft = staleDraft();

    setToday(2026, 9, 16);
    expect(normalizeDraft(draft).people[0]!.curAge).toBe(60);

    setToday(2027, 9, 16);
    expect(normalizeDraft(draft).people[0]!.curAge).toBe(61);

    setToday(2031, 9, 14);
    expect(normalizeDraft(draft).people[0]!.curAge).toBe(64);

    setToday(2031, 9, 15);
    expect(normalizeDraft(draft).people[0]!.curAge).toBe(65);
    expect(draft.people[0]!.curAge).toBe(59);
    expect(draft.people[0]!.dob).toBe("1966-09-15");
  });

  it("P02-3: missing or unusable DOB preserves the legacy persisted-age fallback", () => {
    setToday(2026, 9, 16);
    expect(effectiveCurrentAge(null, 59)).toBe(59);
    expect(effectiveCurrentAge("not-a-date", 59)).toBe(59);
    expect(effectiveCurrentAge("2026-02-30", 59)).toBe(59);
    expect(effectiveCurrentAge(null, null)).toBeNull();

    const legacy = staleDraft();
    legacy.people[0]!.dob = null;
    expect(normalizeDraft(legacy).people[0]!.curAge).toBe(59);
    expect(isPlanReady(legacy)).toBe(true);

    const invalid = staleDraft();
    invalid.people[0]!.dob = "not-a-date";
    expect(normalizeDraft(invalid).people[0]!.curAge).toBe(59);

    const derivedOnly = staleDraft();
    derivedOnly.people[0]!.curAge = null;
    expect(missingRequiredInputs(derivedOnly)).not.toContain("date of birth for you");
    expect(normalizeDraft(derivedOnly).people[0]!.curAge).toBe(60);
  });

  it("P02-3a: unresolved age blocks readiness and normalization", () => {
    const incomplete = staleDraft();
    incomplete.people[0]!.dob = null;
    incomplete.people[0]!.curAge = null;

    expect(missingRequiredInputs(incomplete)).toContain("date of birth for you");
    expect(() => normalizeDraft(incomplete)).toThrowError(
      "Cannot normalize person A: a valid date of birth or persisted current age is required.",
    );
  });

  it("P02-4: year rollover and February 29 follow one documented calendar rule", () => {
    expect(ageFromDob("1966-01-01", localDate(2026, 12, 31))).toBe(60);
    expect(ageFromDob("1966-01-01", localDate(2027, 1, 1))).toBe(61);

    expect(ageFromDob("2000-02-29", localDate(2025, 2, 28))).toBe(24);
    expect(ageFromDob("2000-02-29", localDate(2025, 3, 1))).toBe(25);
    expect(ageFromDob("2000-02-29", localDate(2024, 2, 28))).toBe(23);
    expect(ageFromDob("2000-02-29", localDate(2024, 2, 29))).toBe(24);
  });

  it("P02-5: refreshed age reaches every ordinary age-sensitive projection event", () => {
    setToday(2026, 9, 16);
    const draft = staleDraft();
    const { inputs, result } = runDraft(draft);

    expect(inputs.people[0]).toMatchObject({
      dob: "1966-09-15",
      curAge: 60,
      retAge: 65,
      cpp: { age: 65 },
      oas: { age: 65 },
    });
    expect(inputs.accounts.map((account) => account.bal)).toEqual(
      draft.accounts.map((account) => account.bal),
    );

    expect(result.rows[0]).toMatchObject({ age: 60, yr: 2026 });
    expect(result.rows.find((row) => row.age === 64)).toMatchObject({
      yr: 2030,
      employ: 50000,
      spendTarget: 40000,
    });
    expect(result.rows.find((row) => row.age === 65)).toMatchObject({
      yr: 2031,
      employ: 0,
      spendTarget: 60000,
      cpp: 12000,
      oas: 9000,
      pen: 6000,
    });
    expect(result.rows.find((row) => row.age === 67)?.pen).toBe(12000);
    expect(result.rows.at(-1)).toMatchObject({ age: 75, yr: 2041 });

    const goal = goalProgress(inputs, result);
    expect(goal.retirementAge).toBe(65);
    expect(goal.yearsToRetirement).toBe(5);
    expect(whatIfRetirementAgeMinimum(draft.people[0]!)).toBe(60);
  });

  it("P02-6: stale age can no longer shift retirement and projection events by one year", () => {
    setToday(2026, 9, 16);
    const corrected = runDraft(staleDraft()).result;
    const legacy = staleDraft();
    legacy.people[0]!.dob = null;
    const stale = runDraft(legacy).result;

    expect(corrected.rows[0]).toMatchObject({ age: 60, yr: 2026 });
    expect(stale.rows[0]).toMatchObject({ age: 59, yr: 2026 });
    expect(corrected.rows.find((row) => row.age === 65)?.yr).toBe(2031);
    expect(stale.rows.find((row) => row.age === 65)?.yr).toBe(2032);
    expect(corrected.rows.at(-1)?.yr).toBe(2041);
    expect(stale.rows.at(-1)?.yr).toBe(2042);
  });

  it("P02-7: RRSP/RRIF and LIRA/LIF transition timing receives the refreshed age", () => {
    setToday(2026, 9, 16);

    const rrsp = runPlan(conversionPlan("RRSP"), { startYear: 2026 });
    const lif = runPlan(conversionPlan("LIRA"), { startYear: 2026 });

    expect(rrsp.rows.find((row) => row.regWithdraw > 0)).toMatchObject({ age: 72, yr: 2038 });
    expect(lif.rows.find((row) => row.regWithdraw > 0)).toMatchObject({ age: 66, yr: 2032 });
    expect(
      lif.componentStatuses.find((entry) => entry.component === "rrif.ageBasisWholeYear"),
    ).toMatchObject({ status: "APPROXIMATE", engaged: true });
  });

  it("P02-8: death timing receives the refreshed age on the household timeline", () => {
    setToday(2026, 9, 16);
    const draft = staleDraft();
    const primary = draft.people[0]!;
    primary.deathAge = 70;
    const spouse: PersonDraft = {
      ...primary,
      id: "B",
      dob: "1968-09-15",
      curAge: 57,
      deathAge: 90,
      cpp: { ...primary.cpp },
      oas: { ...primary.oas },
      pen: { ...primary.pen },
      bridge: { ...primary.bridge },
    };
    draft.planType = "married";
    draft.people = [primary, spouse];

    const result = runDraft(draft).result;
    expect(result.people.map((person) => person.curAge)).toEqual([60, 58]);
    expect(result.rows.find((row) => row.anyDeceased)).toMatchObject({ age: 70, yr: 2036 });
  });

  it("P02-9: baseline, live scenario, saved scenario, and promotion re-normalize age", () => {
    setToday(2026, 9, 16);
    const draft = staleDraft();
    const patch: ScenarioPatch = { retireAgeByPerson: { A: 66 } };

    const baselineInputs = scenarioInputs(draft, {});
    const baseline = runScenario(draft, {});
    const live = runScenario(draft, patch);
    expect(baselineInputs.people[0]!.curAge).toBe(60);
    expect(baseline.people[0]!.curAge).toBe(60);
    expect(live.people[0]).toMatchObject({ curAge: 60, retAge: 66 });
    expect(baseline.series[0]).toMatchObject({ age: 60, year: 2026 });
    expect(live.series[0]).toMatchObject({ age: 60, year: 2026 });

    const stored = serializeScenarioPatch(patch);
    const parsed = parseStoredScenario(stored, SCENARIO_SCHEMA_VERSION);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(runScenario(draft, parsed.patch).people[0]).toMatchObject({ curAge: 60, retAge: 66 });

    const promoted = patchToDraft(draft, patch);
    expect(promoted.draft.people[0]).toMatchObject({
      dob: "1966-09-15",
      curAge: 59,
      retAge: 66,
    });
    expect(runScenario(promoted.draft).people[0]).toMatchObject({ curAge: 60, retAge: 66 });
  });
});
