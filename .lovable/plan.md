# Ontario LIF maximum table — verification result and scoped correction

## What I checked, independently

FSRA guidance **PE0196INF (Active)**, *Life Income Fund (LIF) and Locked-In Retirement Income Fund (LRIF) Maximum Annual Income Payment Amount Table*, **Appendix A**, retrieved 2026-08-21. Appendix A is published as three columns: **"Age attained during year"**, "Number of years to the end of the year in which age 90 is attained", and the maximum percentage to **five decimals**, effective 2021-01-01 (the CANSIM reference rate is floored at 6%, so the table has not moved).

Cross-checked against a current industry 2026 table (Empire Life, Jan 2026) that publishes the same Ontario column keyed to **"Age as at Jan 1, 2026"**.

## Finding: this is an age-keying and precision defect, not stale values

The live `ON_LIF_MAX` in `src/lib/planning/registered.ts` is **exactly FSRA's Appendix A shifted down one age and rounded to two decimals**:

```text
live 50 = 6.27   = FSRA age 51 (6.26996)
live 55 = 6.51   = FSRA age 56 (6.50697)
live 65 = 7.38   = FSRA age 66 (7.37988)
live 75 = 9.71   = FSRA age 76 (9.71347)
live 85 = 22.40  = FSRA age 86 (22.39589)
live 88 = 51.46  = FSRA age 89 (51.45631)
live 89 = 100    = FSRA age 90 (100.00000)
```

It matches the industry "age as at Jan 1" column to the cent at every age. So the values are not wrong numbers pulled from an old table: they are the correct FSRA numbers re-keyed to **age at the start of the fiscal year** rather than **age attained during the year**, with no comment saying so, and rounded.

That makes the table correct only if the engine's `age` argument really means start-of-year age. Today that is an unstated assumption, and it is the actual risk:

- `rrifMinFactor()` in the same file is keyed to start-of-year age (statutory `1/(90-age)` and the age-71 table), and `projection.ts` passes the same `age = curAge + off` to both. So the two are at least consistent with each other.
- Nothing in code, tests, or the spec records the convention, so a future edit that "fixes" one table against a published source breaks the other silently.
- The `age >= 89 -> 100` cutoff is right under start-of-year keying and wrong under FSRA keying — exactly the boundary flagged in the request.
- Ages below 50 collapse to the age-50 factor, although FSRA publishes ages 41-49.

## Correction plan (no methodology change, no CPP work)

1. **Replace the constant with FSRA Appendix A verbatim.** Rename to `ON_LIF_MAX_BY_AGE_ATTAINED`, ages **41 through 90**, five decimals as published (50 = 6.23197 ... 89 = 51.45631, 90 = 100.00000). Keep an `ON_LIF_MAX` export only if tests/UI reference it; if kept, it is derived, not hand-maintained.
2. **Make the age convention explicit at the boundary.** `lifMaxFactor(age, ...)` continues to receive the projection's start-of-year age and looks up `age + 1` ("the age the holder attains during the fiscal year"), documented in a comment citing s.6 of Schedules 1, 1.1 and 2 to R.R.O. 909. Net effect on Ontario percentages: unchanged apart from restored precision.
3. **Boundary.** 100% applies when the age attained during the year is 90, i.e. start-of-year age 89 — the current cutoff, now derived from the table rather than hard-coded, with the age-89-attained value 51.45631% present in the table instead of being swallowed by the cutoff. Below the table floor, fall back to the age-41-attained entry rather than the age-50 one.
4. **Do not touch `rrifMinFactor`.** Its keying is already correct; the audit note goes in the backlog so the convention is recorded once for both tables.
5. **Tests** (`lockedin.test.ts`, or a focused `lif-max.test.ts`): pin **every** published age 41-90 against the five-decimal FSRA values via the public `lifMaximumFor("ON", startOfYearAge, rate)` path; explicit pins at the requested ages 50, 55, 65, 75, 85, 89, 90 (attained-age basis) plus their start-of-year counterparts; a boundary test that start-of-year 88 is 51.45631 and 89 is 100; a test that the returned status stays `VERIFIED` and reads the component, not a literal; a monotonicity property test across the whole table.
6. **Source metadata.** `UNLOCK_RULES.ON.lifMaximum.source` set to PE0196INF Appendix A with its FSRA URL, tier 1, `verifiedDate: 2026-08-21`, status stays `VERIFIED`; the current `internal://lifMaxFactor` placeholder is removed for Ontario.
7. **Docs.** Spec §13.3a gains the Appendix A verification entry and a one-line statement of the age convention shared by the RRIF and LIF tables; `IMPLEMENTATION-CHANGELOG.md` records the correction; `AGENT-STATUS.md` records that the reported "stale table" was a keying/precision defect, not wrong data. `ENGINE-CORRECTNESS-BACKLOG.md` gains a note that other jurisdictions still use the annuity approximation and that their tables are published (out of scope here).

## Expected regression impact

The Ontario percentages change only by the rounding difference (at most ~0.005 percentage points at any age, e.g. 7.38 -> 7.37988), and the maximum only binds when the plan actually wants to draw more than the cap from a LIF.

- The Manitoba locked-in golden uses the annuity approximation, so it should not move at all.
- The single-filer / couple / accumulation anchors contain an Ontario LIF, so a movement of a few dollars is plausible **only if the cap binds in some year**.
- Rule: any anchor movement must be explained causally — the specific year and account where the cap binds, and the before/after percentage — before any re-pin. If an anchor moves by more than a rounding-scale amount, I stop and report instead of re-pinning, because that would mean the cap binds far more than expected or the age keying changed behaviour.
- Full suite plus typecheck, no deploy, no publish, CPP-1 [C] untouched, Phase 0 not approved.
