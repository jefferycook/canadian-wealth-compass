# Ontario LIF maximum and RRIF minimum: age basis and fixture requirements

**Status: DRAFT research, documentation only.** This file changes no engine code, test, golden or reference value, and no `VERIFIED`/`APPROXIMATE` flag. It is not a statutory approval. It was written by an autonomous Claude session (task `fin-on-lif-rrif-v1`, 2026-11-11). Every row needs independent second-party review before any methodology change.

Related: backlog items LIF-1, LIF-2 and LIF-3 (draft PR #64), and Issue #39 comment 6642084654 (the FSRA Appendix A audit).

## 1. Sources and access in this session

| ID  | Source                                                                                                              | Read this session?                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| R1  | Income Tax Regulations (C.R.C., c. 945) s.7308(3)–(4), Justice Laws, current to 2026-10-19, last amended 2026-06-18 | **Yes**, via fetch tool (short excerpts)                                                                    |
| R2  | Income Tax Act s.146.3(1), "minimum amount", Justice Laws, current to 2026-10-19                                    | **Yes**                                                                                                     |
| F1  | FSRA PE0196INF (Active), Appendix A, regulator HTML page                                                            | **No.** HTTP 403 to the fetch tool. Relied on the earlier read in #39 comment 6642084654                    |
| F2  | R.R.O. 1990, Reg. 909, Schedules 1, 1.1 and 2 (Ontario e-Laws)                                                      | **No.** e-Laws did not render through the fetch tool, and CanLII is outside the session's network allowlist |

Anything below that depends on F1 or F2 is marked **[not re-read]**.

## 2. Verified statutory facts (RRIF minimum)

- **R1, s.7308(4)** (a fund that was _not_ a qualifying RRIF at the beginning of the year): the factor is keyed to "the age in whole years (in the table referred to as "Y") attained by the individual at the beginning of the year". Under 71 the factor is `1/(90 − Y)`. The table runs 71 = 0.0528 through 94 = 0.1879, and 95 or older = 0.2000. All 25 rows match `RRIF_MIN` (see #39 comment 6805125398).
- **R1, s.7308(3)** (a _qualifying_ RRIF, broadly a pre-1993 fund): it uses a separate age-`X` table, keyed the same way at the beginning of the year, that starts at 72. The engine does not distinguish qualifying RRIFs. This should be recorded as an unmodelled scope limit rather than a defect.
- **R2**: the minimum is nil in the year the fund is entered into. Otherwise it is FMV at the beginning of the year × the prescribed factor, and the factor may use a spouse's or common-law partner's age if the annuitant elects before the first payment (para. (b) of B). The engine models neither the spousal-age election nor qualifying RRIFs.

**Consequence for LIF-2.** The RRIF key is **age at the beginning of the year** (in effect, age on 31 December of the prior year). For anyone whose birthday is not 1 January, that equals (age attained during the year) − 1.

## 3. The engine uses one row age for two differently keyed tables

`projection.ts` passes the same row age (`curAge + off`) to both `rrifMinFactor(age)` and `lifMaximumFor(juris, age, …)`. `registered.ts` and `docs/AGENT-STATUS.md` document that row age as the **age attained during the year**, which matches FSRA Appendix A **[not re-read]**.

On that documented convention, the RRIF lookup is one row too old.

| Row age (attained in year) | Statutory Y | Statutory factor | Engine factor (`rrifMinFactor(row)`) |
| -------------------------- | ----------- | ---------------- | ------------------------------------ |
| 65                         | 64          | 1/26 = 3.8462%   | 4.0000%                              |
| 71                         | 70          | 1/20 = 5.0000%   | 5.2800%                              |
| 72                         | 71          | 5.2800%          | 5.4000%                              |
| 80                         | 79          | 6.5800%          | 6.8200%                              |
| 95                         | 94          | 18.7900%         | 20.0000%                             |

The statutory values come from R1. The engine values are `RRIF_MIN` and `1/(90−age)` at the row age.

If the row age were instead read as the age at the beginning of the year, the RRIF lookup would be correct and the Ontario LIF lookup would be one row too young. That would understate the maximum, which is conservative. **Under either reading exactly one of the two lookups is off by one row**, unless a date of birth is introduced (LIF-1). The existing `rrif.ageBasisWholeYear` `APPROXIMATE` status, which suppresses recommendations, already discloses the whole-year proxy. This file does not claim that the status is insufficient. It records that the direction of the RRIF error, under the engine's documented convention, is an **overstated minimum** (forced withdrawals one row early). That is not obviously conservative for tax projections.

No engine change is proposed here. Any fix needs a DOB-aware age basis (LIF-1), applied to both tables, under a separate scoped review and owner authorization.

## 4. Ontario LIF maximum: decision matrix

| Limb or rule                                                                                  | Source  | Evidence state                                                 | Engine today                                                   |
| --------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| C/F table %, ages 41–90 (50 rows)                                                             | F1      | Matched to `ON_LIF_MAX` in the earlier audit **[not re-read]** | Implemented (`lifMaxFactor`)                                   |
| Table key = age attained during the year                                                      | F1      | Earlier audit **[not re-read]**                                | Row age used directly                                          |
| 6% reference-rate floor                                                                       | F1      | Earlier audit **[not re-read]**                                | Embedded in the table values                                   |
| Pre-2009 LIF/LRIF: max = greater of prior-year investment earnings (incl. unrealized) and C/F | F1 / F2 | Earlier audit **[not re-read]**                                | **Not modelled.** The C/F limb only, so the cap can understate |
| Post-2008 LIF: also the qualifying direct-transfer earnings alternative                       | F1 / F2 | Earlier audit **[not re-read]**                                | **Not modelled**                                               |
| First fiscal year < 12 months: prorated, part month = full month                              | F1      | Earlier audit **[not re-read]**                                | **Not modelled**                                               |
| Ages < 41                                                                                     | F1      | Not published in Appendix A                                    | Returns the age-41 row (no statutory coverage implied)         |
| Ages ≥ 90 → 100%                                                                              | F1      | Earlier audit **[not re-read]**                                | Implemented                                                    |

## 5. Fixture requirements before any methodology change

Each fixture needs a primary-source citation for its rule and hand arithmetic. None of the numbers below is approved. They show the inputs a fixture must carry.

1. **RRIF age basis (R1)**: DOB, valuation year and beginning-of-year FMV. Cases: birthday on 1 January; mid-year birthday at row 71 (Y = 70 → 5.00%); the 94→95 transition; and the year the fund is entered into (nil minimum, R2).
2. **Spousal-age election (R2 B(b))**: the elected spouse's DOB. Currently out of scope, so the fixture would document the exclusion.
3. **Ontario LIF C/F limb (F1)**: DOB, the age attained in the year, and January 1 FMV. The cases must include a birthday before and after the plan start date.
4. **Investment-earnings limb (F1/F2)**: prior-year earnings including unrealized gains and losses, with a case where earnings exceed C/F.
5. **Transfer-earnings limb (F2, post-2008)**: the transfer date and the transferred fund's earnings. The case needs a source re-read first.
6. **First-year proration (F1)**: the establishment date and months remaining, including a partial month.

Fixtures 3–6 stay blocked until F1 and F2 are re-read verbatim by a reviewer with access.

## 6. Open questions for the reviewer

- Confirm F1's exact age-key wording verbatim. If FSRA in fact keys to age at the end of the preceding year, section 3's direction reverses and the LIF table, not the RRIF table, is the misaligned lookup.
- Confirm the Reg. 909 section numbers for the investment-earnings and transfer-earnings limbs.
- Decide whether the engine should model qualifying RRIFs (R1 s.7308(3)) or keep declaring them out of scope.
