import { describe, expect, it } from "vitest";
import {
  SCENARIO_SCHEMA_VERSION,
  parseStoredScenario,
  serializeScenarioPatch,
} from "./scenario-persist";
import type { ScenarioPatch } from "./scenario";

const V = SCENARIO_SCHEMA_VERSION;

describe("stored scenario field validation (structural only)", () => {
  it("serialize drops undefined fields and keeps explicit null distinct from absent", () => {
    const stored = serializeScenarioPatch({
      retSpendMonthly: undefined,
      inflation: null,
      eqRet: 0,
    } as unknown as ScenarioPatch);
    expect("retSpendMonthly" in stored).toBe(false);
    expect(stored["inflation"]).toBeNull();
    expect(stored["eqRet"]).toBe(0);
  });

  it("serialize never writes a key outside the stored field list", () => {
    const stored = serializeScenarioPatch({
      eqRet: 1,
      notAField: 9,
    } as unknown as ScenarioPatch);
    expect(Object.keys(stored)).toEqual(["eqRet"]);
  });

  it("explicit null round-trips as null, not as absent", () => {
    const parsed = parseStoredScenario({ inflation: null }, V);
    expect(parsed).toEqual({ ok: true, patch: { inflation: null } });
  });

  it("rejects non-finite numbers", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parseStoredScenario({ eqRet: bad }, V).ok).toBe(false);
    }
  });

  it("accepts a one-time expense with and without a name", () => {
    expect(parseStoredScenario({ oneTimeExpense: { age: 60, amt: 20000 } }, V)).toEqual({
      ok: true,
      patch: { oneTimeExpense: { age: 60, amt: 20000 } },
    });
    expect(
      parseStoredScenario({ oneTimeExpense: { age: 60, amt: 20000, name: "Roof" } }, V),
    ).toEqual({ ok: true, patch: { oneTimeExpense: { age: 60, amt: 20000, name: "Roof" } } });
  });

  it("refuses malformed one-time expenses", () => {
    for (const bad of [
      "x",
      [],
      { age: 60 },
      { age: "60", amt: 1 },
      { age: 60, amt: 1, name: 5 },
      { age: 60, amt: 1, extra: true },
    ]) {
      expect(parseStoredScenario({ oneTimeExpense: bad }, V).ok).toBe(false);
    }
  });

  it("validates property sale shape and refuses unknown fields", () => {
    expect(parseStoredScenario({ propertySale: { index: 0, saleAge: 75 } }, V).ok).toBe(true);
    for (const bad of [
      { index: 0 },
      { index: "0", saleAge: 75 },
      { index: 0, saleAge: 75, x: 1 },
    ]) {
      expect(parseStoredScenario({ propertySale: bad }, V).ok).toBe(false);
    }
  });

  it("validates per-person maps: only A and B, numeric ages, null entries skipped", () => {
    expect(parseStoredScenario({ cppAgeByPerson: { A: 65, B: null } }, V)).toEqual({
      ok: true,
      patch: { cppAgeByPerson: { A: 65 } },
    });
    expect(parseStoredScenario({ cppAgeByPerson: { C: 65 } }, V).ok).toBe(false);
    expect(parseStoredScenario({ cppAgeByPerson: { A: "65" } }, V).ok).toBe(false);
    expect(parseStoredScenario({ cppAgeByPerson: [65] }, V).ok).toBe(false);
  });

  it("refuses unknown enum values and non-object payloads", () => {
    expect(parseStoredScenario({ strategy: "yolo" }, V).ok).toBe(false);
    expect(parseStoredScenario({ savingAccount: "RRSP" }, V).ok).toBe(false);
    expect(parseStoredScenario({ savingOwner: "Z" }, V).ok).toBe(false);
    expect(parseStoredScenario([], V).ok).toBe(false);
    expect(parseStoredScenario(null, V).ok).toBe(false);
    expect(parseStoredScenario({}, 1.5).ok).toBe(false);
  });
});
