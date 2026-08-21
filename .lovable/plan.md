# Batch 0C — Locked-in safety

Implements the Batch 0C row of `docs/CANONICAL-ENGINE-SPECIFICATION-v1.2-FINAL.md`
(v1.2 FINAL + Errata 1–4, including §13.2a component-level status). Nothing outside
0C changes; no deploy, no publish.

## Contradictions found between the live code and the canonical contract

Confirmed by reading `src/lib/planning/registered.ts`, `projection.ts`, `types.ts`,
`PlanWizard.tsx`, `opportunities.ts`:

1. `unlockRule()` ends with `UNLOCK_RULES[juris ?? "ON"] ?? UNLOCK_RULES.ON` — the
   silent Ontario fallback the spec calls a live defect (§14.2, §11.1 item 10).
2. `WorkingAccount._split` is a one-shot boolean; the unlock loop begins
   `if (a._split) continue;`, so a Manitoba client who unlocks 50% at 55 is never
   re-evaluated at 65 and is silently denied the full unlock (§3.2-MB defect 1).
3. The unlocked share is pushed as an account typed `"RRSP"` named
   `"(unlocked→RRSP)"` for every jurisdiction, including Manitoba, where the law
   directs a prescribed RRIF (§3.2-MB defect 2). No `PRRIF` account type exists.
4. `UnlockRule` carries only `{name, pct, minAge, full65?, noMax55?, verified?}` —
   no `source`, `verifiedDate`, no per-component status, no destination type, no
   RLIF/window/one-time procedural metadata (§13, §13.2a).
5. Saskatchewan is absent from `JurisdictionKey` and `UNLOCK_RULES`; there is no
   UNSUPPORTED concept, so nothing can be refused or withheld.
6. `noMax55` is applied correctly (age-gated) but is named and commented in a way
   that reads as "Quebec has no LIF maximum", and the under-55 maximum uses the
   generic annuity approximation with no APPROXIMATE flag.
7. The wizard builds its jurisdiction selector from `Object.keys(UNLOCK_RULES)`, so
   any new UNSUPPORTED entry would become selectable unless the selector is gated.

## What gets built

### 1. Rule records with component-level status (`registered.ts`)

`UnlockRule` becomes:

- `partialPct`, `partialMinAge`, `fullUnlockAge?` (MB = 65)
- `destinationType: "RRSP" | "PRRIF"`
- `requiresVehicle?: "RLIF" | "ScheduleLIF"`, `transferWindowDays?`, `oneTime: boolean`
- `notes` (procedural text a client needs to act)
- three component records, each `{ source, verifiedDate, status }`:
  `unlockEntitlement`, `destinationVehicle`, `lifMaximum`

Legacy `pct`/`minAge`/`full65`/`noMax55` are retained as derived read-only aliases so
existing callers and tests keep working during the batch.

Jurisdictions: FED (RLIF, 60-day window, 50%, one-time/no carry-forward, VERIFIED),
MB (50% at 55 to PRRIF + full balance at 65, VERIFIED), QC (transfer prohibited,
lifMaximum split: 55+ no-max VERIFIED, under-55 APPROXIMATE), ON (VERIFIED entitlement,
VERIFIED FSRA lifMaximum), AB/NS/NB/BC (APPROXIMATE entitlement, APPROXIMATE lifMaximum),
**SK added with every component UNSUPPORTED**.

New API:
- `unlockRule(juris)` throws on unknown/absent jurisdiction — no Ontario default.
- `tryUnlockRule(juris)` returns `undefined` for UI paths that must not throw.
- `componentStatus(juris, component)` and derived `recordStatus(juris)` (worst status,
  display/selector only).
- `lifMaxFactor` returns `{ pct, status }` (ON table → VERIFIED, QC 55+ → no maximum,
  QC under-55 and all other formula uses → APPROXIMATE), with a thin legacy numeric
  wrapper so unrelated call sites are untouched.

### 2. `PRRIF` account type

Added to `AccountType`: RRIF minimums apply immediately, **no** maximum,
pension-income-eligible at 65+. Wired into `projection.ts` `isRRIFnow` (always true),
`isLockedIn` (false — no LIF cap), the pension-eligible cash split, and estate treatment
in `engine.ts` (registered, same as RRIF).

### 3. Manitoba sequential entitlements (`projection.ts`)

`WorkingAccount._split: boolean` → `unlockedFraction: number`. Each year the unlock loop
re-evaluates every locked-in account against the age-appropriate maximum
(`partialPct` at `partialMinAge`, 100% at `fullUnlockAge`) and unlocks only the
*incremental* fraction. The destination account is created once per source account and
topped up on later unlocks; its type comes from `destinationType`
(MB → `PRRIF`, others → `RRSP`), with the name reflecting the vehicle.

### 4. Point-of-use gating

- Unlock calculation reading an UNSUPPORTED `unlockEntitlement` (SK) is **withheld**:
  no unlock is performed, no substitution, and a disclosure string is added to a new
  `ProjectionResult.lockedInDisclosures` (alongside the existing `roomDisclosures`
  pattern). Tax and projection for that client still run.
- A calculation touching an APPROXIMATE component records an approximate flag on that
  number's disclosure, not on the whole plan.
- `recordStatus` is used only by the wizard selector.

### 5. UI (presentation only, no feature removal)

- Jurisdiction selector lists supported jurisdictions normally; SK appears as
  "Saskatchewan — not yet supported" and is non-selectable for new entry.
- A saved account already holding an unsupported jurisdiction loads, displays, and
  shows an inline "this jurisdiction is not yet supported — locked-in results withheld"
  notice instead of throwing.
- The Ontario-specific unlock hint text is replaced by jurisdiction-aware text driven
  from the rule record (destination vehicle, percentage, age, window, one-time nature).
- `opportunities.ts` unlock card switches to `tryUnlockRule` so an unsupported
  jurisdiction degrades to the withheld message rather than reading Ontario.

### 6. Saved-plan compatibility

- `AccountInput.juris` shape unchanged; `JurisdictionKey` gains `"SK"`.
- Read-time migration in the working-account builder: `_split === true` →
  `unlockedFraction = previous unlock pct / 100` (or 1.0 when no pct is recoverable);
  `false`/absent → `0`. Persisted drafts and scenario patches are unaffected because
  `_split`/`unlockedFraction` are run-time-only fields.

## Tests (all required by the 0C row)

New `src/lib/planning/lockedin.test.ts` plus additions to existing suites:

1. Unknown/absent jurisdiction **throws** from `unlockRule` and does not become Ontario.
2. MB unlocks 50% at 55 **and then the remaining balance at 65** in one projection.
3. MB unlocked money lands in a **PRRIF** and forces RRIF minimums before 71
   (assert taxable minimum > 0 at ages 56–70).
4. SK is UNSUPPORTED: an account with `juris: "SK"` is refused, results withheld,
   no unlock occurs, no Ontario/Manitoba/PRRIF behaviour, projection still runs.
5. QC applies a maximum at 54 and none at 55+; the 54 maximum is flagged APPROXIMATE.
6. ON maximum matches the FSRA table at ages {55, 65, 75, 85} and is VERIFIED.
7. Unlock follows pension jurisdiction, not residence (existing test kept).
8. Every rule record has non-empty `source`, `verifiedDate`, `status` on all three
   components.
9. Saved-plan migration: `_split: true` → `unlockedFraction` behaves as before.

## Regression / golden expectations

- Ontario-only fixtures must be **unchanged**: Batch 0A single **$278,614**,
  couple **$554,616**, Batch 0B accumulation **$2,254,682**. Any movement here is a bug
  in this batch, not a re-baseline.
- The spec notes the single-filer fixture holds a LIF; it is Ontario-jurisdiction with
  `unlock: 0`, so no movement is expected. If any figure moves, I stop, show the cause,
  and ask before re-pinning.
- Full suite (currently 161 tests) plus new 0C tests must be green with a clean typecheck
  before Batch 0C is reported complete. No 0D/next-batch work is started.
- `docs/IMPLEMENTATION-CHANGELOG.md` gets a Batch 0C entry recording scope, defects
  fixed, and anchors held/moved.
