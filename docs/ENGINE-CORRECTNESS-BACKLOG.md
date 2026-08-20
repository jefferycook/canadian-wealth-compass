# Financial-correctness backlog (Phase 0 implementation contract)

Methodology baseline: `docs/CANONICAL-ENGINE-SPECIFICATION-v1.2-FINAL.md` (v1.2 FINAL).

**Freeze in force.** Nothing in this document is implemented during UX Batch 1.
UX work may not change `src/lib/planning/{projection,tax,registered,taxYears}.ts`
behaviour. Work resumes only in the next approved engine batch.

Where current code and the specification disagree, the disagreement is recorded
here and raised before implementation — never resolved silently in code.

---

## B0-1 Manitoba: age-55 and age-65 are separate statutory rights (CORRECTION)

The earlier instruction to remove `full65: true` for Manitoba was **wrong and is
withdrawn**. Manitoba law lets a LIRA/LIF owner **age 65 or older unlock the full
remaining balance**; that right is preserved. The age-55+ provision is a
**separate, once-in-a-lifetime transfer of up to 50% to a prescribed RRIF**.

Current code (`src/lib/planning/registered.ts`) already carries
`MB: { pct: 50, minAge: 55, full65: true }` — the age-65 right is intact in the
rule record. Two real defects remain in `src/lib/planning/projection.ts`:

**Defect 1 — `_split` blocks the later age-65 right.**
The unlocking loop opens with `if (a._split) continue;` (projection.ts:190) and
sets `a._split = true` after any unlock. After a Manitoba age-55 partial unlock
the remaining locked balance can never exercise the age-65 full unlock.

*Required change:* model the two rights as distinct statutory events on the
account, not one generic "unlock already used" flag. Each right is consumed
independently; exercising the 55+ transfer must leave the 65 full-unlock right
available on the remaining locked balance.

**Defect 2 — Manitoba age-55 money lands in the wrong vehicle.**
The loop creates every unlocked portion as an RRSP (projection.ts:~218). The
Manitoba age-55 one-time transfer goes to a **prescribed RRIF**, not an RRSP.

*Required change:* the destination vehicle is a property of the statutory event.
Account type, tax treatment, and mandatory-minimum-withdrawal behaviour must
follow the actual destination (prescribed RRIF: RRIF minimums apply, no maximum).

## B0-2 Jurisdiction fallback must not default to Ontario

`unlockRule(juris)` currently ends with `?? UNLOCK_RULES.ON`
(registered.ts:161), so missing or unsupported pension jurisdictions are silently
governed by Ontario law.

*Required change:* remove the fallback. A missing or unsupported pension
jurisdiction produces an **unsupported / input-validation state** surfaced to the
user — never Ontario law, never a silent default.

## B0-3 Residence province must never stand in for pension jurisdiction

`lifMaxFactor(age, a.juris ?? provinceKey, opts.lifRate)` (projection.ts:418)
substitutes the residence province when the account has no pension jurisdiction.

*Required change:* remove the `a.juris ?? provinceKey` fallback. Residence and
pension jurisdiction are separate inputs (spec §0.9); an account with no pension
jurisdiction is an input-validation state, per B0-2.

## B0-4 Quebec — retain

- Under 55: prescribed LIF maximum and temporary-income rules apply.
- 55+: **no upper withdrawal limit** from January 1, 2025.
- Direct LIF → RRSP/RRIF transfers are **no longer permitted** from January 1, 2025.

## B0-5 Federal — retain

- **RLIF** required for the one-time option (not a plain LIF).
- Age 55+.
- Up to 50%.
- Must be exercised within **60 days** of establishment.
- One-time; **no carry-forward** of any unused percentage.

## B0-6 National coverage (spec §14)

All 13 provinces/territories before launch, with jurisdiction gating and a
per-jurisdiction rule record. Today the province selector resolves to ON, BC, AB
only (CUSTOM excluded); every other key throws. Unverified unlocking rules stay
excluded from scenario surfaces until marked `verified: true`.

---

## Known disagreements to raise before implementation

1. **Unlocking is modelled as one flag, the statute is a set of rights.** The
   engine's single `_split` boolean cannot represent per-right consumption
   (B0-1). This is a data-model change, not a constant change.
2. **The engine has one destination vehicle for unlocked money (RRSP).** The
   spec requires prescribed RRIF, RRSP, and RRIF destinations to be
   distinguishable, each with its own minimum-withdrawal treatment (B0-1).
3. **Silent jurisdiction defaults exist in two places** (B0-2, B0-3). Removing
   them turns plans that currently produce numbers into plans that require an
   answer — an intake/wizard change accompanies the engine change.
