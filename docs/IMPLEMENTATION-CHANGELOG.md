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


## Batch 0D — Projection integrity — implemented 2026-08-21

Three sources of projection distortion removed, per the canonical
specification (v1.2 FINAL + Errata 1–5).

### 1. Indexation of statutory amounts (§12)

`taxYears.ts` gains `indexTaxYear()`, `indexationFactor()` and `LATEST_TAX_YEAR`.
`getTaxYear(year, rate)` now derives any year past the last published table by
indexing amounts — brackets, BPA (federal and provincial), age amount, pension
amount, OAS recovery threshold, TFSA/RRSP dollar limits — at a stated rate.
**Rates are never indexed; only amounts.** Derived tables carry `derivedFrom`
and are labelled APPROXIMATE at the point of use. Published years are returned
untouched. Backwards years never index. The rate is `PlanInputs.indexationRate`
when supplied, otherwise the plan's inflation assumption.

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
