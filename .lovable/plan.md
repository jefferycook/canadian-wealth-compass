# Ontario LIF maximum table — verification result and scoped correction (revised)

## What I checked, independently

FSRA guidance **PE0196INF (Active)**, *Life Income Fund (LIF) and Locked-In Retirement Income Fund (LRIF) Maximum Annual Income Payment Amount Table*, **Appendix A**, retrieved 2026-08-21. Appendix A is keyed to **"age attained during year"**, gives the maximum to **five decimals**, runs ages **41-90**, and is effective 2021-01-01 (the reference rate is floored at 6%, so the table has not moved).

## Finding

The live `ON_LIF_MAX` in `src/lib/planning/registered.ts` is **FSRA Appendix A shifted down one age and rounded to two decimals**:

```text
live 50 = 6.27   = FSRA age 51 (6.26996)     FSRA age 50 = 6.23197
live 55 = 6.51   = FSRA age 56 (6.50697)     FSRA age 55 = 6.45234
live 65 = 7.38   = FSRA age 66 (7.37988)     FSRA age 65 = 7.25513
live 75 = 9.71   = FSRA age 76 (9.71347)     FSRA age 75 = 9.33511
live 85 = 22.40  = FSRA age 86 (22.39589)    FSRA age 85 = 19.18515
live 89 = 100    = FSRA age 90               FSRA age 89 = 51.45631
```

The shift matches an industry "age as at Jan 1" presentation, but that January-1 convention is **not** supported by this engine's input contract: `PersonInput.curAge` is documented only as "Current age in whole years", the projection walks `curAge + off`, and the canonical spec states the Ontario LIF expectations directly at ages {55, 65, 75, 85}. The live table is therefore wrong against the contract it is actually called with, and it **overstates** the permitted maximum at every age.

## Correction plan

1. **Use FSRA Appendix A directly, unshifted.** The projection row `age` is the engine's annual-granularity proxy for FSRA "age attained during year". No `age + 1`, no January-1 convention is introduced anywhere.
2. **Replace the constant** with the official five-decimal values for **ages 41-90** (`50: 6.23197 ... 85: 19.18515, 88: 35.29338, 89: 51.45631, 90: 100.00000`), named to state its keying (e.g. `ON_LIF_MAX` retained as the export name, with the age basis stated in its doc comment).
3. **Boundary correction** in `lifMaxFactor`: remove the `age >= 89 -> 100` shortcut. Age **89 returns 51.45631**, **90 and above return 100**. Ages below 41 fall back to the age-41 entry (5.98531) rather than the age-50 entry.
4. **Document the annual-granularity caveat** in the function doc comment and in the spec: the engine models whole years, so for a plan started before the client's birthday the applicable FSRA row can be one age step ahead of the engine's row, making the modelled maximum conservative in the start year. DOB/calendar-date precision is explicitly out of scope and is recorded as a separate backlog item, not fudged with a constant offset.
5. **RRIF untouched.** `rrifMinFactor` is not changed in this pass. I will audit its age basis against the ITA/CRA prescribed-factor definition and record the result as a distinct follow-up entry in `ENGINE-CORRECTNESS-BACKLOG.md` **only if** the audit shows a mismatch.
6. **Source metadata.** `UNLOCK_RULES.ON.lifMaximum.source` becomes PE0196INF Appendix A with its FSRA URL, tier 1, `verifiedDate: 2026-08-21`; status stays `VERIFIED`. The `internal://lifMaxFactor` placeholder is removed for Ontario.

## Tests

In `lockedin.test.ts` (or a focused `lif-max.test.ts`), all through the public `lifMaximumFor("ON", age, rate)` path:

- Exact pins at **50, 55, 65, 75, 85, 89, 90**, plus a loop pinning **every age 41-90** against the FSRA five-decimal values.
- Boundary: 89 = 51.45631 and `applies === true`; 90, 95 = 100.
- Below-floor behaviour at age 40 returns the age-41 value.
- Monotonic non-decreasing across 41-90.
- Status stays `VERIFIED` and is read from the component, not a literal.
- **Replace, not extend**, the existing assertions that bless the shifted values — notably the `ON_LIF_MAX[age]` checks at 55/65/75/85 in the current "Ontario LIF maximum" block, which would otherwise pass vacuously against the new table.

## Expected golden movement

This is a real, source-backed methodology movement, not a rounding change: at age 65 the cap drops from 7.38% to 7.25513%, at 75 from 9.71% to 9.33511%, at 85 from 22.40% to 19.18515%, and age 89 stops being 100%.

- A golden fixture holds an Ontario LIF, so anchors may move wherever the cap actually binds — a lower cap defers registered income and can shift lifetime tax in either direction (less taxable draw now, larger balance later).
- Before any re-pin I will identify the exact rows where the LIF maximum binds (age, account, old vs new percentage, dollar delta) and state the causal chain to the anchor. No blind re-pinning.
- If an anchor moves without a traceable binding row, that is a defect and I stop and report instead of re-pinning.
- The Manitoba locked-in golden uses the annuity approximation and should not move; if it does, I stop and report.

## Guardrails

Full suite plus typecheck before reporting; exact before/after for all anchors. CPP-1 stays **OPEN [C]**, Phase 0 not approved, Phase 1 not started, nothing deployed or published, no CPP survivor logic touched.
