# CPP-5 survivor / own-retirement evidence matrix (DRAFT, research only)

Plan `finance-nov9-2026-v1`, task `fin-cpp5-evidence-v1`. **Docs only.** No engine,
golden, reference payment, or VERIFIED-flag change. No amount below is approved;
nothing here authorizes executable integration of any CPP survivor logic.

## 0. Sources and read dates

Statutory text re-read directly from Justice Laws HTML on 2026-11-09 (tags stripped,
text quoted from that output). Pages state "current to 2026-10-19".

| Source | URL | Currency |
|---|---|---|
| CPP Act s.45 | https://laws-lois.justice.gc.ca/eng/acts/C-8/section-45.html | current to 2026-10-19 |
| CPP Act s.46 | https://laws-lois.justice.gc.ca/eng/acts/C-8/section-46.html | current to 2026-10-19; last amended 2024-12 |
| CPP Act s.58 | https://laws-lois.justice.gc.ca/eng/acts/C-8/section-58.html | current to 2026-10-19 |
| CPP Regs (C.R.C., c.385) s.62 | https://laws-lois.justice.gc.ca/eng/regulations/C.R.C.,_c._385/section-62.html | current to 2026-10-19; last amended 2026-01-01 |
| Independent cross-check | Issue #39 comment 6645288201 (2026-11-04) | text interpretation only |
| Draft PRs compared | #57 (experimental survivor prototype, head d94d159), #62 (Reg 62 indexing, head f55171b), plus docs #40/#52/#53 | drafts, not evidence of law |

Not read in this pass: ss.43, 48.1, 48.2, 51, 57, 58(1)-(1.1), 58(3)-(3.6), Reg s.75
(Pension Index), the Maximum Pensionable Earnings Average definition, OCA reports.

## 1. Verified wording (text only, not payable outcomes)

Labels: **V** = verbatim read this session and matches the #39 independent check;
**V\*** = verbatim read, but reading/scope needs qualification; **U** = unresolved.

| # | Item | Status | Wording / finding |
|---|---|---|---|
| 1 | s.46(5) trigger | V | Applies "if a person receives a retirement pension under this Act and a survivor's pension under this Act and the survivor's pension is at any time reduced from its full amount under subsection 58(2)". Opens with "Unless otherwise provided by an agreement under section 80". |
| 2 | s.46(5) what is restricted | V | Only a **downward** "adjustment factor resulting from the application of subsection (3), (3.1) or (4)". It applies "not … to the whole of the basic monthly amount … but only to the amount remaining when that basic monthly amount is reduced by" (a) × (b). |
| 3 | s.46(5)(b) ratio direction | V | "the Pension Index for the year in which the retirement pension first commenced to be payable **bears to** the Pension Index for the year in which the survivor's pension is reduced" = PI(own-retirement first-payable year) / PI(reduction year). With PI non-decreasing (s.43(2), not re-read here) this is ≤ 1. |
| 4 | s.46(5)(a) | V\* | "the amount by which the survivor's pension has been reduced" (no stated valuation date or whether the amount is as at the reduction month). See §3-A. |
| 5 | s.46(4) | V | `[(F1×P1)+(F2×E)]/P2`, F2 = lesser of hypothetical later-commencement factor and 1. Earnings-division *increase*; not the s.46(5) mechanism. |
| 6 | s.58(2)(a) | V | Under 65, own retirement pension commencing **after 1997-12-31**: flat-rate benefit (s.58(1.1)) (or greater of flat-rate and post-retirement disability benefit) + base term + first-additional term + second-additional term. Each term `C − D`, C = 37.5% of the contributor's portion (s.58(3), (3.1), (3.4)), D = lesser of 40% of C and 40% of the survivor's own portion. Base term additionally capped (lesser-of) by the 25%-of-1/12-MPEA-average room. |
| 7 | s.58(2)(b) | V | Under 65, own pension commencing **before 1998-01-01**: flat-rate + lesser of 37.5% of contributor's portion and the cap room (average of YMPE for the later year and two preceding years, not the "Maximum Pensionable Earnings Average" wording used in (a)/(c)). No 40% offset. |
| 8 | s.58(2)(c) | V | 65+, born **after 1932-12-31**, own pension commencing **after 1997-12-31**: base `A−B` capped by cap room; first-additional `A−B`; second-additional `A−B`; A = 60% of contributor's portion, B = lesser of 40% of A and 40% of survivor's own portion. |
| 9 | s.58(2)(d) | V | Residual: lesser of 60% of contributor's base portion and cap room, plus 60% of the first- and second-additional portions. **No B offset on the additional components, no B offset on the base** (the base is only capped). |
| 10 | "Without regard to" wording | V\* | Base own-portion: "without regard to subsections 46(3) to (6)" (paras (a)(i)(B), (b), (c)(i), (d)(i)); additional own-portions: "without regard to subsections **46(3.1)** to (6)" ((a)(ii)/(iii), (c)(ii)/(iii)). Not a uniform "46(3) to (6)" in every term. Every own-portion is also "adjusted in accordance with subsection 45(2)". |
| 11 | Branch selector | V | Selector is the **own retirement pension commencement** (and age 65 / birth date), not survivor-pension start. Survivor qualification date matters only inside the cap-year ("later of …"). |
| 12 | Reg 62 scope | V\* | Reg 62(1) begins "When the basic monthly amount of a benefit is adjusted annually **pursuant to subsection 45(2) of the Act**" and reaches only (a) the product of the s.45(2)(a) amount and the s.45(2)(b) ratio (nearest cent, third digit rule, 62(2)) and (b) "any quotient obtained from the ratio referred to in paragraph 45(2)(b)" (62(3)). It does **not** say it governs the s.58(3) event-year ratio, the s.46(5)(b) ratio, or s.58 intermediate products (60%, 40%, min). |
| 13 | Reg 62(3) digits | V\* | For a quotient "that contains a fraction that is less than one", expressed to **four** digits after the decimal point; 4th digit ≥5 raises the 3rd digit by one; 4th dropped. Net effect is a three-decimal ratio (#62 and #57 agree). Literal "fraction less than one" is naturally read as the fractional part (e.g. 1.0234 → 1.023), but this is an interpretive reading unconfirmed against published ratios. |
| 14 | s.45(2) timing | V | Adjustment produces the amount "for a month in any following year": year of first payability is not itself rounded by Reg 62. |

## 2. Draft-PR comparison

| Topic | #57 (prototype) | #62 (Reg 62 chain) | Assessment |
|---|---|---|---|
| s.58(2)(c) base/additional split, B = min(.4A, .4R) | implemented (L10) | n/a | Matches row 8. |
| s.58(2)(a), (b), (d) | fail-closed | n/a | Correct caution; wording now in rows 6, 7, 9. |
| s.46(5) reduction | candidate `reductionFromFull` = full − actual | n/a | Counterfactual unproven (§3-A). |
| PI ratio direction | PI(own first payable)/PI(reduction yr), null if unknown | n/a | Matches row 3. |
| Reg 62(3) three-decimal ratio | unity-index only otherwise fail-closed | implemented | Consistent with row 13; scope caveat row 12. |
| Cent rounding of non-indexing quantities | fails closed if any component has sub-cent fraction (L22/L26) | not addressed | **#57 L26 states Reg 62 rounds "even when the ratio is 1" and extends the concern to deceased portions, A, B, cap.** Reg 62 text reaches only the s.45(2) product (row 12, 14); the extension is a conservative guard, not a statutory finding. Fail-closed is correct either way. |
| Output labelling | UNROUNDED basic monthly amount, ledger tagged DERIVED/ILLUSTRATIVE | STATUTORY_TEXT basis | #62's `basis: "STATUTORY_TEXT"` should not be read as "verified against Service Canada"; only #62's Reg 62 reading is text-supported. |

## 3. Unresolved (must remain fail-closed; no value approved)

**A. "Full amount" counterfactual (s.46(5)).** Text says "reduced from its full amount under subsection 58(2)". Candidates: (i) the s.58(1)(b)-type amount (60% of the sum of portions, i.e. Σ A_c); (ii) the amount before the base cap trim (Σ(A_c − B_c)); (iii) the amount without the s.58(2) own-pension interaction at all. They give different `(a)`: with A=360, B=144, cap non-binding, (i)=144, (ii)=0. Whether (a) is measured in dollars as at the reduction month or at another date is also unstated. Needs authoritative interpretation (Service Canada policy, tribunal/FCA decision, or an official worked example). *Not resolvable from statute alone.*

**B. Negative or zero remainder.** s.46(5): own basic amount "reduced by" (a)×(b) leaves "the amount remaining". No floor is stated; neither a rule for remainder ≤ 0 nor an interaction with a valid benefit history was found. Separately, cap term (c)(i)(B)(II) = capRoom − R_base has no stated floor ("an amount that, when added to … is equal to …"). Fail closed; no `max(0, ·)` without authority.

**C. Rounding order.** Reg 62 fixes rounding only of s.45(2) annual products and the s.45(2)(b) quotient. Unknown: whether portions, A, B, caps, the s.58(3) event-year product, the s.46(5) product, and the final survivor pension are rounded, in what order, and whether per component or on the total.

**D. s.58(3) event rebasing and s.45(2) interaction.** Whether the event-year ratio is a s.45(2) "ratio" within Reg 62(1)(b) (hence 3-decimal) is not stated; the telescoped endpoint ratio (#57 L05) differs from year-by-year rounding by cents (#57's own 1000×1.1×1.136 example).

**E. Age and timing.** "has reached sixty-five years of age" measured at which month; interplay with payment-start rules (ss.67, 72) not read.

**F. Provincial plan / s.80 agreements.** Branch lead-ins cover "retirement pension under this Act or under a provincial pension plan"; s.46(5) is expressly subject to s.80 agreements. QPP cases unsupported.

**G. Flat-rate benefit and post-retirement disability benefit** (branches (a)/(b)): s.58(1.1) not read; flat-rate indexing unverified.

## 4. Fixtures needed before any approval

No real Service Canada individual payment amounts exist in the repository or Issue #39. Required before moving any item to VERIFIED:

1. At least one official Service Canada / My Service Canada statement (or published worked example) per branch (a), (b), (c), (d), showing own CPP, survivor CPP and combined amount, with commencement dates, birth year, deceased portions, and the PI series used.
2. A case where the 40% offset binds without the base cap, a case where the cap binds, and a case in which s.46(5) applies (a downward adjustment factor on early/late commencement with a reduced survivor pension).
3. A case with indexing across ≥3 years including a non-unit PI ratio, to test Reg 62 rounding and the s.58(3) path.
4. Independent (non-author) arithmetic of each fixture from statute, kept separate from engine constants.

Until then: hypothetical amounts remain labelled ILLUSTRATIVE, `benefits.ts` is unchanged, CPP-5 stays OPEN.

## 5. Next safe tasks

- Locate published Service Canada guidance or a decision that interprets "full amount" in s.46(5) (§3-A).
- Read Act s.43, 58(1.1), 58(3)-(3.6) and Reg s.75 verbatim to close §3-D and §3-G.
- Owner decision on whether fail-closed `UNVERIFIED_RULE` is acceptable product behaviour for unresolved branches.
