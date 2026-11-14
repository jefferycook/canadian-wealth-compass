# RRIF minimum start-of-year age: source audit, live call-site comparison and fixture plan

**Status: DRAFT research, documentation only.** This file changes no engine code, test, golden or reference value, and no `VERIFIED`/`APPROXIMATE` flag. It is not a statutory approval and is not an independent review of PR #68: it was written by an autonomous Claude session, the same kind of author as #68. Every row needs second-party review before any methodology change.

Task: `law-audit:rrif-jan1-age`, queued in Issue #39 comment 6807482768. Evidence anchors: draft PR #68 at head `1da86c1b3215c48418cfb840a9d4e559e73e57e1`; production `main` at `07d273b11d6b96dcec06921524aacdf6e1cc8b03`. Session date 2026-11-11.

## 1. Sources read in this session

| ID  | Source                                                                                                            | Read?                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| R1  | Income Tax Regulations, C.R.C., c. 945, s.7308(3) and (4), Justice Laws, "current to 2026-10-19"                  | **Yes**, fetched directly (HTTP 200). Quoted verbatim below               |
| R2  | Income Tax Act, R.S.C. 1985, c. 1 (5th Supp.), s.146.3(1) "minimum amount", Justice Laws, "current to 2026-10-19" | **Yes**, verbatim                                                         |
| R3  | Income Tax Act s.146(2)(b.4) (RRSP maturity)                                                                      | **Yes**, verbatim                                                         |
| R4  | Interpretation Act, R.S.C. 1985, c. I-21, s.30, Justice Laws, "current to 2026-10-19"                             | **Yes**, verbatim                                                         |
| P1  | Ontario Reg. 909, Sch. 1/1.1 s.6 (LIF maximum)                                                                    | **No.** Relies on PR #68 §2 for the LIF key; used only for the LIF column |

## 2. Primary text

- **R1 s.7308(4)** (every RRIF that was not a qualifying RRIF at the beginning of the year): the factor "corresponds to the age in whole years (in the table referred to as "Y") attained by the individual at the beginning of the year or that would have been so attained by the individual if the individual was alive at the beginning of the year." Table: under 71, `1/(90 – Y)`; 71 → 0.0528; 72 → 0.0540; … 94 → 0.1879; 95 or older → 0.2000.
- **R1 s.7308(3)** (qualifying RRIF, i.e. pre-1993 funds, per s.7308(2)): same "at the beginning of that year" wording, with the variable named "X". The table differs: "Under 72 1/(90 – X)", so X = 71 gives 1/19 (5.2632%), not 5.28%. Rows 72 to 95+ are identical to s.7308(4).
- **R2 s.146.3(1) "minimum amount"**: "for the year in which the fund was entered into, a nil amount, and, for any other year, … (A × B) + C", where A is the FMV of fund property "at the beginning of the year" and B is the prescribed factor for the first annuitant, unless an election was made "before any payment has been made under the fund by the carrier" to use the age of the spouse or common-law partner (para. (b) of B), or a pre-1992 election to use another individual's age (para. (a)).
- **R3 s.146(2)(b.4)**: the RRSP must not "provide for maturity after the end of the year in which the annuitant attains 71 years of age".
- **R4 s.30**: "A person is deemed not to have attained a specified number of years of age until the commencement of the anniversary, of the same number, of the day of that person's birth."

The 71 → 95+ table in `RRIF_MIN` (`src/lib/planning/registered.ts`, main 07d273b) was compared by hand against the R1 s.7308(4) text, row by row. All 25 rows match, and `rrifMinFactor` returns `100/(90 − age)` below 71. Only the **age argument** is in dispute here, not the table.

## 3. Statutory age basis (Y)

From R1 + R4: `Y = year − birthYear − 1`, except that a person born on **1 January** reaches the anniversary at the commencement of 1 January and therefore `Y = year − birthYear`.

- **1 January birthday: resolved by R4.** PR #68 §5 and §7 Q2 left this as "arguably". The Interpretation Act s.30 fixes when an age is attained: at the commencement of the anniversary. For a 1 January birthday that is the commencement of the year, so Y equals the age attained during the year. `ageAtBeginningOfYear` in `src/lib/planning/ages.ts` already implements this reading. A reviewer should still confirm that s.30 governs a regulation. Interpretation Act s.3(1) is understood to apply the Act to every "enactment", including regulations, but s.3 was **not re-read** in this session.
- **29 February birthday:** irrelevant to Y. Y depends only on whether the birthday is 1 January.
- **70 → 71 transition (s.7308(4)):** the first year at 5.28% is the year in which the owner is **71 at the start of the year**, which for anyone not born on 1 January is the calendar year in which they turn **72**. The year they turn 71 uses Y = 70 → 1/20 = 5.00%.
- **Interaction with RRSP maturity (R3):** a mid-year-birthday owner whose RRSP matures in the year they turn 71 has a nil minimum that year (R2), and the first minimum, in the next year, is at Y = 71 → 5.28%.

## 4. Live call site (main 07d273b)

Reading the code, not running it:

1. `normalizePerson` in `draft.ts` (l.114–115) sets `curAge = effectiveCurrentAge(p.dob, p.curAge)`, which is `ageFromDob(dob, new Date())`. That is the age **on the run date**, not on any statutory date.
2. `projection.ts` (l.370) sets each row's age to `curAge + off`. The row year is `startYear + off`, and `startYear` is `override.startYear ?? new Date().getFullYear()` (l.298).
3. The RRIF branch (l.889–930) calls `rrifMinFactor(age)` and the locked-in branch (l.939) calls `lifMaximumFor(a.juris, age, …)` with **the same row age**. The transferring-RRIF retention at l.486 also uses `rrifMinFactor(curAge + off)`.
4. `PersonInput.dob` is carried into the projection inputs (`types.ts` l.614), but `projection.ts` never reads it. `ageAtBeginningOfYear` and `ageAttainedDuringYear` (`ages.ts`) have **no call sites and no tests** anywhere in `src`.
5. The default RRSP conversion age is 71 (`convAgeOf`, l.274–279), compared against the same row age (`isRRIFnow`, l.876).

So the row age is **neither** Y nor the LIF key `a`. It equals `a` when the run date is on or after the birthday in the run year, and `a − 1 = Y` when the run date is before it (1 January birthdays always give `a = Y`). This is the "attained-during-year age proxy" only for part of the calendar.

## 5. Discrepancy with PR #68

PR #68 §5 says: "If the row age is `a`, which the LIF table requires, then the RRIF factor is one row too old … **the RRIF lookup is the misaligned one.**"

The conditional is correct, but the live engine does not fix the row age at `a`. Which lookup is misaligned **depends on the run date**:

| Run date relative to birthday in run year | Row age | RRIF minimum lookup                             | Ontario LIF maximum lookup                       |
| ----------------------------------------- | ------- | ----------------------------------------------- | ------------------------------------------------ |
| On or after the birthday                  | `a`     | One row too old → **overstates** (except 1 Jan) | Correct key                                      |
| Before the birthday                       | `a − 1` | Correct (= Y)                                   | One row too young → **understates** the C/F limb |
| 1 January birthday (any run date)         | `a`     | Correct (Y = a)                                 | Correct                                          |

Further consequences that PR #68 does not record:

- **Same plan, different answers by run date.** One saved plan re-run on 1 March and on 11 November of the same year can produce different RRIF minima and LIF maxima for every projected year.
- **RRSP conversion timing.** With a pre-birthday run date, the default conversion (row age ≥ 71) fires in the calendar year the owner turns **72**. That is one year after the s.146(2)(b.4) deadline. The engine then applies a nil establishment-year minimum in that year, where the statute would have a 5.28% minimum (fund matured the year before). With a post-birthday run date the conversion year is correct, but the first minimum uses row 72 → 5.40% instead of Y = 71 → 5.28%.
- **`override.startYear`.** When `startYear` differs from the run year, `curAge` is still clock-derived, so the row age is shifted by the difference as well. This matters for the reproducible-clock test path.
- **Not modelled at all:** the s.7308(3) qualifying-RRIF table (71 → 1/19) and the spouse-age election in R2 para. (b) of B. Neither is flagged by a status source that I found. They are outside this task's scope, but a reviewer should decide whether they need `APPROXIMATE`/`UNSUPPORTED` disclosure.

The existing `rrif.ageBasisWholeYear` `APPROXIMATE` status (`types.ts` l.218) is accurate as a disclosure: it says a "whole-year age proxy rather than a date-of-birth-derived statutory age" is used, and that recommendations are suppressed. No status change is proposed.

## 6. Independent derivation

Computed in Python `Decimal` from the R1 table as keyed from the Justice Laws text, plus R4. No engine constant or output was used. "Engine row" models §4 steps 1–2 with `startYear` = run year. LIF values use PR #68's key `a` and its 6% formula `100 / Σ_{k=0}^{90−a} 1.06^−k`, rounded half-up to 5 dp. These are **factors only, not payable amounts**.

| Case                         | DOB        | Run date   | Year | a   | Y   | Statutory RRIF % | Engine row | Engine RRIF % | LIF % at key `a` | LIF % at engine row |
| ---------------------------- | ---------- | ---------- | ---- | --- | --- | ---------------- | ---------- | ------------- | ---------------- | ------------------- |
| C1 mid-year, run after bday  | 1955-07-15 | 2026-11-11 | 2026 | 71  | 70  | 5.0000           | 71         | 5.2800        | 8.22496          | 8.22496             |
| C1                           | 1955-07-15 | 2026-11-11 | 2027 | 72  | 71  | 5.2800           | 72         | 5.4000        | 8.45480          | 8.45480             |
| C2 mid-year, run before bday | 1955-07-15 | 2026-03-01 | 2026 | 71  | 70  | 5.0000           | 70         | 5.0000        | 8.22496          | 8.01930             |
| C2                           | 1955-07-15 | 2026-03-01 | 2027 | 72  | 71  | 5.2800           | 71         | 5.2800        | 8.45480          | 8.22496             |
| C3 1 January                 | 1955-01-01 | 2026-11-11 | 2026 | 71  | 71  | 5.2800           | 71         | 5.2800        | 8.22496          | 8.22496             |
| C3                           | 1955-01-01 | 2026-11-11 | 2027 | 72  | 72  | 5.4000           | 72         | 5.4000        | 8.45480          | 8.45480             |
| C4 31 Dec, run 30 Dec        | 1954-12-31 | 2026-12-30 | 2026 | 72  | 71  | 5.2800           | 71         | 5.2800        | 8.45480          | 8.22496             |
| C5 31 Dec, run 31 Dec        | 1954-12-31 | 2026-12-31 | 2026 | 72  | 71  | 5.2800           | 72         | 5.4000        | 8.45480          | 8.45480             |
| C6 70→71, run after bday     | 1956-07-15 | 2026-11-11 | 2026 | 70  | 69  | 4.7619           | 70         | 5.0000        | 8.01930          | 8.01930             |
| C6                           | 1956-07-15 | 2026-11-11 | 2027 | 71  | 70  | 5.0000           | 71         | 5.2800        | 8.22496          | 8.22496             |
| C6                           | 1956-07-15 | 2026-11-11 | 2028 | 72  | 71  | 5.2800           | 72         | 5.4000        | 8.45480          | 8.45480             |
| C7 70→71, run before bday    | 1956-07-15 | 2026-03-01 | 2026 | 70  | 69  | 4.7619           | 69         | 4.7619        | 8.01930          | 7.83449             |
| C7                           | 1956-07-15 | 2026-03-01 | 2027 | 71  | 70  | 5.0000           | 70         | 5.0000        | 8.22496          | 8.01930             |
| C7                           | 1956-07-15 | 2026-03-01 | 2028 | 72  | 71  | 5.2800           | 71         | 5.2800        | 8.45480          | 8.22496             |
| C8 29 Feb                    | 1956-02-29 | 2026-11-11 | 2027 | 71  | 70  | 5.0000           | 71         | 5.2800        | 8.22496          | 8.22496             |
| C9 94→95                     | 1931-07-15 | 2026-11-11 | 2026 | 95  | 94  | 18.7900          | 95         | 20.0000       | 100              | 100                 |
| C9                           | 1931-07-15 | 2026-11-11 | 2027 | 96  | 95  | 20.0000          | 96         | 20.0000       | 100              | 100                 |

C4 and C5 differ only in the run date (one day apart) and give different RRIF and LIF factors for the same year. The LIF 8.01930 and 7.83449 values for ages 70 and 69 are derived from the formula. The 70 value equals `ON_LIF_MAX[70]` in `registered.ts`.

## 7. Fixture plan (no expected value here is approved)

Each fixture must cite R1/R2/R4 and carry hand arithmetic. They should be built against **pure helpers with DOB and year in, factor out**, so no fixture depends on the wall clock.

1. **`ageAtBeginningOfYear` unit tests** (helper exists, has no tests): DOB 1955-07-15 / 2026 → 70; 1955-01-01 / 2026 → 71; 1954-12-31 / 2026 → 71; 1956-02-29 / 2027 → 70; DOB 2026-01-01 / 2026 → 0; DOB 2026-07-15 / 2026 → null (not yet born at the start of the year); born after the year → null. Same set for `ageAttainedDuringYear`. These are test-only and do not change financial behaviour.
2. **Composition fixture** `rrifMinFactor(ageAtBeginningOfYear(dob, yr))`: the C1–C9 statutory RRIF column above.
3. **Run-date independence fixture (currently expected to fail):** the same plan projected with `startYear = 2026` and the clock mocked to 2026-03-01 versus 2026-11-11 should give identical per-year factors. Today it does not (C1 vs C2). Record as a known-failing or `skip`-with-reason test only if the owner authorizes it, because it pins an engine defect.
4. **RRSP conversion timing:** a mid-year-DOB owner with an RRSP: maturity in the year turning 71, nil minimum that year, 5.28% the next year. Compare against both run-date regimes.
5. **Out-of-scope disclosures:** a qualifying-RRIF (s.7308(3)) case at X = 71 → 1/19, and a spouse-age election case. Only as disclosure tests unless the owner scopes them in.

## 8. Fix path for a separate, authorized task (not done here)

When `dob` is present, call `ageAtBeginningOfYear(dob, yr)` for the RRIF minimum (l.486, l.922) and `ageAttainedDuringYear(dob, yr)` for the LIF maximum and conversion triggers. Fall back to today's proxy, keeping the `rrif.ageBasisWholeYear` disclosure, only when the DOB is absent. This changes financial output for most plans, so it needs owner authorization, independent review and the Phase 0 trusted-merge process.

## 9. Open questions for an independent reviewer

1. Confirm the Interpretation Act s.30 reading for 1 January birthdays (§3).
2. Confirm that the conversion age (R3) should key on the age attained during the year, not on Y.
3. Decide whether a run-date-dependent projection is acceptable while `rrif.ageBasisWholeYear` is disclosed, or whether it is a defect to fix first.
4. Decide whether s.7308(3) and the spouse-age election need their own status sources.
