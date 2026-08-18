# Phase 0 — Financial Correctness

Scope limited to correctness of the existing deterministic engine. No optimizer, no
recommendation rebuild, no new dashboards, no large UI work. Each batch is a
self-contained PR with its own tests and can be reviewed and reverted alone.

Ordering rule: batches that do not move the single-filer regression number come first;
batches that deliberately re-baseline it come later and do so explicitly.

---

## Batch 0.1 — Pension-splitting search: full 0-50%

**Files:** `src/lib/planning/tax.ts`
**Change:** `tryDir(from, to, pensionEligible)` (drop the pre-multiplied 0.5); keep the
statutory ceiling once, inside the loop, as `T = maxT * f` with `f` stepping to 0.50.
Refine the step from 5% to 1% (or bisect) so the optimum is not missed between steps.
Clamp the transfer so the transferor's `ordinary` never goes negative.
**Types/schema:** none. **Output:** `splitAmt` values rise for lopsided couples.
**Tests (write first):** lopsided couple (one $80k DB pension, one $0) — assert the
chosen transfer equals 50% of eligible pension, and that household tax is strictly lower
than the 25%-capped result; equal-income couple — assert transfer near 0; `canSplit=false`
— assert 0; single filer — unchanged.
**Compatibility:** safe. **Blast radius:** isolated to `tax.ts`, but couple projections
change (tax down). Single-filer $276,326 regression unaffected.

---

## Batch 0.2 — Pension-income eligibility: separate RRIF-status from RRSP-status

**Files:** `src/lib/planning/projection.ts` (accumulators + `incomesForG`), `types.ts`
(working accumulator types only)
**Change:** split `schedRegCash` into `schedRrifCash` / `schedRrspCash`, and split the
solver's `add[].reg` the same way using each drawable account's converted status
(`isRRIFnow`). Then:
- `pensionEligible = penInc + bridgeInc + (age>=65 ? mandatoryTaxable + rrifCash : 0)`
- RRSP-status cash is never pension-eligible at any age.
- Bridge/RPP pension income stays eligible at all ages (RPP lifetime pension qualifies
  under 65 — do not gate it on 65).
**Types/schema:** internal only; `PlanDraft` untouched.
**Output:** per-year `pensionEligible` and `splitAmt` fall for RRSP-melt plans; tax rises.
**Tests:** age-67 RRSP-only withdrawal — no $2,000 credit, not splittable; age-67 RRIF
withdrawal — credit granted, splittable; age-62 RRIF minimum — no credit, not splittable;
age-60 RPP pension — credit granted.
**Compatibility:** safe. **Blast radius:** feeds the draw solver, so most couple and
melt-strategy results move. Auto-strategy selection may flip on some plans.

---

## Batch 0.3 — Surplus cash sweep

**Files:** `src/lib/planning/projection.ts`
**Change:** when `afterTax > spendTarget`, sweep the excess into TFSA (bounded by that
person's remaining room, once Batch 0.5 lands; unbounded interim with a TODO) then
non-registered, incrementing ACB by the swept amount.
**Types/schema:** none. Add `surplusSwept` to `ProjectionRow` for auditability.
**Tests:** forced-RRIF-minimum surplus year increases TFSA/non-reg balance by exactly the
surplus; a shortfall year sweeps nothing; sweeping into non-reg raises ACB so no phantom
gain appears on later withdrawal; estate strictly increases vs. pre-fix on a
minimum-heavy plan.
**Compatibility:** safe. **Blast radius:** raises balances and estates across the board;
`runPlan`'s auto tie-break (estate) may pick a different strategy.

---

## Batch 0.4 — Tax-table indexation beyond the published year

**Files:** `src/lib/planning/taxYears.ts`, `tax.ts` (signature unchanged), `projection.ts`
(pass the year offset / indexation factor)
**Change:** add `indexTaxYear(base, factor, years)` producing an indexed copy of brackets,
federal + provincial BPA, age amounts and thresholds, pension amounts, and the OAS
recovery threshold. Published years use exact tables; later years index at
`inputs.taxIndexation ?? inputs.inflation`. Non-indexed items (surtax thresholds, health
premium bands) documented explicitly either way.
**Types/schema:** optional `taxIndexation: number | null` on `PlanDraft.tax` (defaults to
inflation; saved plans load as null → same default).
**Tests:** flat-real income over 30 years → flat real tax; all-TFSA 40-year plan → tax
stays ~0; indexation = 0 reproduces today's numbers exactly.
**Compatibility:** saved plans load fine, but **results change** — a plan re-opened after
this batch shows lower lifetime tax. Needs a one-line in-app note.
**Blast radius:** engine-wide. **Re-baselines the $276,326 golden number.** Keep the old
value as an explicit `indexation = 0` regression test and add a new indexed golden number.

---

## Batch 0.5 — Per-person contribution-room ledger

**Files:** new `src/lib/planning/room.ts`, wired into `projection.ts`
**Change:** track running TFSA and RRSP room per person per year: opening room (entered
carry-forward, or accrual-only when blank), plus annual accrual (TFSA dollar amount;
RRSP 18% of prior-year earned income capped at the dollar limit), minus contributions
made. Contributions clamp to available room. Couples use both spouses' rooms.
**Types/schema:** no draft change (`tfsaRoom`/`rrspRoom` already exist, nullable).
`ProjectionRow` gains `roomBy` for display/audit.
**Tests:** blank TFSA room → only the annual amount accepted per year; entered $50k →
$50k + accrual; a 10-year save never exceeds 10x annual room; couple uses two TFSA rooms;
contribution above room is truncated, not silently accepted.
**Compatibility:** safe. **Blast radius:** limited to contribution years; retired-only
plans unchanged. Prerequisite for 0.6.

---

## Batch 0.6 — RRSP deduction, refund, and the net-income base

**Files:** `src/lib/planning/projection.ts`, `tax.ts`, `types.ts`
**Change:** (a) reduce the contributor's `ordinary` income by the room-bounded deductible
RRSP contribution; (b) introduce a real `netIncome` distinct from `taxable` in
`computeTax`, and drive the OAS clawback, BPA phase-out and age amount off `netIncome`;
(c) optional `reinvestRefund` toggle that contributes the tax saving to TFSA then non-reg
the following year.
**Types/schema:** `reinvestRefund: boolean` on the draft, default true for new plans,
false-equivalent for old plans unless upgraded.
**Tests:** working client contributing $10k pays less tax than contributing $0; TFSA
contribution produces no deduction; deduction capped at room (depends on 0.5); OAS
clawback computed on net, not taxable, for a contributor near the threshold; retired
client with no contributions — numbers identical to pre-batch.
**Compatibility:** safe to load; accumulation-stage results change.
**Blast radius:** engine-wide for accumulation plans. Must ship as one batch with 0.5.

---

## Batch 0.7 — LIF maximum jurisdiction correctness

**Files:** `src/lib/planning/registered.ts`, `projection.ts`
**Change:** (a) fix `lifMaxFactor(age, a.juris ?? provinceKey, ...)` — never fall back to
the residence province; default to the plan's declared jurisdiction or fail loudly;
(b) add published maximum tables for the jurisdictions actually offered (start with FED
and AB); (c) mark every non-tabled jurisdiction `approximate: true` and surface that flag
in `ProjectionResult` so the UI can disclose it; (d) keep the annuity formula only as a
labelled fallback.
**Types/schema:** `ProjectionRow.lifApproximate: boolean`.
**Tests:** ON LIF max matches the FSRA table at ages 55/65/75/85; QC 55+ has no maximum;
an account with no `juris` does not silently adopt the residence province; a LIF-bound
plan reports `lifBound = true` and `lifApproximate` where relevant.
**Compatibility:** safe. **Blast radius:** only LIF-constrained plans.

---

## Batch 0.8 — Jurisdiction / province guards and disclosure

**Files:** `taxYears.ts`, `draft.ts`, `PlanWizard.tsx` (minimal), `registered.ts`
**Change:** the province dropdown already only offers tabled provinces — add a
saved-plan-load validation that catches an untabled or `CUSTOM` province and shows a clear
"not yet supported" state instead of a thrown projection. Label `CUSTOM` as illustrative
only. Add a machine-readable `approximations[]` list to `PlanOutput` covering the items
the spec classifies [A]: annual time step, proportional ACB, same-year OAS clawback,
single inflation rate, non-tabled LIF maximums, no non-eligible dividends.
**Tests:** loading a plan with province `QC` yields a friendly unsupported result, not a
throw; `approximations[]` is non-empty and stable.
**Compatibility:** safe.

---

## Batch 0.9 — Terminal return at death

**Files:** new `src/lib/planning/terminal.ts`, `engine.ts`, `projection.ts`
**Change:** replace the flat 0.62/0.92/1.00 haircuts in `afterTaxEstate` with a real
terminal return: full registered FMV added to the final-year income and taxed through
`computeTax`; deemed disposition of non-registered at 50% inclusion against tracked ACB;
taxable hard assets deemed-disposed against ACB with the principal residence exempt; TFSA
at par. First death with a surviving spouse applies the rollover (no terminal tax on
rolled assets); the full hit lands on the last death.
**Types/schema:** `PlanOutput` gains an estate breakdown (registered inclusion, deemed
gains, terminal tax, net estate).
**Tests:** single person dying at 90 with a $500k RRIF shows a terminal-year tax spike
well above 38% of the RRIF; couple — near-zero incremental tax on the first death, full
inclusion on the second; TFSA never taxed; non-reg with ACB = FMV produces no terminal
gain.
**Compatibility:** safe to load; the headline estate number changes for everyone.
**Blast radius:** largest of Phase 0 — `afterTaxEstate` is also the auto-strategy
tie-breaker, so strategy selection will shift. Ship last, alone.

---

## Batch 0.10 — Re-baseline and lock the suite

Consolidate golden numbers: keep the original $276,326 as an explicit
"2026 tables, no indexation, no surplus sweep" legacy fixture, and add new golden values
for the corrected engine (single filer, lopsided couple, accumulation-stage contributor,
LIF-constrained client). Add an invariant suite: tax monotonic in income, after-tax cash
monotonic in the gross draw, no negative balances, room never negative, split transfer
never exceeds 50% of eligible pension.

---

## Deliberately out of scope for Phase 0

Dynamic bracket-filling optimizer, recommendation-engine rebuild, non-eligible dividends,
spousal RRSPs and attribution, RRIF younger-spouse election, GIS, capital-loss
carry-forwards, Quebec/QPP, new provinces, spending curves, new dashboards, printable
reports.
