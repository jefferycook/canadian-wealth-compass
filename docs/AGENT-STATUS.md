# Agent status — shared coordination note

Maintained by whichever agent finds an issue. Purpose: ChatGPT, Claude and Lovable
can all see current blockers without Jeff relaying them. Update the entry until it is
resolved, then move it to **Resolved**.

**Last updated:** 2026-08-21 · by Claude (via Lovable MCP)

---


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

## Phase 0 — READINESS MUST BE RE-ASSESSED (NOT APPROVED)

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
