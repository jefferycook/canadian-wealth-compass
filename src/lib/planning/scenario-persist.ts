/**
 * Saved scenarios — serialization only.
 *
 * A saved scenario is nothing but a name plus the canonical `ScenarioPatch`
 * and the schema version it was written with. No engine result is ever
 * persisted: reopening a scenario re-runs `baseline draft + patch` through the
 * one execution path in `scenario.ts`.
 *
 * Validation is deliberately strict and fail-safe: an unknown schema version,
 * an unknown field, or a wrongly-typed field is reported as an error rather
 * than being coerced into something the engine would silently misread.
 */

import type { PersonKey, WithdrawalStrategy } from "./types";
import type { ByPerson, ScenarioPatch, SavingAccountType } from "./scenario";

/** Bump this whenever the meaning of an existing ScenarioPatch field changes. */
export const SCENARIO_SCHEMA_VERSION = 1;

const STRATEGIES: WithdrawalStrategy[] = [
  "auto",
  "nonreg_reg_tfsa",
  "reg_nonreg_tfsa",
  "tfsa_nonreg_reg",
  "prorata",
];

const PERSON_KEYS: PersonKey[] = ["A", "B"];
const SAVING_ACCOUNTS: SavingAccountType[] = ["NONREG"];

/** Every field a stored patch may contain, with its accepted shape. */
const FIELD_KINDS = {
  retireDeferYears: "number",
  retireAgeByPerson: "byPerson",
  cppAgeByPerson: "byPerson",
  oasAgeByPerson: "byPerson",
  retSpendMonthly: "number",
  currentSpendMonthly: "number",
  extraMonthlySaving: "number",
  savingAccount: "savingAccount",
  savingOwner: "personKey",
  strategy: "strategy",
  eqRet: "number",
  fiRet: "number",
  returnAdjustment: "number",
  inflation: "number",
  oneTimeExpense: "oneTimeExpense",
  propertySale: "propertySale",
} as const;

export type StoredPatchKey = keyof typeof FIELD_KINDS;

export const STORED_PATCH_KEYS = Object.keys(FIELD_KINDS) as StoredPatchKey[];

export type ScenarioParse =
  | { ok: true; patch: ScenarioPatch }
  | { ok: false; reason: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseByPerson(v: unknown): ByPerson | null | string {
  if (v === null) return null;
  if (!isPlainObject(v)) return "expected an object keyed by person";
  const out: ByPerson = {};
  for (const [k, val] of Object.entries(v)) {
    if (!PERSON_KEYS.includes(k as PersonKey)) return `unknown person "${k}"`;
    if (val == null) continue;
    if (!isFiniteNumber(val)) return `person "${k}" age is not a number`;
    out[k as PersonKey] = val;
  }
  return out;
}

function parseField(key: StoredPatchKey, v: unknown): { value: unknown } | { error: string } {
  if (v === null) return { value: null };
  switch (FIELD_KINDS[key]) {
    case "number":
      return isFiniteNumber(v) ? { value: v } : { error: `"${key}" must be a number` };
    case "byPerson": {
      const parsed = parseByPerson(v);
      return typeof parsed === "string" ? { error: `"${key}": ${parsed}` } : { value: parsed };
    }
    case "personKey":
      return PERSON_KEYS.includes(v as PersonKey)
        ? { value: v }
        : { error: `"${key}" must be a person identifier` };
    case "savingAccount":
      return SAVING_ACCOUNTS.includes(v as SavingAccountType)
        ? { value: v }
        : { error: `"${key}" is not a supported saving destination` };
    case "strategy":
      return STRATEGIES.includes(v as WithdrawalStrategy)
        ? { value: v }
        : { error: `"${key}" is not a known withdrawal order` };
    case "oneTimeExpense": {
      if (!isPlainObject(v)) return { error: `"${key}" must be an object` };
      const { age, amt, name, ...rest } = v;
      if (Object.keys(rest).length > 0)
        return { error: `"${key}" has unknown field "${Object.keys(rest)[0]}"` };
      if (!isFiniteNumber(age) || !isFiniteNumber(amt))
        return { error: `"${key}" needs a numeric age and amount` };
      if (name != null && typeof name !== "string")
        return { error: `"${key}" name must be text` };
      return { value: name == null ? { age, amt } : { age, amt, name } };
    }
    case "propertySale": {
      if (!isPlainObject(v)) return { error: `"${key}" must be an object` };
      const { index, saleAge, ...rest } = v;
      if (Object.keys(rest).length > 0)
        return { error: `"${key}" has unknown field "${Object.keys(rest)[0]}"` };
      if (!isFiniteNumber(index) || !isFiniteNumber(saleAge))
        return { error: `"${key}" needs a numeric index and sale age` };
      return { value: { index, saleAge } };
    }
    default:
      return { error: `"${key}" is not supported` };
  }
}

/**
 * The patch as it goes into storage: known fields only, `undefined` dropped so
 * the stored JSON is a faithful, stable round-trip of what the client set.
 */
export function serializeScenarioPatch(patch: ScenarioPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of STORED_PATCH_KEYS) {
    const v = (patch as Record<string, unknown>)[key];
    if (v === undefined) continue;
    out[key] = v;
  }
  return out;
}

/**
 * Read a stored scenario back. Fails safely rather than guessing: a newer
 * schema version, an unknown field, or a bad type produces an error the UI
 * shows instead of a scenario that would run with the wrong meaning.
 */
export function parseStoredScenario(raw: unknown, version: unknown): ScenarioParse {
  if (!isFiniteNumber(version) || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: "This saved scenario has no readable version stamp." };
  }
  if (version > SCENARIO_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `This scenario was saved by a newer version of the planner (v${version}).`,
    };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "This saved scenario is not in a readable format." };
  }

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!STORED_PATCH_KEYS.includes(key as StoredPatchKey)) {
      return { ok: false, reason: `This saved scenario contains an unsupported change ("${key}").` };
    }
    if (value === undefined) continue;
    const parsed = parseField(key as StoredPatchKey, value);
    if ("error" in parsed) return { ok: false, reason: `This saved scenario is invalid: ${parsed.error}.` };
    patch[key] = parsed.value;
  }
  return { ok: true, patch: patch as ScenarioPatch };
}
