import { describe, expect, it } from "vitest";
import {
  SCENARIO_SCHEMA_VERSION,
  parseStoredScenario,
  serializeScenarioPatch,
} from "./scenario-persist";
import { patchToDraft } from "./scenario";
import { newPlanDraft } from "./defaults";
import type { ScenarioPatch } from "./scenario";

const patch: ScenarioPatch = {
  retSpendMonthly: 5200,
  extraMonthlySaving: 400,
  savingAccount: "TFSA",
  savingOwner: "A",
  cppAgeByPerson: { A: 70 },
  strategy: "TFSA_FIRST",
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

  it("promotion writes answers and reports levers with no baseline field", () => {
    const draft = newPlanDraft();
    const out = patchToDraft(draft, patch);
    expect(out.draft.spendNeed).toBe(5200 * 12);
    expect(out.draft.people[0]!.cpp.age).toBe(70);
    expect(out.unsupported).toContain("extraMonthlySaving");
    // the baseline draft object itself is untouched
    expect(draft.spendNeed).not.toBe(5200 * 12);
  });
});
