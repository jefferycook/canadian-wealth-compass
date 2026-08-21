# Implementation / change log

Methodology baseline: `docs/CANONICAL-ENGINE-SPECIFICATION-v1.2-FINAL.md` (v1.2 FINAL,
Errata 1–5).

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


### Jurisdiction verification, 2026-08-21 (Batch 0C follow-up)

Four locked-in records reconciled against tier-1 regulators. No golden anchor
moved (201,470 / 411,408 / 2,176,860 all unchanged).

- **Alberta — promoted to VERIFIED.** Alberta Superintendent of Pensions,
  *Interpretive Guideline #04 — Unlocking of Pension Benefits*
  (https://open.alberta.ca/dataset/623fa691-3296-4bf4-ae01-ebd3cd657f99/resource/74e60c33-cf1c-4d3e-92da-b625a2c1a2b4/download/ig-04-unlocking-of-pension-benefits.pdf).
  Confirms 50% from age 50, one-time, to cash / RRSP / RRIF — our coded values
  were correct. `unlockEntitlement` and `destinationVehicle` are now VERIFIED;
  `lifMaximum` stays APPROXIMATE (no published table). Recorded but not
  modelled: the unlock must occur *as the money moves into* the LIF/LITB, and
  Alberta's small-amount threshold is 20% of YMPE.
- **Nova Scotia — promoted to VERIFIED.** NS Department of Finance, *Form 20*
  (https://novascotia.ca/finance/pensions/docs/pensions-form-20.pdf). 50% at 55
  from a Schedule 4A LIF, one-time with no second chance, invalid after 60 days.
  Added `requiresVehicle: "ScheduleLIF"` and `transferWindowDays: 60`, the same
  shape as Ontario's Schedule 1.1 LIF and the federal RLIF. `lifMaximum` stays
  APPROXIMATE.
- **British Columbia — promoted to VERIFIED as a confirmed absence.** BCFSA,
  *Unlocking pension funds*
  (https://www.bcfsa.ca/public-resources/pensions/unlocking-pension-funds):
  BC legislation does not allow the 50% one-time unlocking provision. Our
  `partialPct: 0` is now positively verified rather than merely unchecked. The
  four permitted circumstances and the two YMPE thresholds (20% = $14,920 under
  65; 40% = $29,840 at 65+) are recorded in `notes`.
- **New Brunswick — WITHDRAWN as UNSUPPORTED.** FCNB, *Pension Transfers and
  Withdrawals*
  (https://fcnb.ca/en/personal-finances/pensions-and-retirement/pension-transfers-and-withdrawals):
  the entitlement is the **lesser of** three times the annual amount or 25% of
  the LIF balance, from a LIF, to a RRIF, with no stated age condition. Our flat
  25%-at-55-to-an-RRSP record **overstated** the entitlement, an error in the
  client's favour. All three components are UNSUPPORTED per the Saskatchewan
  ruling (Erratum 4); nothing is substituted. Queued on the backlog.

Two gating defects fixed in the same pass:

1. **APPROXIMATE unlocking entitlements are now disclosed.** The projection's
   unlock loop only disclosed an APPROXIMATE *destination vehicle*; the
   entitlement — the percentage and minimum age that decide how much money
   moves — raised nothing. §13.2 requires the flag wherever the number is
   displayed, so a parallel, client-actionable disclosure was added.
2. **`lifMaximumFor` reads the component, not the jurisdiction.** It returned
   `juris === "ON" ? "VERIFIED" : "APPROXIMATE"`, making the jurisdiction the
   source of truth in place of the component (§13.2a). It now returns
   `r.lifMaximum.status`; the Ontario-table-versus-formula choice of which
   number to compute is unchanged. A test pins the two together.

Test tightening: the Manitoba projection assertion was a one-sided
`> 0.3` floor that would pass on a 90% unlock. It is now two-sided
(`> 0.30`, `< 0.45`) around the observed 0.369 year-end share — the exact-50%
property is asserted structurally by `maxUnlockPctAtAge(UNLOCK_RULES.MB, 55)`.
(The brief's suggested 0.40–0.60 band does not hold: the PRRIF pays its RRIF
minimum in the unlock year while the locked side compounds, so the year-end
share sits below 0.40. The upper bound is the half that matters and is kept.)

**214 tests passing**, clean typecheck.


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


## Batch 0D — Projection integrity — implemented 2026-08-21

Three sources of projection distortion removed, per the canonical
specification (v1.2 FINAL + Errata 1–5).

### 1. Indexation of statutory amounts (§12)

`taxYears.ts` gains `indexTaxYear()`, `indexationFactor()` and `LATEST_TAX_YEAR`.
`getTaxYear(year, rate)` now derives any year past the last published table by
indexing the **income-tax** amounts it owns — bracket thresholds, the federal
and provincial basic personal amounts, the age amount, provincial pension
amounts and the OAS recovery threshold — at a stated rate. The projection
applies the same factor to the client's own statutory overrides
(`fedBPA`, `provBPA`, `oasThresh`), because those are amounts that index in law.

**Not in scope, and not indexed here:** the **federal pension income amount**,
fixed at $2,000 (see the 0D defect entry below), and the **TFSA/RRSP dollar
limits**. `taxYears.ts` does not own the contribution limits at all —
statutory room accrual lives in `room.ts` (Batch 0B) and is unchanged by 0D.
An earlier draft of this entry listed them; that was wrong.
**Rates are never indexed; only amounts.** Derived tables carry `derivedFrom`
and are labelled APPROXIMATE at the point of use. Published years are returned
untouched. Backwards years never index. The rate is `PlanInputs.indexationRate`
when supplied, otherwise the plan's inflation assumption.

**Still deferred — non-eligible dividends (§6.2 [G]).** The Batch 0D interface
sketch lists a `nonEligDiv` yield, but it is deliberately **not implemented**
and `YieldVector` does not accept one. Taxing non-eligible (CCPC) dividends
needs per-province non-eligible gross-up and dividend tax credit rates that are
not in the verified rules layer, and rating them at eligible-dividend rates
would **understate** tax. The engine therefore models no non-eligible dividend
rather than a wrong one. §6.2 remains an open [G] gap on the correctness
backlog; the review patch of 2026-08-21 confirmed the deferral rather than
closing it.

### 2. Non-registered return decomposition (§6.1, §6.3)

New `nonreg.ts`. `totalReturn = priceReturn + interest + eligDiv + cgDist + roc`.
Distributions now accrue **regardless of the sign of the price return** — the
old code gated all taxable yield on `growth > 0`, handing the client a tax
holiday in every down year. Reinvested distributions raise ACB; return of
capital lowers it with a floor at zero, the excess realized as a capital gain
in that year and disclosed. Legacy `mix` accounts are handled backward
compatibly by resolving yields off the account's *expected* return, so a
positive-return year is numerically unchanged.

Not modelled: non-eligible (CCPC) dividends — remains a [G] gap on the backlog.

### 3. After-tax surplus sweep

After-tax cash above the spending target used to vanish from the balance sheet.
It is now reinvested: TFSA first (through the Batch 0B room ledger, capped at
KNOWN room, never unknown room), remainder to non-registered with full ACB.
Reported per row as `surplusSwept`.

### 4. Auto-strategy label (§7.8)

`runPlan` marks an automatically selected withdrawal order
`autoSelectionStatus: "APPROXIMATE"` with a caveat string, surfaced in the
results panel alongside the indexation and ACB notices.

### Verification

**202 tests passing** (18 new in `projection-integrity.test.ts`), clean typecheck.

### Intentional golden movements

| Fixture | Before | After | Cause |
| --- | --- | --- | --- |
| Single filer (Ontario) | 278,614 | **198,394** | Indexation only. With `indexationRate: 0` the fixture reproduces 278,614 exactly; it sweeps $0 and its non-registered numbers are unchanged. Asserted as a test. |
| Couple | 554,616 | **407,458** | Indexation of the derived tax years. Erratum 5 behaviour unchanged. |
| Accumulation | 2,254,682 | **2,164,651** | Two causes: indexation (down) and the surplus sweep (up). $1,483,280 of surplus over the run is now reinvested and earns taxable distributions. Holding `indexationRate: 0` isolates the sweep at 3,545,773. |

The single-filer move is the pre-0D defect being removed: freezing 2026
brackets for thirty years while income inflates taxed a flat-real retirement
income at a steadily rising effective rate.

### Room-guard test adjustment

Two Batch 0B lump-sum guards measured room consumption as a *balance delta*
between two plans. The surplus sweep also contributes to the TFSA, so the base
plan now consumes the same room and the delta no longer isolates the lump sum.
The guards were re-expressed against the room ledger itself
(`row.roomLedger[].tfsa.contributions` vs available room), which states the
invariant directly. The invariant is unchanged and still enforced.

Status: **Batch 0D implemented; held for review.** No later batch started.

### 5. Federal pension income amount is not indexed (defect fix, 2026-08-21)

`indexTaxYear()` was indexing `fedPenAmt`. The federal pension income amount
(line 31400) is a **fixed $2,000** under ITA s.118(3): unchanged since 2006 and
absent from CRA's indexation-adjustment tables
(https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/adjustment-personal-income-tax-benefit-amounts.html,
verified 2026-08-21 — that pull also corroborates `fedBpaMin: 14829`,
`fedAgeAmt: 9208` and `oasThreshold: 95323` as coded). Over 30 years at 2.1%
the credit base drifted to ~$3,730, overstating the federal pension credit and
**understating** household tax.

`fedPenAmt` now carries through unindexed. **Provincial** pension amounts do
index and `indexProvince()`'s `penAmt: idx(p.penAmt, f)` is unchanged
(Ontario $1,796 for 2026).

| Fixture | Before | After | Move |
| --- | --- | --- | --- |
| Single filer (Ontario) | 198,394 | **201,470** | +1.55% |
| Couple | 407,458 | **411,408** | +0.97% |
| Accumulation | 2,164,651 | **2,176,860** | +0.56% |

All three move upward, all well inside the 3% sanity gate; the accumulation
fixture moves least, as most of its run is pre-retirement. The
`indexationRate: 0` single-filer isolation still reproduces **278,614** exactly.

Tests: 3 new cases in `projection-integrity.test.ts` (pinned `fedPenAmt` at
2060 with the other federal amounts strictly rising, ON `penAmt` still
indexing, published 2026 untouched). **207 tests passing**, clean typecheck.


## Phase 0 review patch — verification gaps closed — 2026-08-21

Independent review found four verification gaps in the Phase-0 exit / Batch-0D
evidence. **No methodology changed, no defect was exposed, and the three
existing golden anchors did not move** (201,470 / 411,408 / 2,176,860).

1. **Flat-real indexation test (required by the 0D contract).** The suite only
   proved indexed lifetime tax < frozen lifetime tax, which a half-right
   indexation rate would also satisfy. Added a direct 30-year invariant test:
   a controlled Alberta fixture (age 45, ordinary income only, no surtax or
   health premium) where nominal income and every statutory amount rise at 2%.
   Real tax is flat to **< 0.05%** across 30 years. The same fixture against
   frozen tables drifts **+32%** and rises monotonically every year, so the
   test demonstrably fails against the pre-0D behaviour.
2. **Down-year end-to-end test.** The old test set returns to 0 and asserted
   lifetime tax > 0 — a flat year, not a loss year, and it never read a
   distribution figure. Replaced with a controlled projection fixture: a single
   non-registered account, explicit 2% interest + 1% eligible-dividend yields,
   and a −20% total return. Asserts in the SAME row that the balance falls by
   far more than the withdrawal AND that `distributionsTaxable` is exactly
   $15,000 with taxable income equal to the interest plus the grossed-up
   dividend. Two companion tests pin that an up year and a down year distribute
   identically while their balances diverge, and that zeroing the yields
   collapses the figure to zero (so the assertions are driven by the yield
   vector reaching the projection, not by another income source).
3. **Locked-in golden fixture (Phase 0 exit criterion 2, §12).** The exit
   criterion requires single, couple, accumulation AND locked-in goldens; only
   three existed. Added `lockedInGoldenFixturePlan()` — a Manitoba client,
   LIRA $400k converting at 55, `unlock: 100` requested and clamped by
   jurisdiction, 37 projected years, funded in every year (no shortfall, never
   LIF-bound). It exercises what a one-year unit test cannot: the 50%
   entitlement at 55, the **balance-at-65 entitlement taken as an increment on
   the same account ten years later**, the clamp, and the PRRIF destination
   forcing RRIF minimums before 71.

   | Locked-in golden | Value |
   |---|---|
   | Lifetime tax | **111,905** |
   | Terminal portfolio | **144,512** |

   The anchor is load-bearing: capping the account at the 55 entitlement alone
   (a one-shot flag, the Batch 0C defect) moves lifetime tax to 103,413. A test
   asserts the two differ and that the capped run is strictly lower.
4. **Changelog accuracy.** Corrected the 0D indexation entry, which wrongly
   listed "TFSA/RRSP dollar limits" among the amounts `getTaxYear` indexes, and
   recorded the continuing §6.2 non-eligible-dividend deferral (both above).

**Suite after the patch: 223 tests passing** (was 214), clean typecheck.


## Batch 0D defect [C] — contributions are a use of cash — 2026-08-21

**Severity [C]: the engine overstated client wealth on every contributing
plan.** Raised by Jeff and recorded in `AGENT-STATUS.md` before the code change.

`applyContribution` added `a.contrib * infFac` to the account balance and to
`contribTotal`, but nothing was subtracted from `fixedCash` and nothing added to
`spendTarget`, while `fixedCash` already held the full `employInc` funding it.
The same dollars counted twice. Before Batch 0D the error was self-cancelling
and invisible — the year-end surplus vanished, implicitly paying for the
contributions. **0D's sweep removed the vanishing without adding the outflow.**

On `accumulationGoldenFixturePlan`, year one: 190,000 of employment income,
29,000 of contributions, an 84,000 spend target, solver at `G = 0`, and the
whole surplus swept — a deposit of `29,000 + surplus` in a year the household
had only `surplus` to spare, repeated across a ~20-year contribution window and
compounded at the equity return.

**Fix.** `contribTotal` is now a term in `spendTarget`, with a comment at the
site recording why (it is exactly the kind of line a later edit would innocently
delete). Only `countAsContribution: true` placements are included — asserted
account contributions and goal saves, both genuine outflows. Registered lump
sums pass `false` (an inflow being allocated, not cash to find) and so does the
sweep, which is what keeps it non-circular. Secondary effect: the draw solver
and `fundingShortfall` now see contributions, so a retiree still contributing
draws to fund it or is flagged.

*Alternative not taken, recorded for review:* subtracting `contribTotal` from
`afterTax` for the surplus only. Identical whenever there is a surplus; differs
only where the household must draw. The `spendTarget` route was chosen so
solver, shortfall flag and sweep stay consistent. Open to being overruled.

| Golden anchor | Before | After |
|---|---|---|
| Accumulation | 2,176,860 | **1,762,590** (−19.0%, downward as predicted) |
| Single filer | 201,470 | **201,470** — unmoved (`contrib: 0` throughout) |
| Couple | 411,408 | **411,408** — unmoved (`contrib: 0` throughout) |

**Tests added** (`projection-integrity.test.ts`, controlled one-year fixtures
with zero returns and zero yields so the cash identity is exact):

1. *Conservation* — total placed into accounts equals `contribTotal +
   surplusSwept` and is `<= grossCash − tax − baseSpend + 0.01`; pre-fix it
   exceeded that by exactly the contribution.
2. *One-for-one displacement* — two plans differing only by a $10,000 TFSA
   contribution: tax identical, `surplusSwept` lower by exactly 10,000, and
   year-end portfolio equal to within a dollar. Pre-fix the contributing plan
   ended 10,000 richer from nowhere. This is the assertion that pins it closed.
3. *Solver awareness* — a retiree whose pension covers spending but not
   spending plus the contribution must draw or report `fundingShortfall`,
   never silently absorb it.

**Suite: 227 tests passing**, clean typecheck. Nothing deployed.


---

## BC correctness pass — stale age amount and wrongly-applied indexation — 2026-08-21

Scoped correction found by independent overnight verification. Unrelated to the
open CPP-survivor `[C]` blocker, which remains open and untouched.

**Sources (tier 1).** Province of British Columbia, *B.C. basic personal income
tax credits* (last updated 2026-04-20); Province of British Columbia, *Personal
income tax rates* (last updated 2026-04-17) / Budget 2026 tax measures.

**Defect 1 — stale BC credit amounts.** `TAX_2026.provinces.BC` carried
`ageAmt: 5691` and `ageThresh: 42580`. The published 2026 figures are **$5,927**
and **$44,119**. Corrected.

**Defect 2 — BC indexation is paused 2027–2030.** Budget 2026 pauses indexation
of BC brackets and non-refundable personal credit amounts for tax years
**2027 through 2030**, resuming **2031**. `indexProvince()` indexed every
province in every derived year, so BC was inflated across four years it should
have been frozen. Indexation is now jurisdiction-aware:

- `ProvinceTax.indexationPause?: { from, to }` records the frozen range.
- New exported `provincialIndexationFactor(p, baseYear, year, rate)` returns `1`
  inside the pause and the ordinary compounded factor otherwise; `indexTaxYear`
  calls it per province instead of applying one federal factor to all of them.
- 2031+ resumes **prospectively from the frozen 2030 (= 2026) amount**, with
  **no catch-up** for the paused years: the exponent counts only unpaused years,
  so 2031 = `base x (1 + r)`, 2032 = `base x (1 + r)^2`. Primary law: **BC Income
  Tax Act s.4.52(2)** (indexed amount = immediately preceding year's amount plus
  that year's CPI adjustment) with **s.4.52(4.25)** (no adjustment 2027–2030),
  current text checked 2026-08-21. The paused-year count is derived from the
  pause range, not hard-coded to four.
- Ontario and Alberta are unaffected; control tests pin that.

**Unchanged.** The BC bracket table, BPA $13,216, pension amount $1,000 and the
12% eligible-dividend credit all match current BC sources.

**Tests added** (`src/lib/planning/taxYears.test.ts`, 9 tests): BC 2026 age
amount/threshold pinned; BC brackets, BPA, age amount, threshold and pension
amount asserted equal to 2026 values in each of 2027, 2028, 2029, 2030; 2031
asserted equal to the base compounded **one** year (and strictly below a
five-year catch-up), 2032 equal to two years;
controls asserting ON still indexes in 2027 and AB in 2028.

**Suite: 256 tests passing**, clean typecheck. Golden anchors are Ontario-based
and all three are **unmoved**: 201,470 / 411,408 / 1,762,590. Nothing deployed.
