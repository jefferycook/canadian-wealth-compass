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

Status: **Batch 0B complete.** Batch 0C not started; awaiting instruction.
