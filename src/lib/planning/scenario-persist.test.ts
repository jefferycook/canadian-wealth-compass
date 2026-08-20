import { describe, expect, it } from "vitest";
import {
  SCENARIO_MIGRATIONS,
  SCENARIO_SCHEMA_VERSION,
  migrateScenarioPatch,
  parseStoredScenario,
  serializeScenarioPatch,
} from "./scenario-persist";
import { patchToDraft, promotionPreflight } from "./scenario";
import { newPlanDraft } from "./defaults";
import type { ScenarioPatch } from "./scenario";

const patch: ScenarioPatch = {
  retSpendMonthly: 5200,
  extraMonthlySaving: 400,
  savingAccount: "NONREG",
  savingOwner: "A",
  cppAgeByPerson: { A: 70 },
  strategy: "tfsa_nonreg_reg",
};

describe("scenario persistence", () => {
  it("round-trips a patch, including the selected savings owner", () => {
    const stored = serializeScenarioPatch(patch);
    const parsed = parseStoredScenario(stored, SCENARIO_SCHEMA_VERSION);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.patch).toEqual(patch);
  });

  it("refuses a scenario saved by a newer schema", () => {
    const parsed = parseStoredScenario(serializeScenarioPatch(patch), SCENARIO_SCHEMA_VERSION + 1);
    expect(parsed.ok).toBe(false);
  });

  it("refuses a scenario with an unknown field rather than dropping it", () => {
    const parsed = parseStoredScenario(
      { ...serializeScenarioPatch(patch), somethingNew: 1 },
      SCENARIO_SCHEMA_VERSION,
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("somethingNew");
  });

  it("refuses a scenario with a wrongly typed field", () => {
    const parsed = parseStoredScenario({ retSpendMonthly: "lots" }, SCENARIO_SCHEMA_VERSION);
    expect(parsed.ok).toBe(false);
  });

  it("refuses a scenario with no readable version stamp", () => {
    expect(parseStoredScenario(serializeScenarioPatch(patch), null).ok).toBe(false);
    expect(parseStoredScenario(serializeScenarioPatch(patch), 0).ok).toBe(false);
  });
});

describe("older schema versions are never silently reinterpreted", () => {
  it("refuses an older version when no migration is registered", () => {
    const older = SCENARIO_SCHEMA_VERSION - 1;
    if (older < 1) {
      // With only one schema version in existence there is nothing older to read.
      expect(SCENARIO_MIGRATIONS[older]).toBeUndefined();
      return;
    }
    const parsed = parseStoredScenario(serializeScenarioPatch(patch), older);
    if (!SCENARIO_MIGRATIONS[older]) expect(parsed.ok).toBe(false);
  });

  it("migrateScenarioPatch stops at the first missing step", () => {
    const result = migrateScenarioPatch(SCENARIO_SCHEMA_VERSION - 1, serializeScenarioPatch(patch));
    if (!SCENARIO_MIGRATIONS[SCENARIO_SCHEMA_VERSION - 1]) {
      expect(result.ok).toBe(false);
    } else {
      expect(result.ok).toBe(true);
    }
  });

  it("a registered migration path is applied, and only then is the patch executable", () => {
    const from = SCENARIO_SCHEMA_VERSION;
    const to = SCENARIO_SCHEMA_VERSION + 1;
    // Simulate the next schema bump: the current version becomes migratable.
    const original = { ...SCENARIO_MIGRATIONS };
    try {
      SCENARIO_MIGRATIONS[from] = (raw) => ({ ...raw, retSpendMonthly: 6000 });
      const migrated = migrateScenarioPatch(from, serializeScenarioPatch(patch), to);
      expect(migrated.ok).toBe(true);
      if (migrated.ok) expect(migrated.raw['retSpendMonthly']).toBe(6000);
    } finally {
      for (const k of Object.keys(SCENARIO_MIGRATIONS)) delete SCENARIO_MIGRATIONS[Number(k)];
      Object.assign(SCENARIO_MIGRATIONS, original);
    }
  });

  it("an unmigratable stored version is refused with a readable reason", () => {
    const parsed = parseStoredScenario(serializeScenarioPatch(patch), SCENARIO_SCHEMA_VERSION + 3);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason.length).toBeGreaterThan(0);
  });
});

describe("baseline promotion", () => {
  it("writes answers and reports levers with no baseline field", () => {
    const draft = newPlanDraft();
    const out = patchToDraft(draft, patch);
    expect(out.draft.spendNeed).toBe(5200 * 12);
    expect(out.draft.people[0]!.cpp.age).toBe(70);
    expect(out.unsupported).toContain("extraMonthlySaving");
    // the baseline draft object itself is untouched
    expect(draft.spendNeed).not.toBe(5200 * 12);
  });

  it("preflight separates what will be written from what will be left out", () => {
    const draft = newPlanDraft();
    const pre = promotionPreflight(draft, patch);
    const appliedKeys = pre.applied.map((l) => l.key);
    const unsupportedKeys = pre.unsupported.map((l) => l.key);
    expect(unsupportedKeys).toContain("extraMonthlySaving");
    expect(appliedKeys).not.toContain("extraMonthlySaving");
    for (const l of [...pre.applied, ...pre.unsupported]) expect(l.label).toBeTruthy();
  });

  it("preflight never mutates the baseline draft", () => {
    const draft = newPlanDraft();
    const before = JSON.stringify(draft);
    promotionPreflight(draft, patch);
    expect(JSON.stringify(draft)).toBe(before);
  });
});
