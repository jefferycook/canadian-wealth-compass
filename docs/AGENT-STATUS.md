# Agent status — shared coordination note

Maintained by whichever agent finds an issue. Purpose: ChatGPT, Claude and Lovable
can all see current blockers without Jeff relaying them. Update the entry until it is
resolved, then move it to **Resolved**.

**Last updated:** 2026-08-21 · by Lovable (Ontario LIF maximum table corrected — two anchors moved and traced)

**Current anchors: 201,184 / 411,408 / 1,762,590**, plus the frozen-bracket
single-filer variant at **279,538**. The two single-filer figures moved on
2026-08-21 for the reason recorded immediately below; the couple and
accumulation anchors are unmoved because neither fixture holds a LIF.

---

## Resolved — Ontario LIF maximum table was Appendix A shifted one age — FIXED 2026-08-21

FSRA guidance **PE0196INF (Active), Appendix A** is keyed by the **age attained
during the year**. `ON_LIF_MAX` held that table shifted down one age and rounded
to two decimals (`live[n] = FSRA[n+1]`; age 65 read 7.38% instead of 7.25513%),
so **every** Ontario LIF maximum was overstated. `lifMaxFactor` also returned
100% from age **89**, while Appendix A gives 89 = **51.45631%** and 100% only at
**90** — the engine emptied an Ontario LIF a year early.

The shift encoded an unstated "age at January 1" convention with no support in
the input contract (`PersonInput.curAge` is "current age in whole years"). It is
gone: the table is now read **unshifted, five decimals, ages 41–90**, keyed
directly by the projection row age. No `age + 1` was introduced. RRIF logic was
deliberately left untouched.

**Anchors moved, and the movement is fully traced** — not re-pinned blindly.
Single filer **201,470 → 201,184** (−286); frozen-bracket variant
**278,614 → 279,538** (+924); couple and accumulation unmoved; the Manitoba
locked-in golden unmoved. The fixture's LIF is cap-bound every year from 64 to
89: lower caps defer income and save ~$1,130 of tax to age 89, then the $11,046
the old age-89 100% row had already emptied is drawn at 90 and taxed at +$844
(+$2,141 with brackets frozen). Full row-level attribution is in the changelog.

Follow-ups recorded in the backlog, not fixed here: **LIF-1 [A]** (no DOB, so
the start-year age key can be one step conservative) and **LIF-2** (audit
whether the RRIF minimum table uses a different age basis than Appendix A).

272 tests pass, clean typecheck. CPP-1 `[C]` remains **OPEN**; Phase 0 not
approved, Phase 1 not started, nothing deployed.



## Resolved — BC-2: BC pension income amount was being indexed — FIXED 2026-08-21

BC Income Tax Act s.4.32 fixes the pension credit base at the **smaller of
$1,000 and eligible pension income** — a fixed statutory dollar amount, not an
indexed one. The engine indexed every provincial `penAmt`, so BC drifted above
$1,000 from 2031 (the 2027-2030 pause masked it until then), slightly
understating BC tax for pensioners.

**Fix:** optional `penAmtIndexed` field on `ProvinceTax` (defaults true);
BC sets it `false` and `indexProvince()` carries the amount through unchanged.
A general per-jurisdiction mechanism, not a BC special case. Tests now pin BC
at exactly $1,000 in 2026 / 2030 / 2031 / 2055, and a companion test confirms
ON and AB pension amounts still index normally. The old test that documented
the known-wrong drift was replaced.

268 tests pass, clean typecheck, anchors unmoved at **201,470 / 411,408 /
1,762,590**. CPP-1 `[C]` remains **OPEN**; Phase 0 not approved, Phase 1 not
started, nothing deployed.




## Resolved — BC tax correctness defect (stale age amount + indexation pause) — FIXED 2026-08-21

Raised by independent overnight verification against BC primary sources. Unrelated
to CPP-1 `[C]`, which remains **OPEN** and unchanged.

- BC 2026 **age amount** was `5,691` and **threshold** `42,580`; published values
  are **$5,927 / $44,119** (BC, *B.C. basic personal income tax credits*,
  2026-04-20). Corrected.
- BC indexation of brackets and non-refundable personal credits is **paused for
  2027–2030**, resuming 2031 (BC, *Personal income tax rates*, 2026-04-17 /
  Budget 2026). The engine indexed every province every derived year, so BC was
  wrongly inflated in those four years. Indexation is now jurisdiction-aware
  (`ProvinceTax.indexationPause` + `provincialIndexationFactor`), resuming
  **prospectively from the frozen 2030 amount** in 2031 with **no catch-up**
  (BC Income Tax Act **s.4.52(2)** with **s.4.52(4.25)**, current text checked
  2026-08-21): 2031 = base x (1+r), 2032 = base x (1+r)^2. ON/AB behaviour
  deliberately unchanged.
- BC brackets, BPA, pension amount and dividend credit re-confirmed correct.

Pinned by 10 new tests in `src/lib/planning/taxYears.test.ts`, including ON/AB
controls. **256 tests passing**, clean typecheck, anchors unmoved at
**201,470 / 411,408 / 1,762,590** (all Ontario-based, so an unmoved anchor here
is expected and is *not* evidence the BC path is exercised — the new tests are).

Lesson, consistent with the running theme: a constant can be wrong *and* the
rule applying it can be wrong at the same time, and neither shows up in an
anchor that never touches that jurisdiction.

---

## Resolved — Alberta tax data defect (stale age amount and threshold) — FIXED 2026-08-21

Independent verification pass scoped to Alberta, unrelated to CPP-1 [C], which is
untouched. All BC corrections including the no-catch-up 2031 rule are preserved.

- **Corrected.** `TAX_2026.provinces.AB.ageAmt` 6,055 -> **6,345**, `ageThresh`
  45,210 -> **47,234**. Source: CRA *TD1AB-WS Worksheet for the 2026 Alberta
  Personal Tax Credits Return*, checked 2026-08-21. Cross-checks against the 2025
  figures indexed at Alberta's published 2% (`6,221 x 1.02`, `46,308 x 1.02`).
- **Corrected (follow-up, same day) — `penAmt` 1,685 -> 1,753, and AB-1 is
  CLOSED.** The tier-1 source that was missing earlier in the day has been
  located: **CRA Form TD1AB, *2026 Alberta Personal Tax Credits Return*
  (`td1ab-26e.pdf`), line 3** states the Alberta pension income amount as the
  lesser of **$1,753** or estimated annual pension. Checked 2026-08-21. This is
  primary CRA evidence for the 2026 form year, not a derivation, so the value is
  **VERIFIED** and nothing about Alberta's pension income amount remains
  CONST-UNVERIFIED. $1,685 was the 2024 amount. The indexation *rule* was
  already verified and is unchanged (2024 $1,685 -> 2025 $1,719 -> 2026 $1,753):
  no Alberta carve-out, and derived years index from the corrected value.
- **Verification.** 261 tests passing, clean typecheck. Anchors unmoved:
  **201,470 / 411,408 / 1,762,590**. Nothing deployed; Phase 0 unapproved;
  Phase 1 not started.

## OPEN — Procedural conditions are recorded but never surfaced to the client

**Status:** Advisory-layer gap. Not a projection defect, not a blocker for the current batches. Should be scoped before any client-facing release.

Several **verified** locked-in rules carry conditions a real client must actually
satisfy in order to receive the money. All of them live in the rule record's
`notes` field, and none of them reaches the client:

- **Federal (PBSA)** — the funds must first move to an **RLIF**, the application
  must be made within **60 days**, and the entitlement is one-time with **no
  carry-forward**.
- **Ontario** — **Form 5.2**, within **60 days** of the transfer into the
  Schedule 1.1 LIF.
- **Nova Scotia** — the money must be in a **Schedule 4A LIF**, and the
  application is invalid after **60 days**, with no second chance.
- **Alberta** — the unlock must happen **as** the money moves into the
  LIF/LITB, not at some later point of the client's choosing.

The engine models the arithmetic correctly and says nothing about the
conditions. A plan can therefore display an unlock that the client would
**forfeit in practice** by missing a window or using the wrong vehicle — the
projection is right and the client still ends up with less money.

Per §0.8 this is advisory/disclosure-layer work rather than a change to the
projection. Suggested shape: surface the procedural conditions alongside the
unlock amount wherever it is shown, in the same way component status is
surfaced today.

---

## OPEN — Coordination: concurrent instruction of Lovable

**Status:** Advisory, no action blocked.

The working rule — **one agent instructs Lovable at a time; the others read,
audit, and record findings here** — held today. Three scoped instruction sets
(the Erratum 5 test-coverage task, the Batch 0D `fedPenAmt` defect, and the
Batch 0C jurisdiction follow-up) ran in sequence without collision or
conflicting writes.

**Amendment learned today:** a queued instruction waited **several minutes**
behind another agent's run before it began. Agents should expect **queueing**,
not immediate execution, and must **not** read a timeout or a slow response as
evidence that a message failed to land. Re-sending on that assumption is how two
concurrent writes to the same engine file happen. Check the repository state
before re-issuing anything.

---

## RESOLVED 2026-08-21 — Ontario credits and the three provincial dividend tax credits verified (no value changed)

Independent, non-dependent constants verification while CPP-1 [C] stays OPEN.
Sources re-opened directly: CRA Form **TD1ON 2026** (`td1on-26e.pdf`) — BPA
$12,989, age amount $6,342 phasing out from $47,210, pension income amount
$1,796; **Ontario.ca** *Ontario dividend tax credit* (updated 2026-04-27) —
10.0%; **Province of BC** *B.C. basic personal income tax credits* (2026
table) — pension amount $1,000 marked NOT indexed, eligible-dividend credit
12%; **Alberta PITA s.21** as amended by Bill 35 (assent 2020-12-09) — 8.12%
for 2021 and subsequent years. **Every live value matched; nothing changed.**
Pinned by new tests in `taxYears.test.ts`; source comments added; spec §13.3a,
backlog CR-2 and the changelog updated. 267 tests pass, clean typecheck,
anchors unmoved at 201,470 / 411,408 / 1,762,590.

**One new finding, backlog BC-2 [A]:** the engine indexes every provincial
`penAmt`, but BC publishes its $1,000 pension amount as non-indexed. The
2027-2030 pause masks it; drift begins in 2031 and understates BC tax.
Documented by a test, not fixed — ON and AB pension amounts do index, so this
needs a per-jurisdiction flag.

## OPEN [C] — the combined retirement + survivor CPP rule is an unsupported shortcut (superseded by primary law)

**Raised:** 2026-08-21, `benefits.ts` audit. **Escalated to [C] the same night** by independent overnight review against primary law. **Status:** behaviour deliberately UNCHANGED in this pass. Requires a dedicated implementation pass. **Phase 0 must not be approved and Phase 1 must not begin while this is open.**

### Primary authority

**Canada Pension Plan, R.S.C. 1985, c. C-8, s. 58(2)** (current Justice Laws text) —
<https://laws-lois.justice.gc.ca/eng/acts/C-8/section-58.html>, read with **s. 46**.

Two findings, both from the Act rather than the consumer pages:

**(1) The wrong own-pension figure is being used.** For a survivor who also receives a
retirement pension, the s.58(2) reduction formulas use the survivor's retirement pension
calculated under **s.46(1) without regard to s.46(3)–(6)** — the early/late retirement
adjustment provisions — adjusted only under **s.45(2)**. The current code passes
`survOwnCpp` **as actually received**, i.e. after `cppFactor`. The Act directly rejects
that. Error runs in **both directions**:

- **Deferrers are understated.** Maximum CPP deferred to 70 is $25,690/yr against a
  $18,378.72 ceiling → `Math.max(0, …)` → **survivor pension eliminated entirely**. The
  tool's own optimizer recommends deferral, so the engine can create this outcome itself.
- **Early starters are overstated.** Their actual reduced CPP leaves too much headroom
  under the shortcut ceiling, so the survivor component comes out too large.

**(2) s.58(2) is not a `combinedMax − ownCpp` ceiling at all.** For 65+ post-1997
retirement-pension cases, **s.58(2)(c)** computes the survivor's pension
**component-by-component** using A−B reductions, where **B is the lesser of 40% of the
deceased-derived survivor component and 40% of the survivor's own corresponding
*unadjusted* retirement-pension portion**. Parallel formulas apply to the enhanced
(post-2019) portions.

### The three candidate readings recorded earlier are SUPERSEDED

The earlier entry offered (a) fixed age-65 ceiling as coded, (b) ceiling scaled by the
survivor's own `cppFactor`, (c) ceiling based on the retirement rather than the combined
maximum. **None of them is the law.** The Act provides a component formula, not a single
scalar ceiling. In particular:

> **Do NOT "fix" this by swapping `survOwnCpp` for `base65`, nor by multiplying
> `cppCombinedMax` by an age factor.** Either would still be an unsupported shortcut,
> and would replace a known-conservative approximation with an unknown one.

### Component status (§13.2a) — verified number inside an unsupported rule

- **`cppCombinedMax` = $1,531.56/mo ($18,378.72/yr)** — the published ESDC value remains
  **VERIFIED**, `verifiedDate: 2026-08-21`.
- **The application rule for combined retirement + survivor CPP** —
  **APPROXIMATE (legacy shortcut, retained only as a conservative placeholder pending a
  dedicated s.58(2) implementation pass).** It is not a candidate for VERIFIED and must
  not be presented as exact anywhere client-facing.

The shortcut is retained for now because for the deferral case — the case the optimizer
actually creates — it errs **low**, which is the safe direction for a client. It is not
safe for early starters, and that is part of why this is [C] rather than [G].

### Resolution path

Implement s.58(2) component-wise: base and enhanced portions separately, the A−B
reduction with B as the lesser of the two 40% quantities, and the survivor's own
retirement pension taken **unadjusted for claiming age** (s.46(1), disregarding
s.46(3)–(6), adjusted only per s.45(2)). Requires a dedicated pass with its own fixtures;
`cppCombinedMax` then becomes a cross-check rather than the mechanism.

**Pinned by test:** `benefits.test.ts` → *"combined-benefit ceiling (OPEN question)"*
documents today's shortcut behaviour **without asserting it is correct**. When s.58(2) is
implemented, that test is the thing that fails and points here.

**Confirmed correct in the same audit** (now pinned by `benefits.test.ts`, 15 tests):
`cppFactor` (0.64 at 60, 1.42 at 70, the 0.6%/0.7% branch, clamping), `oasFactor` (1.36 at
70, floored at 65, never reduces), the survivor benefit computed on the deceased's
**calculated** age-65 pension rather than what they received, the 60% / flat+37.5% splits,
the 1/120 reduction for ages 35–44 (90% at 44, 50% at 40, 0% at 35), and both survivor
maximums.

---

## Phase 0 — READINESS MUST BE RE-ASSESSED (NOT APPROVED)

**Blocked additionally by the OPEN [C] above** (combined retirement + survivor CPP, s.58(2)). Phase 0 cannot be approved and Phase 1 cannot begin while that entry is open; only independent documentation/verification work that does not depend on survivor-benefit correctness should continue.

Batches 0A–0D are implemented and green. The four verification gaps raised by
independent review on 2026-08-21 were closed (see the Phase 0 review patch in
`IMPLEMENTATION-CHANGELOG.md`):

1. the required flat-real 30-year indexation invariant is now tested directly,
   and demonstrably fails against frozen tables (+32% real drift);
2. the down-year test is a real projection-level loss year that asserts
   `distributionsTaxable` survives a −20% return in the same row the balance
   falls;
3. the fourth Phase-0-exit golden exists — a Manitoba locked-in fixture pinned
   at **111,905** lifetime tax / **144,512** terminal portfolio;
4. the 0D changelog no longer misdescribes what tax-year indexation covers, and
   the §6.2 non-eligible-dividend deferral is recorded explicitly.

**Suite: 227 tests passing**, clean typecheck. Current anchors:
**201,470 / 411,408 / 1,762,590**. The accumulation figure changed *after* the
readiness claim was written, because of the Batch 0D surplus-sweep defect
recorded in Resolved below.

**The readiness assessment was issued before that defect was found.** A `[C]`
defect surfacing after a batch had been called complete is a signal about the
review, not only about the code — the four gaps closed earlier were real, and
this one was still sitting underneath them. Phase 0 readiness should therefore
be re-assessed against the current state rather than carried forward from the
earlier claim.

**Status: awaiting independent Phase 0 approval. It is NOT approved and Phase 1
has NOT started.** Nothing has been deployed or published.

Known items deliberately left open at the Phase 0 boundary: non-eligible
dividends (§6.2 [G]), New Brunswick locked-in unlocking (UNSUPPORTED), the
procedural-conditions disclosure gap recorded above, and the surplus-sweep
design choice (`spendTarget` vs `afterTax`, described in Resolved below) which
Jeff may want to weigh in on. None is a Phase 0 exit criterion.

---

## Resolved

### Batch 0D defect — the surplus sweep created money (contributions were not a use of cash) — FIXED 2026-08-21

**Raised by Claude during the Batch 0D audit, 2026-08-21** (Jeff was offline
throughout and has not yet seen it). Recorded before the fix so the other agents
saw it immediately. Severity [C] — it overstated client wealth.

`applyContribution` adds `a.contrib * infFac` to the account balance and to
`contribTotal`, but nothing was ever subtracted from `fixedCash` and nothing
added to `spendTarget`. `fixedCash` already contains the full `employInc` that
funds the contribution, so the same dollars were counted twice: once as cash
available to the household, and again as portfolio growth.

Before Batch 0D the error was self-cancelling and therefore invisible — the
surplus simply vanished at year end, and the vanished surplus was implicitly
what paid for the contributions. **0D's sweep removed the vanishing without
adding the outflow, so both halves counted.**

On `accumulationGoldenFixturePlan`, year one: `fixedCash` 190,000 of employment
income, contributions 29,000, `spendTarget` 84,000, solver returns `G = 0`, and
the entire `afterTax − 84,000` surplus is swept. The household deposited
`29,000 + surplus` in a year in which it had only `surplus` to spare. **29,000
invented every year** across a ~20-year contribution window, then compounding at
the equity return. Not fixture-specific: it affected every accumulation-phase
client.

**Fix applied:** add `contribTotal` to `spendTarget`. It is fully accumulated by
that point (asserted account contributions and `goalSaves` both pass
`countAsContribution: true`, and both are genuine uses of household cash).
Registered-destination lump sums pass `false` and stay excluded — a lump sum is
an inflow being allocated, not cash the household must find. The sweep also
passes `false`, so swept money never re-enters `contribTotal`: no circularity.
Secondary benefit: the draw solver was blind to contributions, so a retiree
still contributing will now either draw to fund it or show a real shortfall.

**Design choice left open, and open to being overruled by Jeff or ChatGPT.** The
narrower fix is to subtract `contribTotal` from `afterTax` when computing the
surplus only, leaving `spendTarget` untouched. That is identical whenever there
is a surplus (the common case) and differs only where the household must draw to
fund a contribution. The `spendTarget` route was chosen so the solver, the
shortfall flag and the sweep stay consistent with one another rather than
patching the sweep alone.

**Result: 227 tests passing**, clean typecheck.

| Golden anchor | Before | After |
|---|---|---|
| Accumulation | 2,176,860 | **1,762,590** (−19.0%) |
| Single filer | 201,470 | **201,470** — unmoved |
| Couple | 411,408 | **411,408** — unmoved |

The two zero-contribution fixtures are confirmed untouched, which is the
asymmetry check: this defect can only reach a plan that contributes. The
movement matched the prediction made before the change (materially downward,
well over the 3% gate).

One existing test had to be rewritten rather than kept: `engine.test.ts`'s
"stretches the money further when the client saves more before retirement"
asserted that a goal save REDUCED shortfall years on a fixture that is already
short — true only because the saving was free money. Asserting it would
re-enshrine the defect. It is now two tests: saving into an already-short plan
cannot buy extra years, and on an affordable variant a TFSA goal save helps only
through its tax treatment (terminal portfolio up, but under 5%, not the whole
contribution compounded).

**Lesson — a passing test is not evidence of correctness either.** That test was
green *because* of the defect; it is the second time in this project a green
test has certified a bug. Paired with the Erratum 5 lesson below (an unmoved
anchor is not evidence of correctness), these are the same lesson from two
directions: a signal only counts if the fixture actually exercises the behaviour
in question.



### Erratum 5 — transferee's pension credit (Batch 0A) — IMPLEMENTED AND VERIFIED 2026-08-21

Superseding the earlier open entry, whose prediction was wrong.

**Implemented.** `pensionEligible` is split into `pensionEligibleAnyAge` and
`pensionEligible65Plus` in `types.ts` and `projection.ts`; `tax.ts` applies the
claimant's **own** age test to decide which streams count toward their credit,
and `householdTax()` draws a transfer **proportionally** from the transferor's
two streams. Spec §1.5 Erratum 5 now records this.

**The predicted anchor movement did not occur.** The earlier note stated the
couple golden `554616` *"WILL move upward"*. It did not — the couple anchor was
unchanged by Erratum 5. **Reason:** in `coupleGoldenFixturePlan` the transferor
holds a **$24,000 RPP lifetime pension**, which is any-age income. The
proportional draw therefore sends the transferee more any-age income than the
**$2,000 federal / $1,796 Ontario** pension amount can absorb. The credit is
capped by the pension amount, not by the stream, so tightening the stream test
changed nothing in that particular fixture.

**Lesson — an unmoved anchor is not evidence of correctness.** The fixture was
silent on the very behaviour the correction targets. Every Erratum 5 test at the
time called `householdTax()` **directly**, so all of them would still have
passed if `projection.ts` had misclassified RRIF cash into the wrong stream.
Erratum 5 was only shown to be **live on the projection path at all** after
projection-level tests were added ("Erratum 5 end-to-end — the projection feeds
two typed streams", in `pension-eligibility.test.ts`). Prove a correction at the
layer where the data is produced, not only at the layer that consumes it.

### Batch 0D defect — the federal pension income amount was being indexed — FIXED 2026-08-21

`indexTaxYear()` applied the indexation factor to `fedPenAmt`. The federal
pension income amount is **fixed at $2,000** under ITA s.118(3) and does not
appear among the CRA's annually indexed amounts. Found during the 0D audit and
fixed the same day: `fedPenAmt` is now carried through derived years unindexed,
while provincial pension amounts continue to index.

Anchors re-pinned, and **this one moved in the predicted direction and
magnitude** — unlike the Erratum 5 prediction above:

| Anchor | Before | After | Move |
|---|---|---|---|
| Single filer | 198,394 | **201,470** | +1.55% |
| Couple | 407,458 | **411,408** | +0.97% |
| Accumulation | 2,164,651 | **2,176,860** | +0.56% |

With `indexationRate: 0` the single-filer fixture still reproduces **278,614**
exactly, confirming the movement is attributable to indexation alone.

### Locked-in jurisdiction verification pass (Batch 0C follow-up) — 2026-08-21

Four records reconciled against tier-1 regulators. **No anchor moved.**

- **Alberta — promoted to VERIFIED** (Superintendent of Pensions, Interpretive
  Guideline #04): 50% from age 50, one-time, to cash/RRSP/RRIF. Coded values
  were already correct.
- **Nova Scotia — promoted to VERIFIED** (Department of Finance, Form 20): 50%
  at 55 from a Schedule 4A LIF, 60-day window, one-time.
- **British Columbia — promoted to VERIFIED as a confirmed absence** (BCFSA): BC
  legislation does not allow the 50% one-time unlocking provision, so
  `partialPct: 0` is now positively verified rather than merely unchecked.
- **New Brunswick — WITHDRAWN to UNSUPPORTED** (FCNB): the entitlement is the
  **lesser of** three times the annual amount or 25% of the LIF balance, from a
  LIF to a RRIF. Our flat 25%-at-55-to-an-RRSP record **overstated** the
  entitlement — an error in the client's favour. Nothing is substituted;
  queued on the backlog.

Two gating defects were fixed in the same pass: an APPROXIMATE
`unlockEntitlement` now raises a client-facing disclosure, and `lifMaximumFor`
reads the component's status instead of hard-coding it from the jurisdiction.
`lifMaximum` remains APPROXIMATE everywhere except Ontario.
