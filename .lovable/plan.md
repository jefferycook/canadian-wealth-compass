# R-1 / L-1 — age-basis correctness only

Surgical pass. Age bases and factual documentation, nothing else. Plan only, no code
changed in this step. CPP-1 `[C]` untouched, Phase 0 unapproved.

## 1. The two bases, both settled

**RRIF minimum — age at the beginning of the year.** ITR s.7308(3) and (4) (Justice Laws
consolidated text, read 2026-08-21): the prescribed factor corresponds to

> "the age in whole years ... **attained by the individual at the beginning of that
> year** or that would have been so attained ... if the individual had been alive at the
> beginning of that year."

The engine's `RRIF_MIN` values match subsection (4) exactly (71 = 0.0528, 94 = 0.1879,
95+ = 0.2000) and `100/(90 − age)` matches "Under 71 → 1/(90 − Y)". **The table is
correct; only the age fed into it is wrong.**

**Ontario LIF maximum — age attained during the fiscal year.** Reg. 909, Schedules 1 and
1.1, s.6 define F as the present value, at the beginning of the fiscal year, of an
annuity ending December 31 of the year the owner reaches 90. The valuation date is the
start of the year; the period count is driven by the year the owner turns 90, so an owner
**attaining 65 during the year** has 26 annual-in-advance periods at 6% — exactly
Appendix A's **7.25513%**. The unshifted Appendix A table shipped yesterday is correct as
a table and is not reopened; the lookup age is the age attained by December 31.

**The LIF minimum follows the RRIF basis.** Reg. 909 requires a LIF to pay at least the
RRIF-prescribed minimum, which is an ITR s.7308 quantity — so on one Ontario LIF the
**minimum** takes the beginning-of-year age while the **maximum** takes the
attained-during-year age. Today `projection.ts`:665-690 feeds one shared row age to both.
That shared variable is the defect.

## 2. DOB is collected; the projection ignores it

- `PersonInput.dob?: string` (`src/lib/planning/types.ts`:128-131), commented "Optional;
  `curAge` is what the engine uses."
- Collected: `PlanWizard.tsx`:215-218 binds a date field to `p.dob` and derives `curAge`
  via `ageFromDob` (`fields.tsx`:202-205).
- Persisted: `draft.ts` carries it both ways (`:40`, `:118`, `:196`); `defaults.ts`:61
  starts it `null`.
- Ignored by the engine: row age is `curAge + off` (`:264`, `:305`), calendar year is
  `startYear + off` with `startYear = new Date().getFullYear()` (`:203`, `:241`). That
  one age goes to both `rrifMinFactor` (`:669`) and `lifMaximumFor` (`:670`).

Both correct ages are therefore already derivable — a calendar year per row, a DOB per
person. No new input, no schema change.

## 3. Direction of the error

`curAge` is the age on the day the plan was filled in, not a January-1 age. Take two
people planning on 2026-08-21 with identical `curAge = 60`:

| | February birthday (already passed) | November birthday (upcoming) |
| --- | --- | --- |
| Born | Feb 1966 | Nov 1965 |
| Age at beginning of 2026 | **59** = `curAge − 1` | **60** = `curAge` |
| Age attained during 2026 | **60** = `curAge` | **61** = `curAge + 1` |
| RRIF factor vs. the other | one age step **lower** | one age step **higher** |
| ON LIF maximum vs. the other | lower | **higher** |
| Row age today (`curAge + off`) | RRIF **one step too high** | RRIF correct |
| | LIF max correct | LIF max **one step too low** |

So each defect hits about half of clients, in opposite halves, and which half a client
lands in depends on the arbitrary date the plan was created.

Magnitude: at beginning-of-year age **70** the ordinary factor is `1/(90 − 70) = 5.00%`;
at **71** it is **5.28%**. A February-birthday client wrongly aged to 71 on a $200k RRIF
is forced to draw **$10,560 instead of $10,000 — +$560 that year**, taxed and permanently
out of the shelter, widening with age. The 70→71 step also lands a year early.

## 4. Scope of this pass

**In:** R-1 (RRIF-factor minimum takes the beginning-of-year age, including the RRIF
floor on LIF/PRRIF) and L-1 (Ontario LIF Appendix A maximum takes the attained-during-year
age), plus the documentation corrections.

**Out, deliberately — each becomes its own OPEN `[C]` follow-up:**

- **R-2 — the minimum is computed on the grown balance.** ITA s.146.3(1) defines the
  minimum as `(A × B) + C` with **A = total fair market value of all properties held in
  connection with the fund at the beginning of the year**. The projection grows accounts
  at step 4 (`:482`) and computes minimums at step 6a (`:650`), so `A` is an end-of-year
  balance and every minimum is overstated by about one year of growth. Real and confirmed
  — but it is a base defect, not an age defect, and bundling it would make the golden
  movements from this pass untraceable.
- **R-3 — no establishment-year nil minimum.** ITA s.146.3(1): "for the year in which the
  fund was entered into, **a nil amount**". `isRRIFnow` (`:658-662`) charges a minimum in
  the very year an account crosses `convAgeOf(a)`. Held back because whether a LIF or
  PRRIF established mid-year inherits that exemption depends on each provincial vehicle's
  governing text, which is **not verified** — assuming it would be exactly the kind of
  silent substitution this project forbids.
- **Spouse-age election** under s.146.3(1)(b) remains unmodelled; recorded, not fixed.

**Independent of CPP-1?** Yes — different module, different statute, no shared code path
with `cppSurvivorBenefit`, no shared fixture. Safe to proceed while CPP-1 stays OPEN.

## 5. The change

1. **Two pure helpers**, signature by DOB and year, in a small `ages.ts`:
   - `ageAtBeginningOfYear(dob, year)` — whole-year age on January 1 of `year`.
   - `ageAttainedDuringYear(dob, year)` — whole-year age reached on or before December 31.

   Deterministic, no `Date.now()`, no plan state. They differ by exactly one except for a
   January-1 birthday, where they coincide. Each returns `null` for a missing or
   unparsable DOB.

2. **Wire each basis to its own instrument**, inside the step-6a block only:
   - `rrifMinFactor` ← `ageAtBeginningOfYear`, for RRIF, PRRIF **and LIF** (the LIF floor
     is the prescribed RRIF minimum).
   - `lifMaximumFor` ← `ageAttainedDuringYear` **for Ontario only**. Non-Ontario
     jurisdictions keep the current row age in this pass: their age bases are not verified
     jurisdiction by jurisdiction, and re-basing them on Ontario's authority would be a
     silent substitution. Recorded as a follow-up.
   - Every other use of the row age — retirement, conversion, benefits, death, the
     pension-credit 65 test, spending — is untouched.

3. **Legacy fallback.** When a helper returns `null`, the call site keeps today's
   `curAge + off` and emits a specific disclosure naming the person and the figure
   ("no date of birth on file, so the RRIF minimum for *account* uses a whole-year age
   and may be one age step out"). **No ±1 fallback, in either direction.**

4. **Saved-plan compatibility.** `dob` is already optional and already round-trips through
   `draft.ts`. No migration, no schema change, no new required field. Plans without a DOB
   reproduce today's numbers exactly, plus the disclosure.

5. **Documentation.** Strike the false LIF-1 sentence claiming "FSRA Appendix A (and the
   RRIF minimum table) are keyed by the age attained during the year" — Appendix A is,
   the RRIF table is not. Close LIF-2 citing **ITR s.7308(4)** for the RRIF basis and the
   Reg. 909 s.6 present-value derivation for Appendix A. Open R-2, R-3, the non-Ontario
   LIF age basis and the spouse-age election as separate items with their citations.
   Update spec §2.2 and §3.3 to state both bases side by side so they cannot be conflated
   again.

## 6. Tests

- **February vs. November, correct direction:** same `curAge`, same plan year — the
  February person's RRIF factor is one age step **lower** than the November person's, and
  the November person's Ontario LIF maximum is one step **higher**.
- **Born January 1:** both helpers agree; no movement versus today.
- **RRIF boundary:** 5.00% at beginning-of-year age 70, 5.28% at 71, landing in the
  correct calendar year for each birthday case.
- **One Ontario LIF, two bases in the same year:** the minimum comes from the
  beginning-of-year age and the maximum from the attained-during-year age, they differ,
  and `max ≥ min` still holds.
- **Appendix A values stay pinned** exactly as they are now — this pass changes the
  lookup age, never a table entry.
- **Legacy plan, no DOB:** bit-identical to today's output, and the disclosure is raised.
- **Helper unit tests:** leap-year births, December 31 and January 1 births, year before
  birth, unparsable string → `null`.

## 7. Expected goldens

| Anchor | Current | Expectation |
| --- | --- | --- |
| Single filer (indexed) | **201,184** | **unmoved** — `dob: "1966-01-01"` (`fixtures.ts`:40), the case where both helpers agree |
| Single filer, frozen brackets | **279,538** | unmoved, same reason |
| Couple | **411,408** | unmoved unless a fixture person carries a non-Jan-1 DOB |
| Accumulation | **1,762,590** | unmoved |
| Manitoba locked-in | unchanged | unmoved — R-3 is not in this pass |

Every fixture without a DOB must be bit-identical **by construction**. The Jan-1 fixture
must not move. Because R-2 and R-3 are excluded, this pass has no legitimate source of
golden movement other than a non-Jan-1 DOB in a fixture — so **any movement stops the
pass** and is reported with a row-level trace (account, calendar year, old and new age
and factor, dollar effect) rather than re-pinned.

CPP-1 `[C]` stays OPEN; Phase 0 is not approved, Phase 1 does not start, and nothing is
deployed or published.
