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
