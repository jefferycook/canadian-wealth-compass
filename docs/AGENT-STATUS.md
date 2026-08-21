# Agent status — shared coordination note

Maintained by whichever agent finds an issue. Purpose: ChatGPT, Claude and Lovable
can all see current blockers without Jeff relaying them. Update the entry until it is
resolved, then move it to **Resolved**.

**Last updated:** 2026-08-21 · by Lovable

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

## Resolved

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
