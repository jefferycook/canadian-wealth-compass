# CPP-5 statutory corrections to the PR #52 design draft (DRAFT, docs only)

Status: **research / design only. No engine change, no approved numbers, no
financial-methodology sign-off.** `src/lib/planning/benefits.ts` is untouched and
CPP-5 stays OPEN. This note answers the three blocking findings in
https://github.com/jefferycook/canadian-wealth-compass/pull/52#issuecomment-6504448351
and does not edit PR #52, #40 or the canonical spec. It needs independent Codex
review and owner confirmation before anything here is relied on.

## 0. Evidence and limits

Read on 2026-10-29 by downloading the Justice Laws HTML directly (not a
paraphrasing fetch) and stripping tags; the statute text below is quoted from
that output. Pages showed "current to 2026-09-30".

- CPP Act s.46: https://laws-lois.justice.gc.ca/eng/acts/C-8/section-46.html
- CPP Act s.58: https://laws-lois.justice.gc.ca/eng/acts/C-8/section-58.html
- CPP Regulations s.62: https://laws-lois.justice.gc.ca/eng/regulations/C.R.C.,_c._385/section-62.html
  (Regulations current to 2026-09-30, last amended 2026-01-01)

Not read in this pass: Act ss.43, 45, 48.1, 48.2, 51, 57, 58(3)-(3.6), the
Maximum Pensionable Earnings Average definition, and the OCA 32nd report. Every
dollar figure below is an **invented illustration, not an approved fixture**, and
none was checked against a Service Canada calculation.

## 1. Blocker 1: the 40% survivor reduction is not the cap trim

PR #52 pseudocode: `reduction = sum(A - B) - survivorPension`. That returns only
the amount the base cap removed. The text of s.46(5) is: if a person receives a
retirement pension and a survivor's pension "and the survivor's pension is at any
time reduced from its full amount under subsection 58(2)", a downward adjustment
factor applies "only to the amount remaining when that basic monthly amount is
reduced by the product obtained by multiplying (a) the amount by which the
survivor's pension has been reduced by (b) the ratio that the Pension Index for
the year in which the retirement pension first commenced to be payable bears to
the Pension Index for the year in which the survivor's pension is reduced."

"Full amount" is the s.58(1)(b) amount for a 65+ survivor with no own pension
(60% of the deceased's portions). In s.58(2)(c) every component is `A - B` with
`B = min(0.4A, 0.4 x own portion)`, so the survivor pension is below its full
amount (`A`) whenever B > 0, even when the cap does not bind.

Counterexample (illustrative, unapproved; one component, base only):
A = 360, own base portion = 360 so 0.4 x own = 144, 0.4A = 144, B = 144,
cap room non-binding. s.58(2)(c)(i)(A) = 360 - 144 = 216.
- PR #52 formula: sum(A - B) - survivorPension = 216 - 216 = **0** (wrong).
- s.46(5)(a) amount by which the pension was reduced from full: 360 - 216 = **144**.

Corrected ledger (name each field separately; do not collapse):

| Field | Definition | Source |
|---|---|---|
| `fullSurvivorEntitlement` | per component `A_c` = 60% of deceased portion c | s.58(1)(b), s.58(2)(c) |
| `ownPortionOffset_c` | `B_c = min(0.4 A_c, 0.4 x survivor own portion c)` | s.58(2)(c)(i)(B)(I)... see section 4 |
| `capTrim` | base only: how far `min` in (c)(i) pulled the base below `A - B` | s.58(2)(c)(i) |
| `combinedSurvivorPension` | sum of the three (c) terms | s.58(2)(c) |
| `s46_5_reduction` | `fullSurvivorEntitlement - combinedSurvivorPension` (candidate identity; valuation time and unit still to verify) | s.46(5)(a) |

## 2. Blocker 2: branch selector is the own-retirement start, not the survivor start

s.58(2)(c) applies to "a survivor who has reached 65 years of age and who was
born after December 31, 1932 and whose retirement pension commences to be payable
after December 31, 1997". The year of the survivor pension is not the selector.
The survivor-pension year appears only inside the cap term: "the later of the
year in which the survivor first became qualified to receive the survivor's
pension and the year in which the survivor's retirement pension commenced to be
payable". Four dates must be separate typed fields:

```ts
interface CppSurvivorDates {
  ownRetirementPensionCommencement: YearMonth;  // branch selector (> 1997-12-31 for (a) and (c))
  survivorPensionQualification: YearMonth;       // first qualified; feeds cap year
  survivorPensionPayability: YearMonth;          // first payable
  survivorReductionDate: YearMonth;              // s.46(5)(b) PI denominator year
  capYear: number; // derived = max(qualification year, ownRetirement commencement year)
}
```

The age condition in (c) is "has reached 65"; (a) is "has not reached sixty-five".
Branch (b) is own pension commencing before 1998 (under 65); (d) is "any other
case", which includes born before 1933 and 65+ with a pre-1998 start.

## 3. Blocker 3: no under-45 taper in s.58(1)(a.1)

s.58(1)(a) (months before January 2019) contains "reduced, unless the survivor
was ... a survivor with dependent children or unless he is disabled, by 1/120 for
each month by which the age of the survivor ... is less than forty-five years".
s.58(1)(a.1) (months after December 2018) contains flat rate benefit (1.1) plus
37.5% of the aggregate of (3), (3.1), (3.4), and **no** age-45 reduction clause.
Row 1 of the PR #52 decision table is wrong for modern months and should read:
"37.5% of deceased portions + flat rate (s.58(1.1)); no under-45 taper."
Row 2 (before 2019) keeps the 1/120-per-month taper. This also strengthens the
canonical-spec s.4.4 correction request: do not carry the old under-35/no-child
rule forward for months after December 2018.

## 4. Structure facts that change the PR #52 contract (from the (c) text)

1. **The cap applies to the base component only.** In s.58(2)(c) the cap (B) sits
   in (c)(i) alone; (c)(ii) (first additional, s.46(1)(b)) and (c)(iii) (second
   additional, s.46(1)(c)) are plain `A - B` with no cap. The PR #52 loop
   `part.base = min(...)` is consistent, but its `capTrim` is base-only.
2. **Flat rate placement under 65.** In s.58(2)(a) the flat rate (or post-
   retirement disability benefit, if greater) is added outside and in addition
   to `(i)(B)`, whose cap term is `lesser of (I) C - D and (II) cap room`, with
   `C` = 37.5% of deceased's (3) portion. The 40% offset `D` applies to `C`.
   Under-65 uses 37.5%, 65+ uses 60%.
3. **Cap room expression.** `capRoom = 25% x 1/12 x survivor MPE Average (cap
   year, indexed per s.45(2) as if commencing in cap year) - own base portion
   (46(1)(a), ignoring 46(3)-(6), indexed 45(2))`. The text does not say it is
   non-negative. Whether own base can exceed the cap amount under a valid history
   is **unresolved**; do not insert `Math.max(0, ...)` and do not certify the
   old F4 fixture.
4. **Own portions ignore s.46(3)-(6).** The survivor's own-pension portions
   used in A/B/cap are the unadjusted s.46(1) portions "without regard to
   subsections 46(3) to (6)" (for (c)(ii)/(iii): "46(3.1) to (6)"), indexed per
   s.45(2). Early/late adjustment is therefore not in the survivor formula; it
   re-enters only through s.46(5) on the retirement-pension side.
5. **Trigger precision for s.46(5).** It concerns a *downward* adjustment factor
   from s.46(3), (3.1) or (4) at the time the survivor pension is reduced, is
   subject to "Unless otherwise provided by an agreement under section 80", and
   names retirement and survivor's pensions "under this Act". Do not label it
   generic "early/late" and do not assume a QPP-equivalent rule.
6. **PI ratio denominator.** s.46(5)(b): numerator is the Pension Index for the
   year the retirement pension first commenced; denominator is the year the
   survivor's pension "is reduced", not necessarily its first payable year. (Note
   that this is the stated ratio direction; confirm against s.45 and the PI
   definition in s.43 before coding.)

## 5. Rounding (Regulations s.62), read directly

s.62 applies "when the basic monthly amount of a benefit is adjusted annually
pursuant to subsection 45(2)":
- (1)(a) the product of the s.45(2)(a) amount and the s.45(2)(b) ratio is
  adjusted to the nearest cent per (2): if the third digit after the decimal
  point is < 5 the third and later digits are dropped; if >= 5 the second digit
  is increased by one and the rest dropped. Only the third digit is examined,
  so 0.0049999 rounds like 0.004 (down) and 0.005 rounds up.
- (1)(b), (3): the ratio is expressed as a decimal fraction "of four digits after
  the decimal point"; then if the fourth digit is < 5 the fourth is dropped and
  the third unchanged, if >= 5 the third digit is increased by one and the fourth
  dropped. Read literally this leaves **three** decimal places. This wording
  looks inconsistent with "four digits"; it is flagged as an **open reading
  question** and must not be coded until confirmed (e.g. against the PI table
  and a Service Canada indexation example).
- s.62 governs annual s.45(2) adjustment only. It does not say how s.58 or s.46(5)
  intermediate products are rounded; the order of operations across components
  is unresolved.

## 6. Corrected decision table (replaces PR #52 section 1 rows 1, 4, 8)

| # | Situation | Section | Corrected shape |
|---|---|---|---|
| 1 | Under 65, no own pension, months after Dec 2018 | s.58(1)(a.1) | flat rate + 37.5% of (3)+(3.1)+(3.4); **no under-45 taper** |
| 2 | Same, months before Jan 2019 | s.58(1)(a) | as row 1 but with 1/120 per month under 45 unless dependent children/disabled |
| 4 | Under 65, own retirement pension commenced after 1997 | s.58(2)(a) | flat rate (or greater of flat rate and PRDB) + base `min(C-D, capRoom)` + first-add `C-D` + second-add `C-D`, C = 37.5% of deceased portion |
| 8 | Survivor pension reduced from full amount under s.58(2) | s.46(5) | downward factor from s.46(3)/(3.1)/(4) applies to (basic amount - reduction x PI ratio); reduction = full - actual, not cap trim; s.80 agreements may override |

Rows 3, 5, 6, 7 stand as in PR #52 with the section 2 date-selector correction.

## 7. Open items and next verification target

1. Sign of the cap-room expression under valid histories (F4 stays on hold).
2. Reading of Regulations s.62(3) (three vs four decimals).
3. s.58(3)-(3.6), s.57, s.43, s.45, s.48.1, s.48.2, s.51 and the MPE Average
   definition, read directly.
4. Order of rounding across components and the s.46(5) product.
5. s.80 international-agreement exception and provincial (QPP) interactions.
6. Service Canada or independent-actuary numeric fixtures. Missing official
   fixtures remain a blocker; nothing here is a test expectation.

Request: independent Codex review of the section 1 to 5 readings against the
Justice Laws text, then owner decision. This note authorizes no engine edit.
