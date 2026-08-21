# Implementation / change log

Methodology baseline: `docs/CANONICAL-ENGINE-SPECIFICATION-v1.2-FINAL.md` (v1.2 FINAL,
Errata 1–3).

---

## Batch 0A — Pension tax correctness — COMPLETE (approved 2026-08-20)

- Source-aware registered withdrawals (RRIF/LIF vs RRSP).
- One canonical `pensionEligible` stream.
- Bridge benefits are not pension-eligible by default (`sourceClass`,
  `eligibleAffirmed`); affirmation permitted only for `RPP_LIFETIME`.
- Pension-split endpoint regression protection; floating-point fix in the split
  search in `src/lib/planning/tax.ts`.

Regression anchors: single **$278,614**, couple **$554,616**.

## Batch 0B — RRSP / TFSA accumulation correctness — COMPLETE (approved 2026-08-21)

Implemented:

- **Room ledger** (`src/lib/planning/room.ts`): opening-year room authority,
  indexed statutory accrual, RRSP contribution room vs deduction limit,
  unknown-room handling, age-71 RRSP dormancy.
- **Asserted vs generated contributions.** Client-asserted contributions are
  recorded as fact; engine-generated saving is capped at legally available room
  and cascades TFSA → RRSP → NONREG.
- **Tax basis.** `computeTax` reduces net income by `rrspDeduction`, flowing
  through OAS recovery and phase-outs.
- **Intake.** CRA room fields (deduction limit, undeducted contributions,
  pension adjustment) collected in `PlanWizard.tsx`.

Targeted review corrections (accepted):

1. Registered-destination lump sums route through the owner's room ledger and
   cascade the remainder instead of bypassing enforcement or vanishing.
2. Current pension-plan membership is no longer inferred from owning a LIRA.
3. Deterministic (fixed-seed) property guard added in
   `src/lib/planning/room-guard.test.ts`: generated registered contributions can
   never exceed legally available room.

Verification at approval: **161 tests passing**, clean typecheck.

Regression anchors: Batch 0A single **$278,614**, Batch 0A couple **$554,616**,
Batch 0B accumulation **$2,254,682**.

Status: **Batch 0B complete.**

## Batch 0C — Locked-in safety — COMPLETE (implemented 2026-08-21, awaiting approval)

Contract: canonical spec v1.2 FINAL + Erratum 4 / §13.2a.

Implemented:

- **No Ontario fallback.** `unlockRule()` throws for an unknown/absent pension
  jurisdiction; `tryUnlockRule()` is the non-throwing UI path.
- **Component-level status (§13.2a).** Each rule carries `unlockEntitlement`,
  `destinationVehicle` and `lifMaximum`, every one with `{source, verifiedDate,
  status}`. Gating is at the point of use; `recordStatus` (worst component) is
  display-only.
- **Manitoba.** `full65` retained and re-expressed as `fullUnlockAge: 65`. The
  one-shot `_split` boolean is replaced by `WorkingAccount.unlockedFraction`, so
  50%-at-55 and the balance-at-65 are two sequential entitlements re-evaluated
  each year.
- **PRRIF.** New `AccountType` member; RRIF minimums from creation, no maximum,
  pension-eligible at 65+. Manitoba's unlock destination.
- **Saskatchewan.** Added to `JurisdictionKey` with all three components
  `UNSUPPORTED`; unlocking and LIF maximums are withheld with a disclosure, never
  substituted. The selector shows it as not yet supported.
- **Federal.** Rule record carries `requiresVehicle: "RLIF"`, the 60-day window,
  the 50% cap and its one-time/no-carry-forward nature.
- **Quebec.** Age gate kept: maximum applies under 55 (`APPROXIMATE`), none at
  55+ (`VERIFIED`). No text or test implies "no maximum at any age".
- **Disclosures.** `ProjectionResult.lockedInDisclosures` carries withheld and
  approximate notices.
- **Saved-plan compatibility.** `AccountInput.juris` unchanged; read-time
  migration `_split: true → unlockedFraction`; unsupported jurisdictions load and
  render a withheld-results state instead of throwing.

Tests: `src/lib/planning/lockedin.test.ts` (17 tests) covering unknown-jurisdiction
throw, MB 55→65 sequence, MB PRRIF minimums before 71, SK refusal, QC 54 vs 55+,
ON FSRA table at {55,65,75,85}, jurisdiction-not-residence, complete rule metadata,
and the `_split` migration.

Verification: **178 tests passing**, clean typecheck.

Regression anchors — **all three held, no re-pinning**: Batch 0A single
**$278,614**, Batch 0A couple **$554,616**, Batch 0B accumulation **$2,254,682**.

Status: **Batch 0C implemented; held for review.** No later batch started.


## Batch 0A correction — Erratum 5 (transferee pension credit) — implemented 2026-08-21

Verified CRA defect (Form T1032, Step 4 / Note 1): a single scalar
`pensionEligible` cannot express the receiving spouse's independent age test.

- `IncomeComponents.pensionEligible` split into `pensionEligibleAnyAge` (RPP
  lifetime benefits, plus a bridge affirmed as `RPP_LIFETIME`) and
  `pensionEligible65Plus` (RRIF / LIF / PRRIF cash).
- `computeTax` uses `creditBase = anyAge + (age >= 65 ? p65 : 0)` for both the
  federal and provincial pension amounts.
- `householdTax` keeps the transferor's pool at `0.50 × (anyAge + p65)` and
  draws each transfer **proportionally** from the two streams, landing them in
  the transferee's matching streams. Ordinary-income movement unchanged.
- Backward compatibility: the legacy scalar is **kept and accepted**, read as
  `pensionEligibleAnyAge`. No `PlanInputs` change; saved plans unaffected.

Tests: 6 new cases in `pension-eligibility.test.ts` (transferee 64 vs 65,
any-age RPP to a 55-year-old, proportional draw, legacy scalar, single filer).

Verification: **184 tests passing**, clean typecheck.

Anchors: single filer **$278,614 unchanged** (as required). Couple anchor
**$554,616 did NOT move** and was therefore not re-pinned — A holds a $24,000
RPP lifetime pension, so the proportional draw sends far more any-age income to
B than the $2,000 pension amount can absorb, and B's capped credit is unchanged.
The reasoning is recorded in the test comment. Batch 0B accumulation
**$2,254,682 unchanged**.
