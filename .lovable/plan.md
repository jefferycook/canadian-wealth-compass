# Phase 0 — Financial Correctness (revised implementation contract)

Scope: correctness of the existing deterministic engine only. No optimizer, no
recommendation rebuild, no new dashboards, no large UI work. Each batch is a
self-contained PR with its own tests, reviewable and revertible alone.

Standing rules for this phase:
- No interim behaviour that is knowingly wrong. If a bound is not yet known, take the
  conservative path (e.g. sweep to non-registered) rather than an unbounded one.
- No number reaches a recommendation unless its underlying rule is marked VERIFIED.
- Residence province and pension jurisdiction are never interchangeable.

---

## Batch 0.1 — Pension-splitting search: full 0-50% range

**Files:** `src/lib/planning/tax.ts`
**Change:** `tryDir(from, to, pensionEligible)` — drop the pre-multiplied `0.5`; apply the
statutory ceiling exactly once, inside the loop (`T = maxT * f`, `f` to 0.50). Refine the
step from 5% to 1% (or bisect) so the optimum is not missed between steps. Clamp so the
transferor's `ordinary` cannot go negative.
**Types/schema:** none. **Output:** `splitAmt` rises for lopsided couples.
**Tests (write first):** lopsided couple ($80k DB pension vs $0) — chosen transfer equals
50% of eligible pension and household tax is strictly lower than the 25%-capped result;
equal-income couple — transfer near 0; `canSplit=false` — transfer 0; single filer —
unchanged.
**Compatibility:** safe. **Blast radius:** isolated to `tax.ts`; couple tax falls.
Single-filer $276,326 regression unaffected.

---

## Batch 0.2 — Pension-income eligibility: RRIF-status vs RRSP-status

**Files:** `src/lib/planning/projection.ts` (accumulators + `incomesForG`), `types.ts`
(working types only)
**Change:** split `schedRegCash` into `schedRrifCash` / `schedRrspCash`, and split the
solver's `add[].reg` the same way using each drawable account's converted status
(`isRRIFnow`). Then:
- `pensionEligible = penInc + bridgeInc + (age >= 65 ? mandatoryTaxable + rrifCash : 0)`
- RRSP-status cash is never pension-eligible at any age.
- RPP lifetime pension and RPP bridge income remain eligible at all ages — do not gate
  them on 65.
**Types/schema:** internal only; `PlanDraft` untouched.
**Output:** per-year `pensionEligible` and `splitAmt` fall for RRSP-melt plans; tax rises.
**Tests:** age-67 RRSP-only withdrawal — no $2,000 credit, not splittable; age-67 RRIF
withdrawal — credit granted, splittable; age-62 RRIF minimum — no credit, not splittable;
age-60 RPP pension — credit granted.
**Compatibility:** safe. **Blast radius:** feeds the draw solver; most couple and
melt-strategy results move, auto-strategy may flip.

---

## Batch 0.3 — Contribution-room foundation (TFSA + RRSP ledgers)

Must land before any sweep or deduction work. No unbounded contributions anywhere.

**Files:** new `src/lib/planning/room.ts`, wired into `projection.ts`; `draft.ts`,
`types.ts`, `defaults.ts` for the new inputs.

**Definition (binding):** entered `rrspRoom` and `tfsaRoom` are **available room as of the
plan start date** — i.e. they already include all prior-year accrual and carry-forward.
The engine therefore accrues **only from the first projected year forward** and never
re-accrues the start year. This is documented in the field help text and enforced by test.

**TFSA ledger, per person per year:**
opening available room (entered, or 0 if blank) + annual statutory amount
(from the rules table) + withdrawals made in the **prior** calendar year
− contributions made = running remaining room. Never negative.

**RRSP ledger, per person per year — required fields:**
- `openingRoom` — available room at plan start
- `priorYearEarnedIncome` — drives accrual
- `annualStatutoryMax` — the year's RRSP dollar limit (rules table)
- `pensionAdjustment` (PA) — per person per year, entered or derived from DB/DCPP
  membership; **required**, not optional
- `contributionsMade`
- `deductionsClaimed`
- `unclaimedDeductionCarryforward`
- `remainingRoom` (running)

Accrual = `min(0.18 × priorYearEarnedIncome, annualStatutoryMax) − PA`, floored at 0,
added to opening room, less contributions made.

**Explicitly unsupported for now (flagged, not silently ignored):** PSPA and PAR. Both
appear in the `approximations[]`/unsupported list surfaced by Batch 0.8, and the UI states
that a client with a past-service buyback or a pension termination should not rely on the
room figure.

**Types/schema:** per-person `pensionAdjustment: number | null` and
`priorYearEarnedIncome: number | null` on `PlanDraft`; `rrspRoom`/`tfsaRoom` keep their
names but gain the start-date definition. `ProjectionRow` gains `roomBy` for audit.
**Tests:** blank TFSA room → only the annual statutory amount is contributable each year;
entered $50k → $50k plus forward accrual only (never start-year double-accrual); a 10-year
save never exceeds cumulative room; couple uses two independent TFSA rooms; RRSP accrual
reduced dollar-for-dollar by PA; PA equal to the accrual → zero new room; room never
negative.
**Compatibility:** new fields default null → treated as "unknown", which caps
contributions at accrual-only. Saved plans load; contribution-heavy plans may now
contribute less. **Blast radius:** contribution years only.

---

## Batch 0.4 — RRSP contribution vs deduction claimed, and the net-income base

**Files:** `src/lib/planning/projection.ts`, `tax.ts`, `types.ts`, `room.ts`

**Model (binding):** contribution and deduction are separate quantities and must never be
collapsed into one number.
- `contributionMade` — cash into the RRSP; bounded by **contribution room** (0.3).
- `deductionClaimed` — amount deducted on that year's return; bounded by the
  **deduction limit** = available undeducted contributions (this year's contribution plus
  `unclaimedDeductionCarryforward`) and by room.
- `unclaimedDeductionCarryforward` — contributions made but not yet deducted, carried
  forward indefinitely and available to claim in a later, higher-bracket year.

**MVP default:** claim the maximum available deduction in the contribution year
(`deductionClaimed = min(contributionMade + carryforward, deductionLimit)`), so behaviour
is intuitive out of the box — but the ledger, types and per-year outputs carry both
figures independently, so a future optimizer can defer a deduction without any schema
change.

**Net income:** introduce a real `netIncome` in `computeTax`, distinct from `taxable`.
`netIncome` = income less the RRSP deduction claimed (and future deductions). The OAS
recovery tax, the federal BPA phase-out and the age amount all move onto `netIncome`;
bracket tax stays on `taxable`. This removes the §1.11 proxy exactly where it starts to
matter.

**Optional:** `reinvestRefund` toggle contributing the modelled tax saving to TFSA
(within room) then non-registered the following year.

**Types/schema:** per-year ledger fields above; `reinvestRefund: boolean` on the draft
(default true for new plans, null-safe for old).
**Tests:** working client contributing $10k pays less tax than contributing $0; TFSA
contribution produces no deduction; contribution allowed while deduction deferred →
carryforward grows and tax is unchanged that year; deduction claimed in a later year
reduces that year's tax; deduction never exceeds the deduction limit; OAS clawback for a
contributor near the threshold is computed on net, not taxable; retired client with no
contributions — numbers identical to pre-batch.
**Compatibility:** loads fine; accumulation-stage results change.
**Blast radius:** engine-wide for accumulation plans. Depends on 0.3.

---

## Batch 0.5 — Surplus cash sweep

**Files:** `src/lib/planning/projection.ts`
**Change:** when after-tax cash exceeds the spending target, sweep the excess:
1. to TFSA **only up to that person's verified remaining room from the 0.3 ledger**;
2. the remainder to non-registered, incrementing ACB by the amount swept.
There is no unbounded-TFSA path, interim or otherwise. If room is unknown (blank inputs),
TFSA remaining room is treated as the statutory annual accrual only, and everything else
goes to non-registered.
**Types/schema:** `ProjectionRow.surplusSwept` (split TFSA / non-reg) for audit.
**Tests:** forced-RRIF-minimum surplus year increases balances by exactly the surplus;
surplus above TFSA room lands entirely in non-registered; a shortfall year sweeps nothing;
swept non-reg raises ACB so no phantom gain appears on later withdrawal; estate strictly
increases vs pre-fix on a minimum-heavy plan; TFSA room after sweeping is never negative.
**Compatibility:** safe. **Blast radius:** raises balances and estates broadly; auto
tie-break on estate may pick a different strategy. Depends on 0.3.

---

## Batch 0.6 — Tax-table indexation, rule-by-rule

**Files:** `src/lib/planning/taxYears.ts` (restructured into rule records), `tax.ts`,
`projection.ts`

**Change:** no blanket indexation. Every rules-data item becomes a record carrying:

```text
{ value, effectiveYear, jurisdiction, indexable: true|false,
  indexationMethod: "CPI" | "AWE" | "statutory-table" | "none",
  source, verification: "VERIFIED" | "APPROXIMATE" | "UNVERIFIED" }
```

Indexation is then applied per item according to its own `indexable` /
`indexationMethod`, for years beyond the last published table only. Published years always
use exact tables. Initial classification to be sourced item by item (CRA indexation
tables for federal brackets/BPA/age amount/pension amount/OAS threshold; provincial
indexation varies by province; Ontario surtax thresholds and the health-premium schedule
are classified individually rather than assumed). Anything not yet sourced ships as
`UNVERIFIED` + `indexable: false` and is listed in the disclosure output — never guessed.

**Types/schema:** `taxIndexation: number | null` on `PlanDraft.tax` (default = plan
inflation). No change to `PlanDraft` beyond that field.
**Tests:** flat-real income over 30 years → flat real tax; all-TFSA 40-year plan → tax
stays ~0; `taxIndexation = 0` reproduces today's numbers exactly; an item marked
`indexable: false` does not move across 30 years; every rule record has a source and a
verification status (schema test).
**Compatibility:** saved plans load; **results change** (lifetime tax falls). Needs a
one-line in-app note. **Re-baselines the $276,326 golden number** — old value preserved as
the `taxIndexation = 0` legacy fixture.

---

## Batch 0.7A — Locked-in unlocking safety

**Files:** `src/lib/planning/registered.ts`, `projection.ts`, `levers.ts`/`analysis.ts`
(consumption guard only)

**Change:**
1. **Remove `full65: true` for Manitoba.** The automatic 100%-unlock-at-65 behaviour is
   removed from the engine; Manitoba reverts to its regulator-verified age-based rule and
   anything not verified is not modelled.
2. Model **only regulator-verified** age-based unlocking rules. Every rule record carries
   jurisdiction, percentage, minimum age, mechanism note, source citation and
   `verification: VERIFIED | UNVERIFIED`.
3. Percentages are **maxima ("up to X%")**, never a forced amount. The engine unlocks the
   client's requested percentage clamped to the verified maximum; it never defaults to the
   maximum on the client's behalf.
4. Preserve one-time application: the existing `_split` guard is tested explicitly so an
   unlock cannot recur in a later year.
5. Unlocking is driven strictly by the account's **pension jurisdiction**; residence
   province is never substituted, and an account with no jurisdiction is an input error,
   not an implicit default.
6. **Recommendation guard:** any unlock-related suggestion is suppressed unless the
   governing rule is `VERIFIED`. Unverified jurisdictions produce an informational
   "verify with your plan administrator" note instead of a recommendation.

**Types/schema:** `UnlockRule` gains `source`, `verification`, `mechanismNote`; `full65`
is deleted. Saved accounts unchanged.
**Tests:** Manitoba at 65 does **not** unlock 100%; a requested 20% unlock in a 50%
jurisdiction unlocks 20%, not 50%; a requested 80% clamps to the verified maximum; unlock
occurs at most once across the whole projection; an Ontario LIRA held by a BC resident
uses Ontario rules; an account with no jurisdiction throws/flags rather than defaulting;
no unlock recommendation is emitted for an UNVERIFIED jurisdiction.
**Compatibility:** Manitoba plans that previously unlocked fully will change materially —
this is the point. Flag it in the plan's change note.
**Blast radius:** locked-in plans only, but potentially large for those clients.

---

## Batch 0.7B — LIF maximum tables and disclosure

**Files:** `src/lib/planning/registered.ts`, `projection.ts`
**Change:** (a) remove the `a.juris ?? provinceKey` fallback in `lifMaxFactor` — residence
must never stand in for pension jurisdiction; (b) add published maximum tables for the
jurisdictions actually offered, starting with FED and AB, each with source and
verification status; (c) keep the 6% annuity formula only as an explicitly labelled
fallback; (d) surface `lifApproximate` per row so the UI can disclose it; (e) Quebec's
no-maximum-at-55+ stays, sourced and flagged.
**Types/schema:** `ProjectionRow.lifApproximate: boolean`.
**Tests:** ON LIF max matches the FSRA table at ages 55/65/75/85; QC 55+ has no maximum;
FED/AB match their published tables within tolerance; a formula-fallback jurisdiction sets
`lifApproximate = true`; a LIF-bound plan reports `lifBound = true`.
**Compatibility:** safe. **Blast radius:** LIF-constrained plans only.

---

## Batch 0.8 — Jurisdiction and province guardrails

**Files:** `taxYears.ts`, `draft.ts`, `summary.ts`, minimal `PlanWizard.tsx`
**Change:** the province dropdown already offers only tabled provinces (ON/BC/AB/CUSTOM);
add a saved-plan-load validation that catches an untabled province and renders a clear
"not yet supported" state instead of a thrown projection. Label `CUSTOM` as illustrative
only, not a real jurisdiction. Add a machine-readable `approximations[]` and
`unsupported[]` list to `PlanOutput` covering: annual time step, proportional ACB,
same-year OAS clawback, single inflation rate, formula-based LIF maximums, no non-eligible
dividends, PSPA/PAR unsupported, unverified unlocking jurisdictions, and any rule record
still marked UNVERIFIED.
**Tests:** a plan with province `QC` yields a friendly unsupported result, not a throw;
`approximations[]` is non-empty, stable and includes every UNVERIFIED rule in use.
**Compatibility:** safe.

---

## Batch 0.9 — Terminal return at death

**Files:** new `src/lib/planning/terminal.ts`, `engine.ts`, `projection.ts`
**Change:** replace the flat 0.62 / 0.92 / 1.00 haircuts in `afterTaxEstate` with a real
terminal T1: full registered FMV added to the final-year income and taxed through
`computeTax`; deemed disposition of non-registered at the statutory inclusion rate against
tracked ACB; taxable hard assets deemed-disposed against ACB with the principal residence
exempt; TFSA at par. First death with a surviving spouse applies the rollover (no terminal
tax on rolled assets); the full inclusion lands on the last death.

**Terminology (binding):** probate / estate administration fees, executor compensation,
legal and final-expense costs are **out of scope for this batch**. The output is therefore
labelled **"Estate value after income tax at death"** — never "net estate" or "after all
estate costs". `PlanOutput` carries an explicit `estateCostsIncluded: false` flag plus an
`excludes[]` list (probate/estate administration fees, executor compensation, legal and
accounting fees, final expenses, US estate tax), and the UI renders that exclusion note
alongside the figure.

**Types/schema:** `PlanOutput` gains an estate breakdown (registered inclusion, deemed
gains, terminal tax, estate value after income tax, `estateCostsIncluded`, `excludes[]`).
**Tests:** single person dying at 90 with a $500k RRIF shows a terminal-year tax spike well
above 38% of the RRIF; couple — near-zero incremental tax on the first death, full
inclusion on the second; TFSA never taxed at death; non-reg with ACB = FMV produces no
terminal gain; principal residence produces no gain; `estateCostsIncluded` is false and
`excludes[]` is non-empty.
**Compatibility:** loads fine; the headline estate figure changes for everyone.
**Blast radius:** largest of Phase 0 — `afterTaxEstate` is also the auto-strategy
tie-breaker, so strategy selection will shift. Ship last, alone.

---

## Batch 0.10 — Golden-suite re-baseline

Consolidate golden numbers: keep the original $276,326 as an explicit legacy fixture
("2026 tables, no indexation, no surplus sweep, old estate proxy"), and add new golden
values for the corrected engine across four fixtures — single filer, lopsided couple,
accumulation-stage contributor with a PA, and a LIF-constrained locked-in client. Add an
invariant suite: tax monotonic in income; after-tax cash monotonic in the gross draw; no
negative balances; contribution room and deduction carryforward never negative; deduction
claimed never exceeds the deduction limit; split transfer never exceeds 50% of eligible
pension; no unlock recurs; every rule record in use has a source and verification status.

---

## Deliberately out of scope for Phase 0

Dynamic bracket-filling optimizer, recommendation-engine rebuild, non-eligible dividends,
spousal RRSPs and attribution, PSPA/PAR, RRIF younger-spouse election, GIS, capital-loss
carry-forwards, Quebec/QPP, new provinces, spending curves, probate/estate-cost modelling,
new dashboards, printable reports.
