# CPP-5: s.46(5) retirement adjustment on the reduced basis — research notes

Status: **DRAFT RESEARCH, docs only. No engine change. Nothing here is an approved
expected value.** Every dollar figure below is invented and labelled *illustrative*.

## Sources read (2026-11-02)

- <https://laws-lois.justice.gc.ca/eng/acts/C-8/section-46.html> (Act current to 2026-09-30)
- <https://laws-lois.justice.gc.ca/eng/acts/C-8/section-58.html>

**Tool limitation:** the fetch tool returns fragments under 125 characters plus
paraphrase, never full verbatim text. Items marked **[quoted]** are short fragments
the tool returned in quotation marks. Items marked **[paraphrase]** are the tool's
summary. Every [paraphrase] needs a second-party check against the official text
before any fixture is built on it.

## What was found

### s.46(3) / (3.1) — the adjustment factor
- (3) pensions payable after 1986 and before 2011: basic monthly amount "adjusted by a
  factor fixed by the Minister, on the advice of the Chief Actuary" **[quoted]**.
  Factor reflects the gap between start month and 65th-birthday month **[paraphrase]**.
- (3.1) pensions payable after 2010: "adjusted by a factor fixed under subsection (7)"
  **[quoted]**. Subsection (7) was not read in this session.

### s.46(4) — division of pensionable earnings increases a pension
- Post-increase factor is "[(F1 × P1) + (F2 × E)] / P2" **[quoted]**. Definitions of
  F1, P1, F2, E, P2 were not returned and are **not read**. Do not model until read.

### s.46(5) — survivor's pension reduced under s.58(2)
- The adjustment "shall not be applied to the whole of the basic monthly amount"
  but "only to the amount remaining when that basic monthly amount is reduced"
  **[quoted]**.
- It applies where both a retirement and a survivor's pension are payable and the
  survivor's pension is reduced under s.58(2); the deduction is the survivor's pension
  reduction scaled by a ratio of two Pension Index values; the text mentions a
  *downward* adjustment **[paraphrase]**. Which two Pension Index years, and the exact
  direction of the scaling, are **unconfirmed**.

### s.58(2) branches (all **[paraphrase]**)
(a) under 65, retirement pension starting after 1997; (b) under 65, starting before
1998; (c) 65 or older, born after 1932, starting after 1997; (d) all other cases.
Branch (a) uses 40% lesser-of terms; (c) uses 60% terms with capped offsets.

### s.58(3) — see also `docs/CPP-5-S58-3-EVENT-MATRIX.md`
- Multiplier is "the ratio that the Pension Index for the year that includes that
  month bears to the Pension Index for the year in which the contributor died"
  **[quoted]**.
- (e): adjustment to the survivor's retirement pension under s.55(7) or s.55.2(9)
  following a division **[quoted fragments]**.

## Decision table (what must be settled before any fixture)

| # | Question | Status |
|---|----------|--------|
| i | What counts as "reduced from its full amount under s.58(2)": the 40% lesser term, the base-only combined cap, or any shortfall vs the unreduced survivor amount? | **Unresolved.** Needs verbatim s.58(2)(a)–(d). |
| ii | Units and reference year of the "survivor's pension reduction" deduction | **Unresolved.** Paraphrase only. |
| iii | Which two Pension Index years form the ratio (own retirement first payable vs survivor pension reduced?) | **Unresolved.** |
| iv | Downward only, or also upward adjustment (e.g. late claim)? | s.46(5) text mentions downward **[paraphrase]**. Upward case unread. |
| v | Interaction with s.46(4) credit-split factor | **Unresolved.** Definitions not read. |
| vi | Floor when the deduction approaches the retirement base | **Unresolved.** No source read. Whether a negative remainder can occur under a valid history is open. |
| vii | 1997/1998 and 2019 regimes, and component scope (base, first additional, second additional) | Branches named above **[paraphrase]**. Component scope not read. |

## Second-party cross-check (owner, 2026-11-02) — recorded, not independently re-read here

Source: owner comment <https://github.com/jefferycook/canadian-wealth-compass/issues/39#issuecomment-6585116006>,
which states the Justice Laws HTML for s.46 and s.58 was read directly in full (Act
current to 2026-09-30, last amended 2024-12-17). This session did **not** re-read the
statute; the points below are the owner's reading, transcribed. They resolve the
*source-access* blocker only, not financial-methodology approval. All dollar figures
elsewhere in this file remain invented and illustrative.

- **s.46(4)** (splitting increases an already-payable retirement pension): factor after
  the increase is [(F1 x P1) + (F2 x E)] / P2, where F1 = factor under s.46(3)/(3.1) at
  original commencement; P1 = basic monthly retirement amount before division
  (s.46(1)/(2)); F2 = lesser of 1 and the factor that would apply had the pension begun
  in the month the increase becomes payable; E = P2 - P1; P2 = basic monthly amount
  immediately after division. Separate from s.46(5).
- **s.46(5)**: where a CPP survivor also receives CPP retirement and the survivor pension
  is at any time reduced from its full amount under s.58(2), a *downward* factor from
  s.46(3), (3.1) or (4) applies only to the remaining amount. The amount removed from
  the basic monthly retirement amount is the monthly survivor-pension reduction
  multiplied by PI(year retirement pension first commenced) / PI(year survivor pension
  reduced). Year order is explicit; do not invert. The reduction must come from the
  actual statutory combined-benefit calculation, not the whole survivor pension, an
  unrelated cap or a flat percentage. A s.80 agreement may provide otherwise. The
  subsection does not assert that an *upward* factor uses the reduced basis.
- **s.46(7)**: regulations (CPP Regulations 78.3, 78.4) specify post-2010 factors; the
  subsection gives no rates. Cite date-specific regulation text before any factor.
- **s.58(2)** when own CPP/provincial retirement is payable: (a) under 65, own pension
  after 1997: flat rate plus base component with 40%-of-lesser offset and a base-only
  combined cap, with distinct offsets for first and second additional components;
  (b) under 65, own pension before 1998: flat plus lesser-of base vs combined cap;
  (c) 65+, born after 1932, own pension after 1997: base reduced by 40%-of-lesser offset
  and limited by the combined base cap, additional components with distinct offsets;
  (d) all others: base subject to combined cap, additional portions at 60% of the
  deceased's components. Do not apply one 40% offset to the whole amount.

### Effect on the decision table above
- Row iii: direction and year order now stated by the owner (PI(first commenced) /
  PI(survivor reduced)); still needs our own verbatim confirmation.
- Row iv: owner reading is that s.46(5) concerns the downward factor only; the upward
  case remains unspecified.
- Row v: s.46(4) definitions now transcribed above; the interaction with s.46(5) is
  still unmodelled.
- Rows i, ii, vi, vii: still **open**. The exact "full amount under s.58(2)"
  counterfactual with multiple caps and offsets, the index year and adjustment sequence
  of the reduction, treatment of a zero or negative remainder under a valid history, and
  PI / cent-rounding order all remain unresolved. Keep fail-closed output. Representative
  actual CPP payment cases and independent exact-SHA review are still needed.

## Regs. 78.3 and 78.4 date-specific factor rules (2026-11-02, research only)

Source: Canada Pension Plan Regulations (C.R.C., c. 385), Justice Laws full-text HTML
(`FullText.html`) downloaded directly and the text of ss.78.3 and 78.4 read from the
page; the page states "current to 2026-09-30 and last amended on 2026-01-01". Both
sections cite SOR/2010-300, s. 1. This is a first-party read by this author only and has
no second-party check. Nothing here is approved, and no engine behaviour changes.

Both sections open "For the purposes of subsection 46(3.1) of the Act". They do not
name s.46(7) in their own text. The s.46(7) link above is the owner's reading and is
unconfirmed by the regulation text.

**s.78.3, pension payable in a month before the month the contributor reaches 65.**
Factor = 1 - (A x B). A = months from the month the pension becomes payable to the
month before the month the contributor reaches 65, or 60 months, whichever is less.
B by the month the pension becomes payable:

| Payable month | B |
|---|---|
| after 2010-12-31 and before 2012-01-01 | 0.0050 |
| 2012 | 0.0052 |
| 2013 | 0.0054 |
| 2014 | 0.0056 |
| 2015 | 0.0058 |
| after 2015-12-31 | 0.0060 |

**s.78.4, pension payable in a month after the month the contributor reaches 65.**
Factor = 1 + (A x B). A = months from the month after the contributor reaches 65 to the
month the pension becomes payable, or 60 months, whichever is less. B:

| Payable month | B |
|---|---|
| 2011 | 0.0057 |
| 2012 | 0.0064 |
| after 2012-12-31 | 0.0070 |

**Boundaries and gaps recorded, none resolved:**
- Neither section covers a pension payable in the month the contributor reaches 65. The
  gap is in the regulation text as read. No factor is asserted for that month; a model
  must fail closed rather than choose 1, 78.3 or 78.4.
- Neither section lists B for a payable month before 2011. Those cases are not covered
  by these two sections. Nothing is asserted for them.
- Dates are keyed to the month the pension becomes payable, not to the application
  date, the birth year or the s.58 event month.
- A is capped at 60 months in both. The cap is stated in the text as "or 60 months,
  whichever is less".
- Whether the upward factor (s.78.4) may be applied to a reduced basis under s.46(5) is
  still unspecified, as in row iv above.
- Rounding of the factor, and of the factor times the amount, is not given in either
  section.

**Structure-only arithmetic, not expected values** (invented inputs; A and B taken from
the tables above): pension payable 2026-01 for a contributor reaching 65 in 2026-07 gives
A = 6 (months 2026-01 to 2026-06), B = 0.0060, factor = 1 - 0.036 = 0.964. Pension
payable 2026-09 for a contributor who reached 65 in 2026-07 gives A = 2 (months 2026-08
to 2026-09), B = 0.0070, factor = 1 + 0.014 = 1.014.

This closes ledger item 1 only in part: s.46(7) itself and the s.46(4) definitions are
not re-read here.

## Illustrative worked shape (invented numbers, not expected values)

Only the *shape* is shown, because the ratio and deduction definitions are
unresolved: let R = survivor's retirement basic monthly amount, D = survivor-pension
reduction, k = a Pension Index ratio, f = adjustment factor. s.46(5) as paraphrased
says f is applied to (R − k·D), not to R. With invented R = 600.00, D = 100.00,
k = 1.02, f = 0.964: (600.00 − 102.00) × 0.964 = 480.072 (before any rounding rule).
This arithmetic only illustrates the *structure*. It must not be used until (ii),
(iii) and the rounding rule are verified.

## Unresolved-cases ledger
1. Read s.46(5) in full, plus s.46(7) (factor source) and the definitions in s.46(4).
2. Read s.58(2)(a)–(d) in full; identify "reduced" precisely.
3. Confirm the direction and index years of the ratio.
4. Determine whether a negative remainder can arise.
5. Find authoritative actual combined-pension amounts (Service Canada) for sanity bounds.
6. Rounding: s.62 annual rounding vs an event-product rounding rule (still open from the
   s.58(3) work).

## Not done
No code, tests or workflows were run or changed. Nothing here affects production.

## Second read of Regs. 78.3 / 78.4 and s.46(4) (2026-11-04, research only)

Source: Justice Laws HTML pages for CPP Regulations s.78.3 and s.78.4 and Act s.46,
fetched directly on 2026-11-04; the pages state "current to 2026-10-19" (regulations and
Act). Read by the same automated author as the 2026-11-02 section, so this is a
re-read, not an independent second-party check.

- **Reg. 78.3 table**: B = 0.0050 / 0.0052 / 0.0054 / 0.0056 / 0.0058 for payable
  months in 2011 / 2012 / 2013 / 2014 / 2015, and 0.0060 after 2015-12-31. A = months
  from the payable month to the month before age 65, or 60, whichever is less. Matches
  the table recorded above.
- **Reg. 78.4 table**: B = 0.0057 (2011), 0.0064 (2012), 0.0070 (after 2012-12-31).
  A = months from the month after age 65 to the payable month, or 60, whichever is less.
  Matches the table recorded above.
- Both sections open "For the purposes of subsection 46(3.1) of the Act" and do not
  mention s.46(7); the three gaps recorded above (month of the 65th birthday, payable
  month before 2011, no rounding rule) are still present in the text.
- **s.46(4)**: the formula [(F1 x P1) + (F2 x E)] / P2 and the F1, P1, F2 (lesser of
  the commencing-month factor and 1), E, P2 definitions match the owner's transcription.
- **s.46(5)** opens "Unless otherwise provided by an agreement under section 80" and
  restricts a *downward* factor to the remaining amount. The page text was read only as
  far as the start of that restriction; the PI-ratio wording was not re-read here.

Ledger items 2 to 4 (s.58(2) "reduced" branch, ratio years, negative remainder) remain
open. No numeric value is approved and no engine behaviour changes. No code or tests
were run.
