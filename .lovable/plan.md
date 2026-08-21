# RRIF / Ontario LIF age basis — revised scoped plan

Plan only. No code changed in this step. CPP-1 `[C]` untouched, Phase 0 unapproved.

## 1. The two bases are genuinely different, and both are now settled

**RRIF minimum — beginning of the year.** ITR s.7308(3) and (4) (Justice Laws
consolidated text, read 2026-08-21): the prescribed factor is the one corresponding to

> "the age in whole years ... **attained by the individual at the beginning of that
> year** or that would have been so attained ... if the individual had been alive at the
> beginning of that year."

The engine's `RRIF_MIN` values match subsection (4) exactly (71 = 0.0528, 94 = 0.1879,
95+ = 0.2000) and `100/(90 − age)` matches "Under 71 → 1/(90 − Y)". The **table is
correct**; only the age fed into it is wrong.

**Ontario LIF maximum — age attained during the fiscal year.** Reg. 909, Schedules 1
and 1.1, s.6 define F as the present value, **at the beginning of the fiscal year**, of
an annuity ending December 31 of the year the owner reaches 90. That is a statement
about the valuation date, not the lookup age: the number of annual-in-advance periods is
driven by the year the owner turns 90, so an owner **attaining 65 during the year** has
26 periods at 6%, which is exactly Appendix A's **7.25513%**. The direct, unshifted
Appendix A table shipped yesterday is therefore correct **as a table**, and the correct
lookup age is the age the owner will have **attained by December 31** of the projection
year. That correction stands and is not reopened.

**Ontario LIF minimum — the RRIF basis, not the LIF basis.** Reg. 909 requires a LIF to
pay out at least the minimum amount prescribed for a RRIF. That minimum is an ITR
s.7308 quantity, so it takes the **beginning-of-year age** and the **beginning-of-year
FMV**, even though the maximum on the very same account takes the attained-during-year
age. Recommendation: model it exactly that way and do not conflate them. The engine
already computes minimum and maximum in the same block (`projection.ts`:665-690) from
one shared `age` variable; that shared variable is the defect. In a year where the two
bases disagree by one step, the minimum comes from the lower age and the maximum from
the higher — which is what the two instruments actually say, and it widens rather than
inverts the permitted band, so no new "min > max" hazard is introduced. A test will pin
that ordering anyway.

**The backlog sentence is wrong and must be struck.** LIF-1 currently says "FSRA
Appendix A (and the RRIF minimum table) are keyed by the age attained during the year."
Appendix A is; the RRIF table is not. Correcting that sentence is part of the eventual
fix.

## 2. DOB is collected, and the projection throws it away

Verified in the live code:

- `PersonInput.dob?: string` exists (`src/lib/planning/types.ts`:128-131), commented
  "Optional; `curAge` is what the engine uses."
- The wizard **collects** it: `src/components/plan/PlanWizard.tsx`:215-218 binds a date
  field to `p.dob` and derives `curAge` from it via `ageFromDob`
  (`src/components/plan/fields.tsx`:202-205).
- It **persists**: `src/lib/planning/draft.ts` carries `dob` both ways (`:40`, `:118`,
  `:196`); `defaults.ts`:61 starts it `null`.
- The projection **never reads it**. Every row age is `p.curAge + off` (`:264`, `:305`)
  and the calendar year is `startYear + off`, `startYear = new Date().getFullYear()`
  (`:203`, `:241`). That one row age is handed to both `rrifMinFactor` (`:669`) and
  `lifMaximumFor` (`:670`).

So the engine already has everything it needs — a calendar year per row and a DOB per
person — to compute **both** ages deterministically. No new input, no schema change.

## 3. Which cases are wrong, and by how much

`curAge` is not a January-1 age: through the wizard it is the age on the day the plan
was filled in. Writing `bdayPassed` for "birthday already occurred in the plan start
year":

```text
ageAtBeginningOfYear(startYear + off) = curAge + off - (bdayPassed ? 1 : 0)
ageAttainedDuringYear(startYear + off) = curAge + off + (bdayPassed ? 0 : 0)
                                       = curAge + off   when bdayPassed
                                       = curAge + off   when not yet   <- see note
```

Note: the current row age happens to equal the **attained-during-year** age in both
cases only because `curAge` is measured mid-year — a person whose birthday has not yet
passed will still attain `curAge + 1 + off`... which the row age does **not** give. Both
helpers must therefore be computed from the DOB, not patched off the row age.

| Case | RRIF minimum today | Ontario LIF maximum today |
| --- | --- | --- |
| Birthday **already passed** in start year | age **one step too high** every year | correct |
| Birthday **not yet** passed in start year | correct | age **one step too low** every year |
| Born January 1 | correct | correct |

So each defect hits roughly half of clients, and the two halves are opposite. Which half
a given client lands in depends on the arbitrary date their plan was created — the same
person, same facts, planned in March versus October, gets different forced income.

Magnitude, corrected: at a beginning-of-year age of **70** the ordinary factor is
`1/(90 − 70) = 5.00%`; at **71** it is **5.28%**. A client wrongly aged to 71 on a $200k
RRIF is forced to draw **$10,560 instead of $10,000 — +$560 in that year**, taxed, out
of the shelter permanently, and the gap widens with age as the factor curve steepens.
The 70→71 step also lands a year early.

## 4. Three separate defects, classified separately

| # | Defect | Severity | In scope |
| --- | --- | --- | --- |
| **R-1** | RRIF/LIF minimum uses the row age instead of the beginning-of-year age | `[C]` | yes |
| **R-2** | Minimum is computed on the **grown** balance, not the beginning-of-year FMV | `[C]` | yes, conditionally — see below |
| **R-3** | No establishment-year nil minimum | `[C]` | yes, narrowly |
| **L-1** | Ontario LIF maximum uses the row age instead of the attained-during-year age | `[A]` → `[C]` for LIF-bound plans | yes |

**R-2 detail.** ITA s.146.3(1) defines the minimum as `(A × B) + C` with **A = total
fair market value of all properties held in connection with the fund at the beginning of
the year**. The projection grows accounts at step 4 (`:482`) and computes minimums at
step 6a (`:650`), so `A` is an end-of-year balance and every minimum is overstated by
roughly one year of growth — about **+$1,400/yr on a $200k RRIF at 7%**, on top of R-1.
This is a base defect, not an age defect, and it is planned and tested separately.
It is included **only if** opening balances can be snapshotted immediately before step 4
into a per-account map that step 6a reads, without touching the ordering of unlocks,
contributions, scheduled withdrawals, the discretionary solve or the surplus sweep. If
the snapshot cannot be introduced that cleanly, R-2 is split out into its own pass
rather than forced in alongside the age work.

**Independent of CPP-1?** Yes — different module, different statute, no shared code path
with `cppSurvivorBenefit`, no shared fixture. Safe to fix while CPP-1 stays OPEN.

## 5. Scoped fix

1. **Two explicit helpers, no ambiguous single one.** In a small `ages.ts` (or
   `registered.ts`):
   - `ageAtBeginningOfYear(person, calendarYear)` — whole-year age on January 1 of that
     year, from DOB and year only.
   - `ageAttainedDuringYear(person, calendarYear)` — whole-year age the person reaches on
     or before December 31 of that year.

   Both are pure and deterministic; neither reads `Date.now()`. With a valid DOB they
   normally differ by exactly one and coincide only for a January-1 birthday. Each
   returns `null` for a missing or unparsable DOB.

2. **Legacy fallback, explicit.** When either helper returns `null`, the call site keeps
   today's `curAge + off` and raises a disclosure naming the person and the affected
   figure ("no date of birth on file, so the RRIF minimum uses a whole-year age and may
   be one age step out"). **No unconditional ±1 anywhere**, in either direction.

3. **Wire each basis to its own instrument**, all inside the step-6a block:
   - `rrifMinFactor` ← `ageAtBeginningOfYear` — for RRIFs, PRRIFs **and LIFs**, since the
     LIF floor is the prescribed RRIF minimum.
   - `lifMaximumFor` ← `ageAttainedDuringYear` — Ontario reads Appendix A at that age.
     Non-Ontario annuity-formula jurisdictions keep whatever basis their own rule
     records specify; this pass does not silently re-base them.
   - Every other use of the row age — retirement, conversion, benefits, death, the
     pension-credit 65 test, spending — is untouched.

4. **R-2, if included:** snapshot each account's balance into `openingBal[a.id]` just
   before step 4 grows it, and compute `minW` from the snapshot. Growth continues to
   apply to the account; only the minimum's base changes.

5. **R-3, narrowly.** Nil minimum **only** where a RRIF is actually established during
   that projection year — in practice an RRSP → RRIF conversion at `convAgeOf(a)`. It is
   **not** applied to a LIF or PRRIF merely because those use RRIF factors: the
   establishment-year exemption is an ITA s.146.3(1) rule about a retirement income
   fund, and whether a LIF/PRRIF established mid-year inherits it depends on the
   provincial vehicle's own governing text, which is **not verified** — that question
   goes to the backlog and the exemption is withheld for those vehicles until it is
   answered. An account that is already a RRIF at plan start keeps its minimum in year 0:
   there is no establishment-year input in the model today, and inventing one is out of
   scope.

6. **Saved-plan compatibility.** `dob` is already optional and already round-trips
   through `draft.ts`. No migration, no schema change, no new required field. Plans
   without a DOB reproduce their current numbers exactly, plus a disclosure.

7. **Doc corrections** (part of the fix, not now): strike the wrong LIF-1 sentence;
   restate LIF-1 as the no-DOB fallback; close LIF-2 with the s.7308 citation and the
   Reg. 909 s.6 present-value derivation showing why Appendix A is attained-during-year;
   record the LIF/PRRIF establishment-year question and the s.146.3(1)(b) spouse-age
   election as open gaps; update spec §2.2 and §3.3 so both bases are stated side by
   side and never conflated again.

## 6. Tests required

- **Beginning-of-year age (RRIF):** February vs. November birthday, identical `curAge`
  and plan year — the February person's factor is one step higher than the November
  person's, and one of the two differs from today's output.
- **Attained-during-year age (ON LIF max):** the same pair through `lifMaximumFor`, with
  Appendix A **values** still pinned as they are now.
- **The two bases coexist on one LIF:** in a year where they differ, the minimum comes
  from the lower age and the maximum from the higher, and `max ≥ min` still holds.
- **Born January 1:** both helpers agree; no movement versus today.
- **70 → 71 boundary:** 5.00% at beginning-of-year age 70, 5.28% at 71, landing in the
  correct calendar year for each birthday case.
- **R-2 base:** doubling the account's growth rate leaves **this** year's RRIF minimum
  unchanged, and raises **next** year's opening balance and minimum. This is the test
  that proves the base is start-of-year.
- **R-3:** an RRSP converting at 71 takes **nil** that year and a normal minimum the
  next; an account already a RRIF at plan start takes its minimum in year 0; a LIF or
  PRRIF is **not** given the exemption.
- **Spouse-age election stays a documented gap:** an explicit test that the engine uses
  the annuitant's own age, so the gap cannot be mistaken for coverage.
- **Legacy plan, no DOB:** reproduces today's numbers bit-for-bit and raises the
  disclosure — the saved-plan compatibility pin.

## 7. Expected anchors

| Anchor | Current | Expectation |
| --- | --- | --- |
| Single filer (indexed) | 201,184 | R-1/L-1: **unmoved** — `dob: "1966-01-01"` (`fixtures.ts`:40), the one case where both helpers agree. R-2/R-3: **downward move expected** |
| Single filer, frozen brackets | 279,538 | same reasoning |
| Couple | 411,408 | R-1/L-1 unmoved unless a DOB is present; R-2 moves if the fixture holds a RRIF |
| Accumulation | 1,762,590 | unmoved by R-1/L-1; R-2/R-3 only if it converts a registered account |
| Manitoba locked-in | unchanged | most exposed to R-3's LIF/PRRIF carve-out — expected **unmoved**, since the exemption is withheld for those vehicles |

R-1 and L-1 should not move a January-1 fixture at all; if either does, the helper is
wrong and the run stops rather than re-pinning. R-2 legitimately lowers every minimum by
about one year of growth and R-3 removes one year of forced income entirely, so those
two may move anchors downward — each movement traced row by row (account, calendar year,
old and new factor or base, dollar effect) in the same form as the Ontario LIF pass
before any re-pin. Fixtures without a DOB must be bit-identical by construction.
Anything not fully attributable to one named defect stops the pass.

CPP-1 `[C]` stays OPEN throughout; Phase 0 is not approved, Phase 1 does not start, and
nothing is deployed or published.
