# CPP-5 statutory decision table, calculation contract and test plan (DRAFT)

Status: **research / design only. No engine change, no approved numbers.**
`src/lib/planning/benefits.ts` is untouched and CPP-5 stays OPEN. Nothing here
authorizes an implementation. Complements (does not replace) the draft notes in
PR #40 / `docs/CPP-5-INVESTIGATION-NOTES.md`, which hold invented F1-F5/G1-G3
arithmetic.

## 0. Method and limits of the evidence

- Sources read on 2026-10-29 through a fetch tool that **paraphrases** and cannot
  return verbatim statute text (it truncates quotes). Every statutory point below
  is therefore "paraphrase-read", not "verbatim-verified". Items marked
  **[needs verbatim check]** must be compared with the Justice Laws text by a
  second party (Codex / owner) before any use.
- Justice Laws pages for ss.46 and 58 both showed "current to 2026-09-30",
  last amended 2024-12-17.
- Not read in this pass: CPP Regulations s.62 (rounding), ss.43, 45, 48.1, 48.2,
  51, 57 in full, and the OCA 32nd report sections. They stay open (section 6).

Evidence labels used in the ledger: **P** paraphrase-read statute, **D** derived
mathematically from P, **A** assumed, **U** unresolved.

## 1. Statutory decision table

URLs: s.58 https://laws-lois.justice.gc.ca/eng/acts/C-8/section-58.html ,
s.46 https://laws-lois.justice.gc.ca/eng/acts/C-8/section-46.html

| # | Survivor situation | Section | Shape (as read) | Launch scope |
|---|---|---|---|---|
| 1 | Under 65, no own retirement pension, from Jan 2019 | s.58(1)(a.1) | flat-rate benefit (s.58(1.1)) + 37.5% of deceased's retirement-pension portion; reduced if under 45 and no child/disability | Gate: currently not the combined-branch defect |
| 2 | Under 65, no own retirement pension, before 2019 | s.58(1)(a) | same shape, older rules | Out of scope (legacy) |
| 3 | 65+, no own retirement pension | s.58(1)(b) | 60% of deceased's portion | In scope; already modelled as 60% |
| 4 | Under 65, own retirement pension commenced after 1997 | s.58(2)(a) | 37.5% shape + flat-rate / post-retirement disability interaction, minus own-pension offset **[needs verbatim check]** | Not mapped; gate as unsupported |
| 5 | Under 65, own pension commenced before 1998 | s.58(2)(b) | legacy cap | Out of scope; gate |
| 6 | 65+, born after 1932, own pension commenced after 1997 | s.58(2)(c) | three components (base, first additional, second additional) | **The modern branch CPP-5 targets** |
| 7 | All other combinations (born before 1933, pre-1998 start, etc.) | s.58(2)(d) | other formula | Out of scope; gate |
| 8 | Survivor pension is reduced under s.58(2) and survivor took an early/late retirement start | s.46(5) | early/late adjustment applies only to (basic amount minus the survivor-pension reduction) x PI ratio | Applies to rows 4-7 whenever the s.58(2) reduction is non-zero |

Row 8 point (owner hypothesis): s.46(5) is triggered by the survivor pension being
**reduced under s.58(2)**, not only by the base ceiling binding. The paraphrase
read agrees with that wording **[needs verbatim check]**.

Component definitions (P): s.46(1) retirement basic amount = 25% of average monthly
pensionable earnings + 8.33% of first additional monthly pensionable earnings
(s.48.1) + 33.33% of second additional monthly pensionable earnings (s.48.2).
Survivor-side deceased portions: s.58(3) (base, via s.57(2)), s.58(3.1)-(3.2)
(8.33% of first additional), s.58(3.4)-(3.5) (33.33% of second additional),
each adjusted by Pension Index ratios for listed trigger events.

## 2. Typed calculation contract (pseudocode, NOT for the live engine)

```ts
type CppComponent = "base" | "firstAdditional" | "secondAdditional";
type Amounts = Record<CppComponent, number>; // monthly, unrounded

interface CombinedInput {
  survivorAgeAtReduction: number;        // whole years; branch selection
  survivorBornAfter1932: boolean;
  survivorPensionStartYear: number;      // > 1997 for modern branch
  deceasedPortion: Amounts;              // s.58(3), (3.1), (3.4) incl. PI ratios
  survivorOwnUnadjusted: Amounts;        // s.46(1) portions, ignoring s.46(3)-(6), indexed s.45(2)
  baseCap: number;                       // 25% x 1/12 survivor MPE Average, later-of year, indexed
  piRetirementStartYear: number;         // for s.46(5) ratio
  piReductionYear: number;
}

// modern branch, s.58(2)(c)  [needs verbatim check of each term]
for c of components:
  A[c] = 0.60 * deceasedPortion[c]
  B[c] = min(0.40 * A[c], 0.40 * survivorOwnUnadjusted[c])
  part[c] = A[c] - B[c]
part.base = min(part.base, baseCap - survivorOwnUnadjusted.base)  // sign domain OPEN
survivorPension = sum(part)
reduction = sum(components: A - B) - survivorPension  // amount the cap removed; exact s.58(2) "reduction" meaning is OPEN
// s.46(5): early/late factor applies to (basic retirement amount - reduction) x PI(start)/PI(reductionYear)
```

Inputs the current CWC model does **not** have (all are blockers for implementation):
per-component deceased and survivor earnings measures (the engine has a single
pension figure), survivor MPE Average for the later-of year, separate PI-year
indexing per component, deceased "retirement pension payable in month of death",
the dates of the s.58(3)(a)-(e) trigger events, and rounding rules.

## 3. Independent test plan (shapes only; no expected dollars)

Cent-level expected values must come from Service Canada-confirmed cases or from
an independent derivation by a party other than the implementer. Until then these
rows are **missing official fixtures = blocker, not a pass**.

| Case | Purpose | Expected-value source |
|---|---|---|
| Own CPP at 60, 65, 70, deceased not collecting | s.46(5) triggered despite non-binding cap | missing official fixture |
| Cap binds / does not bind (base only) | base ceiling and component separation | derive from statute after verbatim check |
| Only first additional / both additional components | uncapped enhancement parts | derive after s.48.1/48.2/51 read |
| PI ratio != 1 (different start vs reduction years) | s.46(5) ratio direction and units | missing official fixture |
| Deceased collecting vs not collecting | s.58(3.2)/(3.5) index rule | missing official fixture |
| Survivor turns 65 | branch transition 4 -> 6 | missing official fixture |
| Rows 5, 7 and pre-1998 | assert gated/unsupported, never the modern branch | n/a (behaviour test only) |

Invented numbers (e.g. F1-F5, G1-G3 in #40) stay "illustrative, not approved".

## 4. Evidence ledger

| Claim | Label | Source |
|---|---|---|
| s.46(1) three-part basic amount (25% / 8.33% / 33.33%) | P | s.46(1) |
| s.46(5) applies when survivor pension is reduced under s.58(2); uses (basic amount - reduction) x PI(start year)/PI(reduction year) | P | s.46(5) |
| s.58(1.1) flat-rate benefit indexed by PI ratio; $91.06 for 1986 | P | s.58(1.1) |
| s.58(2) has branches (a)-(d) keyed on age 65, birth 1932/33 and pension start 1997/98 | P | s.58(2) |
| s.58(3.2)/(3.5): 8.33% and 33.33% portions with PI indexing | P | s.58(3.1)-(3.6) |
| Exact per-component A, B and base-cap wording in s.58(2)(c) | U | needs verbatim text |
| Whether base cap minus own base can be negative under a valid history | U | open since #40 |
| Rounding and PI computation | U | CPP Regulations s.62 not read |
| Meaning of "reduction" in s.46(5) as a number | U | needs verbatim text |
| Engine spec 4.4 labels old survivor logic "[ok]" and describes a pre-2019 under-35 no-benefit rule, contradicting the 2019+ statute row 1 | P/U | canonical spec vs s.58(1)(a.1); correction request below |

## 5. Source-based correction request (for future owner approval)

`docs/CANONICAL-ENGINE-SPECIFICATION-v1.2-FINAL.md` section 4.4 should be reviewed
against s.58(1)(a.1) (post-2018 rules) before CPP-5 work is accepted. This note
does not edit the canonical spec or any golden anchor.

## 6. Open questions / next verification target for Codex

1. Verbatim s.58(2)(c)(i)-(iii) and s.58(2)(a); confirm A, B and cap placement.
2. Negative cap-room feasibility (F4 hold from #40).
3. Verbatim s.46(5) and the numeric meaning of "reduction".
4. ss.45, 48.1, 48.2, 51, 57 and Regulations s.62 for indexing/rounding order.
5. OCA 32nd report (A.5.2, A.7, A.10, A.11) as corroboration only.

Codex target: redo the interpretation and arithmetic from the Justice Laws text,
not confirm tests. Only after that and separate owner authorization could an
engine PR be proposed.
