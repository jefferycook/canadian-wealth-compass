# LIF-2 / RRIF age basis — verification findings and scoped fix plan

Plan only. No code changed in this step. CPP-1 `[C]` untouched, Phase 0 unapproved.

## 1. What the law actually says (re-opened this turn)

**Income Tax Regulations s.7308(3) and (4)** (Justice Laws consolidated text, read
2026-08-21) — the prescribed factor is the one that corresponds to

> "the age in whole years ... **attained by the individual at the beginning of that
> year** or that would have been so attained by the individual if the individual had
> been alive at the beginning of that year."

Both the qualifying-fund table (3) and the ordinary table (4) use that wording. The
engine's `RRIF_MIN` values match subsection **(4)** (71 = 0.0528, 94 = 0.1879,
95+ = 0.2000) and `100/(90 - age)` below 71 matches "Under 71 → 1/(90 − Y)". The
**table itself is correct**; only the age fed into it is in question.

**ITA s.146.3(1), definition of "minimum amount"** (same source, read 2026-08-21):

> "for the year in which the fund was entered into, **a nil amount**, and, for any
> other year, ... (A × B) + C"

with **A = total fair market value of all properties held ... at the beginning of the
year**, and **B** the prescribed factor, subject to the paragraph (b) election to use
the **spouse's or common-law partner's** age.

So three separate statutory facts: beginning-of-year age; nil minimum in the
establishment year; beginning-of-year FMV as the base.

**The backlog sentence is wrong.** LIF-1 currently says "FSRA Appendix A (and the RRIF
minimum table) are keyed by the age attained during the year". For the RRIF table that
is flatly contradicted by s.7308. That wording must be corrected.

**Open verification item, and it is not cosmetic.** Ontario Reg 909 s.6 (the C/F
formula behind FSRA Appendix A) could not be retrieved this turn — e-laws did not
respond. If s.6 keys F to the owner's age **at the beginning of the fiscal year**, then
the LIF maximum takes the same basis as the RRIF minimum, and the shifted table this
project removed yesterday may have been an informal encoding of exactly that basis
applied to a "current age" input. The correction shipped yesterday is still right in
one respect — a shifted *table* is the wrong way to express an age *basis*, and it
silently overstated maximums for anyone whose birthday had not yet passed — but the
resolution of s.6 decides whether Ontario LIF and RRIF should share one
beginning-of-year age or genuinely differ. **Step 1 of implementation is to resolve
Reg 909 s.6 from primary text before any code is written.** Nothing else in this plan
proceeds until that is settled.

## 2. Is DOB collected? Yes — and the projection throws it away

Verified in the live code:

- `PersonInput.dob?: string` exists (`src/lib/planning/types.ts`:128-131), documented
  as "Optional; `curAge` is what the engine uses."
- The wizard **does collect it**: `src/components/plan/PlanWizard.tsx`:215-218 binds a
  date field to `p.dob` and derives `curAge` from it via
  `ageFromDob` (`src/components/plan/fields.tsx`:202-205).
- It **is persisted**: `src/lib/planning/draft.ts` carries `dob` in both directions
  (`:40`, `:118`, `:196`); `defaults.ts`:61 starts it `null`.
- The projection **never reads it**. `src/lib/planning/projection.ts` derives every row
  age as `p.curAge + off` (`:264`, `:305`) and the calendar year as
  `startYear + off` where `startYear = new Date().getFullYear()` (`:203`, `:241`).
  `rrifMinFactor(age)` (`:669`) and `lifMaximumFor(a.juris, age, …)` receive that same
  row age.

So the engine **does** have enough information to compute a deterministic
beginning-of-year age for any plan with a DOB: `startYear + off` gives the calendar
year, and the DOB gives the birthday. No new input, no schema change.

## 3. Which cases are actually wrong

`curAge` is not a January-1 age and never was — via the wizard it is the age **on the
day the plan was filled in**. Writing `bday` for whether the person's birthday falls on
or before the plan-start date:

```text
beginning-of-year age in year (startYear + off)
    = curAge + off - (1 if birthday already occurred in startYear else 0)
```

| Case | Engine row age vs. legal basis | Effect |
| --- | --- | --- |
| Birthday **not yet** occurred in the start year | correct | none |
| Birthday **already** occurred in the start year | **one year too high, in every projection year** | RRIF/LIF minimum overstated for life |
| Born Jan 1 | correct (attains age on Jan 1, so start-of-year age = current age) | none |
| Plan created in January vs. December | changes which side of the split the same client lands on | same client, different plan, different forced income |

Roughly half of all clients are affected, and which half depends on the arbitrary date
the plan was created. The forced taxable draw is overstated by one age step every year:
at 71 that is 5.28% instead of 5.15% (`1/(90−71)`) — about **+$260/yr on a $200k RRIF**
at that age, widening with age as the factor curve steepens, and it compounds because
the money is out of the shelter permanently. It also mis-times the 70→71 step change.

Two further defects observed in the same code path while confirming the above, both
**out of scope here** and to be recorded, not fixed:

- **Base is not beginning-of-year FMV.** Step 4 grows accounts (`:482`) *before* step 6a
  computes the minimum (`:650`), so `A` is an end-of-year balance. Overstates the
  minimum by roughly one year of growth.
- **No establishment-year exemption.** `isRRIFnow` (`:658-662`) applies a minimum in the
  very year a RRSP/LIRA/DCPP crosses `convAgeOf(a)`; s.146.3(1) says nil that year. This
  one is in scope (see below) because it is the same statutory sentence.

## 4. Classification

**LIF-2 → `[C]` (correctness, client-visible, systematic).** It is not latent: it
reaches every plan with a RRIF/LIF through the ordinary UI, silently overstates forced
taxable income for about half of clients, and is invisible to the user. It sits
upstream of tax, OAS clawback and the optimizer, so every downstream number inherits it.

**Independent of CPP-1?** Yes. Different module, different statute, no shared code path
with `cppSurvivorBenefit`, and no shared fixture — the survivor blocker neither gates
nor is gated by this. It is safe to fix while CPP-1 stays OPEN.

## 5. Scoped fix path

1. **Resolve Reg 909 s.6** from primary text. Record the finding either way. If it is
   beginning-of-year, Ontario LIF max shares the new age basis; if it genuinely is
   attained-during-year, the two bases differ and the code must say so explicitly at
   both call sites.
2. **Add one age-basis helper**, e.g. `startOfYearAge(person, calendarYear)` in
   `registered.ts` or a small `ages.ts`: with a parsable `dob`, return the whole-year
   age on January 1 of that calendar year, computed from the DOB and the year only —
   deterministic, no `Date.now()` inside the engine. Without a DOB, return the legacy
   `curAge + off` and raise a **disclosure** ("this plan has no date of birth, so the
   RRIF minimum is computed from a whole-year age and may be one age step high").
3. **Use it only where the law requires it**: `rrifMinFactor` at `:669`, and
   `lifMaximumFor` at `:670` *only if* step 1 confirms the same basis. Row `age`
   everywhere else (retirement, benefits, death, pension-credit age tests) is untouched
   — those have their own bases and are not part of this correction.
4. **First-year RRIF exemption**: no minimum in the year a fund is entered into. Applies
   to an account converting at `convAgeOf(a)` during the projection, and to an account
   the client tells us is newly established. It must **not** fire for an account that
   was already a RRIF/LIF/PRRIF before the plan started — that fund was entered into in
   an earlier year.
5. **Saved-plan compatibility**: `dob` is already an optional field that already
   round-trips through `draft.ts`. No migration, no schema change, no new required
   input. Legacy plans keep their current numbers plus a disclosure. No unconditional
   `-1` anywhere.
6. **Doc corrections** (as part of the fix, not now): strike the wrong sentence in
   backlog LIF-1; restate LIF-1 as "no DOB → conservative fallback" rather than "no DOB
   precision at all"; close LIF-2 with the s.7308 citation; add the two new
   out-of-scope findings (beginning-of-year FMV base; spouse-age election under
   s.146.3(1)(b) still unmodelled); update spec §3.3 and §2.2 with the correct bases.

## 6. Tests required

- Beginning-of-year age: birthday in **February** vs. **November**, same `curAge`, same
  plan year — the February person's factor is one age step lower than today's engine
  gives; the November person's is unchanged.
- Born **January 1** — start-of-year age equals current age; no off-by-one.
- **70 → 71 boundary**: the 5.28% row lands in the correct calendar year for each
  birthday case, and `1/(90−Y)` applies the year before.
- **Establishment-year exemption**: a RRSP converting at 71 takes **nil** that year and
  the normal minimum the next; an account already a RRIF at plan start takes its
  minimum in year 0.
- **Legacy plan, no DOB**: reproduces today's numbers exactly *and* raises the
  disclosure — this is the saved-plan compatibility pin.
- **Spouse-age election stays a documented gap**: an explicit test asserting the engine
  uses the annuitant's own age, so the gap cannot be mistaken for coverage.
- Ontario LIF: if step 1 says beginning-of-year, mirror the February/November pair
  through `lifMaximumFor`; the Appendix A **values** stay pinned as they are now.

## 7. Golden expectations and re-pin discipline

Every fixture carrying a DOB gets that DOB read for the first time, so anchors can move.
The single-filer fixture is `dob: "1966-01-01"` (`fixtures.ts`:40) — a January 1
birthday, the one case where beginning-of-year age equals current age — so **the
expectation is that it does not move**. Any movement there would mean the helper is
wrong, not that the law is: stop and report rather than re-pin. Fixtures without a DOB
must be **bit-identical** by construction. The establishment-year exemption can legally
move any fixture that converts an account mid-projection, and the Manitoba locked-in
golden is the likeliest to shift on that ground.

No anchor is re-pinned without a row-level trace naming the account, the calendar year,
the old and new factor, and the dollar effect, in the same form as the Ontario LIF pass.
If a movement is not fully attributable to one of the two changes, stop and report.

CPP-1 `[C]` stays OPEN throughout; Phase 0 is not approved, Phase 1 does not start, and
nothing is deployed or published.
