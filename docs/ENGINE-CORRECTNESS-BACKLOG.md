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

## UX1 fixes — scenario-layer gating (2026-08-20)

These are scenario-boundary corrections, not engine methodology changes.

- **Return adjustment units.** The What If control is in percentage points;
  `ProjectionOverride.retDelta` is a decimal fraction. Conversion now happens
  once, in `returnAdjustmentFraction()` in `src/lib/planning/scenario.ts`.
- **Extra saving gated to non-registered.** TFSA and RRSP extra-saving
  scenarios are disabled until the contribution-room ledger lands. The scenario
  layer no longer manufactures accounts and never assigns a default pension
  jurisdiction. Extra saving is offered only where a real NONREG account exists,
  and its owner is taken from that account.
  **Unblocks when:** contribution-room enforcement ([C]/[L]) is implemented.
- **Per-person timing.** `ScenarioPatch` carries `cppAgeByPerson`,
  `oasAgeByPerson` and `retireAgeByPerson`. The old household-wide `cppAge` /
  `oasAge` fields are removed. This is plumbing only — not a CPP/OAS optimizer.
- **Unlocking is informational only.** The generic `unlockAll: 50` scenario is
  removed. VERIFIED status alone is not sufficient authority: Manitoba, Federal,
  Ontario and Quebec differ in destination vehicle, age conditions, percentage
  limits and reusability. Unlocking becomes actionable only per jurisdiction,
  once that jurisdiction's exact mechanism is encoded against the canonical
  specification and tested.

## Batch 0A follow-up — bridge affirmation is not yet user-facing

`BridgeInput.sourceClass` / `BridgeInput.eligibleAffirmed` exist in the data
model and drive pension-income eligibility, but the wizard does not collect
them. Every plan therefore defaults to `eligibleAffirmed = false` (temporary
bridging benefit, not pension-income-credit eligible), which is the conservative
CRA-consistent default. A future UX batch must add:

- a source-class question for any bridge-style benefit (RPP bridge, RPP lifetime,
  RCA, SERP, non-registered supplement, other);
- an explicit affirmation checkbox, enabled only for `RPP_LIFETIME`;
- disclosure text explaining that CRA treats bridging benefits as temporary
  benefits distinct from RPP lifetime retirement benefits, so affirming
  incorrectly overstates the pension income credit and splitting room.

## Later accumulation/intake enhancement — explicit pension-plan membership

**Not Batch 0C. Not scheduled. Do not implement with the 0C instruction.**

Pension-adjustment uncertainty is currently driven by `p.pen.amt > 0 || owns a
DCPP`. That test cannot distinguish a **currently accruing** DB plan member from
someone who merely holds a **deferred DB entitlement from a former employer**;
only the former generates a pension adjustment that consumes RRSP room.

*Required change (future):* add an explicit `currentPensionPlanMember` (or
equivalent) intake input, and drive PA uncertainty and the resulting
registered-recommendation withholding from current membership rather than from
pension entitlement alone.

## Opened by Batch 0D (not implemented)

- **Non-eligible (CCPC) dividends [G].** `nonreg.ts` deliberately refuses a
  non-eligible yield rather than taxing one at eligible-dividend rates. Needs
  per-province non-eligible gross-up and dividend tax credits in the verified
  rules layer before the yield vector accepts the component.
- **Intake for explicit yield vectors.** `AccountInput.yields` exists and is
  honoured by the engine, but nothing in the wizard collects it; every plan
  still resolves yields from the legacy `mix`.
- **Terminal-year return (§7.8).** Until the estate is modelled with a real
  final return, the automatic withdrawal-order tie-break stays APPROXIMATE.
- **Indexation rate as an intake assumption.** `PlanInputs.indexationRate`
  defaults to the plan's inflation assumption and has no UI control; CRA
  indexation and price inflation are not the same series.


## New Brunswick locked-in unlocking — UNSUPPORTED, to implement

FCNB gives the one-time partial unlock as the **lesser of three times the
annual amount or 25% of the LIF balance**, taken from a LIF, destination RRIF,
with no stated age condition
(https://fcnb.ca/en/personal-finances/pensions-and-retirement/pension-transfers-and-withdrawals,
verified 2026-08-21). The prior flat 25%-at-55-to-an-RRSP record overstated the
entitlement and was withdrawn (Batch 0C follow-up).

To implement, two things must be confirmed with FCNB:
1. the precise meaning of "the annual amount" (LIF maximum for the year, or the
   amount actually withdrawn), and
2. whether the lesser-of test is struck at the moment of application.

Until then all three NB components stay UNSUPPORTED and NB locked-in results are
withheld, never substituted from another jurisdiction.

---

## Batch 0D audit of `nonreg.ts` (2026-08-21) — two latent findings

Both are latent: `AccountInput.yields` is optional, no fixture sets it, and no
UI collects it, so neither is reachable today. Recorded only; **no code change,
no test change, no anchor movement** while 0D is held for review.

The rest of the module was audited and confirmed correct: distributions accrue
off the *expected* return while the balance moves by the *actual* (shocked)
return, so a bond fund still pays its coupon in a −20% year; a positive-return
legacy-`mix` year reproduces the pre-0D numbers exactly because
`interest + eligDiv` plus the `cg` share of the mix reconstitutes the total;
reinvested distributions raise ACB while a loss year lowers the balance, giving
a proper unrealized loss; `cgDist` is taxed at the 50% inclusion rate on the
same line as realized gains; and ROC driving ACB through zero realizes the
excess as a gain rather than leaving a negative ACB.

### D0D-1 [G] — an explicit "this account pays no distributions" is silently overruled

`resolveYields()` guards its explicit branch with
`if (v.interest || v.eligDiv || v.cgDist || v.roc) return v;`, and `nn()` maps
zero to zero. An account whose `yields` object is supplied but is **all four
zero** therefore falls through to legacy `mix` inference and is taxed on
distributions it was explicitly told it does not pay.

This is the class of error the project already ruled on in **Erratum 2**: a
client-asserted figure is a statement of fact and the engine must not overrule
it with an inference. Zero distributions is a real portfolio — an accumulating
ETF, a pure-growth holding — not an absent input.

*Required change:* branch on **presence of the `yields` object**, not on the
truthiness of its contents. Test: an all-zero explicit vector produces zero
taxable distributions in a positive-return year, while an absent vector still
falls back to `mix`.

**Must be fixed before any UI field for `yields` is exposed** — once an adviser
can type it, the failure is silent and taxes a client on income not received.

### D0D-2 [A] — inconsistent balance floor inside `decomposeReturn`

`growth` is computed from the raw `balance` while every yield is computed from
`bal = Math.max(0, balance)`. On a negative balance the two disagree and
`price` silently absorbs the difference. Balances should never go negative, so
this is cosmetic today. *Required change:* apply the floor once and use it
consistently, so a future caller cannot trip over it.

## Locked-in `oneTime` flag is carried but never enforced

`UnlockRule.oneTime` is present on every rule record and is read nowhere. It is
inert today because `maxUnlockPctAtAge` is constant with age for every one-time
jurisdiction, so no top-up can occur; the sequential-entitlement mechanism only
re-triggers for Manitoba, which is correctly `oneTime: false`.

*Required change when a second `fullUnlockAge`-style jurisdiction is added:*
enforce the flag as a guard. The federal record explicitly states that
unlocking less than 50% forfeits the remainder, so a partial exercise must not
leave a residual entitlement.

---

## Constants reconciliation follow-up (2026-08-21) — recorded from spec §13.3a

The §13.3 CONST-UNVERIFIED list was worked against CRA primary sources on
2026-08-21. Every reachable constant matched exactly; the federal brackets and
credits, the 2026 TFSA/RRSP limits, the full 25-entry RRIF minimum table, and
the ON/BC/AB brackets, BPAs, Ontario surtax and health premium are now VERIFIED
in the specification. What remains open is recorded here.

### CR-1 [G] — provincial low-income tax reductions are not modelled

CRA T4032-BC: British Columbia gives a tax reduction of up to **$575** for
income at or below **$25,570**, phasing out at **3.56%** of income above that
and reaching zero at **$41,722**. Ontario has an equivalent provision.

`ProvinceTax` has no field for it and `computeTax` does not apply it, so
provincial tax is **overstated** for any client in that band — up to $575 a year
for a modest-income BC retiree, every year of the projection. Conservative in
direction, hence [G] not [C].

*Required change:* add the low-income reduction (maximum amount, income
threshold, phase-out rate) to the tax-jurisdiction rules record and apply it in
`computeTax`. §14.3 now carries the row. **The field must exist before the
remaining ten jurisdictions are cut**, or all thirteen records will need
re-cutting — the same trap already flagged for non-eligible dividend credits.

### CR-2 — constants still CONST-UNVERIFIED (launch blocker, §11.4)

- **Provincial age amounts / age thresholds / pension income amounts** — ON
  ($6,342 / $47,210 / $1,796), BC ($5,691 / $42,580 / $1,000), AB ($6,055 /
  $45,210 / $1,685). Tier-1 source is TD1ON / TD1BC / TD1AB; the CRA PDF host
  blocked automated retrieval on 2026-08-21. Ontario's $1,796 has tier-3
  corroboration only (KPMG), which may not satisfy §13.1.
- **Provincial dividend tax credits** — ON 10%, BC 12%, AB 8.12% of the
  grossed-up eligible dividend. Ontario's 10% is tier-3 / open-data only.
- **`fedDivCredit` 0.150198 and `divGrossUp` 1.38** — CRA line 40425 publishes
  no rate; verify against **Federal Worksheet 5000-D1**.
- **FSRA Ontario LIF maximum table digits** (`ON_LIF_MAX`, ages 50–89) — the
  rule is VERIFIED but the fifty percentages have not been compared line by
  line the way the RRIF table now has been. FSRA's consumer table page 404s and
  the guidance page returns the surrounding text without the table
  (2026-08-21). Note: this table is **not** an annual refresh item — FSRA's
  guidance floors the reference rate at 6% and the table stands unless the
  November CANSIM V122487 rate exceeds it, so what it needs is a periodic
  check that the floor still binds (recorded in spec §13.3a).
- **`cppAvgNew65` 10,464** ($872/month) — the average new retirement pension at
  65. A statistic, not a maximum, so it is absent from the ESDC quarterly
  maximums page; CPP's "How much you could receive" page carries it. The single
  remaining CPP/OAS item.

**Struck 2026-08-21 — CPP/OAS maximums.** Every other CPP and OAS constant
(`cppMax65`, the four survivor/combined figures, `cppDeathBenefit`, `oasMax65`,
`oasMax75`, and `oasThreshold` a second time) was re-verified against the ESDC
July–September 2026 quarterly table, which is the current quarter, clearing the
§13.2 staleness concern. OAS amounts move quarterly, so this record needs
re-pulling on a three-month clock rather than annually.

**Confirmed, not a defect.** The two published OAS recovery upper bounds
($155,109 for 65–74, $161,088 for 75+) are reproduced by `computeTax` capping
the recovery at the OAS actually received; no fixed upper bound and no
age-specific constant exists in the code. Pinned by a derived test in
`engine.test.ts`.



## CPP-1 [C] — combined retirement + survivor CPP must be implemented from CPP s.58(2) (2026-08-21)

**Discovered:** overnight independent review of `benefits.ts` against primary law. **Not implemented in this pass — behaviour deliberately unchanged.** Full statement and citations: `docs/AGENT-STATUS.md`, OPEN [C] entry.

**Today:** `cppSurvivorBenefit` applies `b = min(b, max(0, cppCombinedMax × infFac − survOwnCpp))`, where `survOwnCpp` is the survivor's pension **as actually received** (post-`cppFactor`).

**Law:** **CPP, R.S.C. 1985, c. C-8, s. 58(2)**, read with s. 46 — <https://laws-lois.justice.gc.ca/eng/acts/C-8/section-58.html>.

- The survivor's own retirement pension enters under **s.46(1) disregarding s.46(3)–(6)** (early/late adjustment), adjusted only per **s.45(2)** — i.e. **unadjusted for claiming age**.
- **s.58(2)(c)** (65+, post-1997 retirement pension) reduces **component-by-component**: A−B, where **B = the lesser of 40% of the deceased-derived survivor component and 40% of the survivor's own corresponding unadjusted retirement-pension portion**. Parallel formulas cover the enhanced (post-2019) portions.

**Direction of error today:** understates for deferrers (can zero the benefit entirely — an outcome the tool's own deferral recommendations create); overstates for early starters.

**Explicitly rejected shortcuts:** swapping `survOwnCpp` for `base65`; multiplying `cppCombinedMax` by the survivor's `cppFactor`; using the retirement maximum instead of the combined maximum. The three candidate readings recorded on the original audit entry are **superseded** — the Act gives a component formula, not a scalar ceiling.

**Required work:** a dedicated pass splitting base and enhanced portions, implementing the A−B reduction, sourcing the survivor's unadjusted own pension, and building fixtures for deferrer / early-starter / 65-crossing cases. `cppCombinedMax` becomes a cross-check.

**Status vocabulary:** the `cppCombinedMax` **value** stays **VERIFIED**; the **application rule** is **APPROXIMATE (legacy conservative shortcut)** and must never be presented as exact client-facing.

**Gate:** Phase 0 approval and Phase 1 start are blocked until this is resolved.
