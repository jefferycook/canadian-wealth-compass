# BC 2026 low-income tax reduction ($575 / $690 / $805): source audit

**Status: DRAFT research, documentation only.** This file changes no engine code, tests, tax constants, golden or reference values, or `VERIFIED`/`APPROXIMATE` flags. An autonomous Claude session wrote it. It is **not** an independent second-party review, statutory approval or methodology approval. Every finding needs second-party review before anything relies on it.

- **Task:** `law-audit:bc-2026-lowincome`, queued in Issue #39 comment 6807485048.
- **Evidence anchors:** draft PR #49 at head `6543349dfe64c80696313b164644f5d296d7407f`; production `main` at `07d273b11d6b96dcec06921524aacdf6e1cc8b03`.
- **Session date:** 2026-11-11.

## 1. Answer

| Figure   | What it is                                                                                                                                                                                        | Use for                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **$690** | The statutory maximum of the BC tax reduction credit (BC _Income Tax Act_ s.4.301, as amended by S.B.C. 2026 c.5 s.38, effective **1 January 2026**). It applies to the whole 2026 taxation year. | **Final 2026 income-tax liability** (T1 / BC428). This is the figure for a planning engine. |
| $575     | The pre-Budget-2026 statutory base ($436), indexed to 2026. CRA used it for payroll from January to June 2026 (T4127 122nd ed.).                                                                  | Payroll withholding, Jan–Jun 2026 only. **Superseded** for liability.                       |
| $805     | CRA's prorated **payroll** amount for July–December 2026 (T4127 123rd ed., Option 1). It makes up for the six months withheld at $575: (575 + 805) / 2 = 690.                                     | Payroll withholding, Jul–Dec 2026 only. **Never** a liability figure.                       |

The same mechanism explains the BC lowest rate: the statutory rate is 5.60% for all of 2026, and the payroll rates are 5.06% (Jan–Jun) and 6.14% (Jul–Dec). (5.06 + 6.14) / 2 = 5.60.

**Final 2026 liability formula** (s.4.301 with s.4.52 indexation): reduction = max(0, $690 − 3.56% × max(0, net income − $25,570)). It is zero at net income ≥ **$44,952**. It is non-refundable and can be deducted only from BC tax remaining after the s.4.2(1)–(2) credits (s.4.2(3)).

## 2. Sources read in this session

| ID  | Source                                                                                                                   | Read?                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| L1  | BC _Income Tax Act_, R.S.B.C. 1996 c.215, consolidated text, BC Laws (`statreg/96215_01`), "current to November 3, 2026" | **Yes**, fetched directly (HTTP 200)                                                                                         |
| L2  | Same Act, Point-in-Time (`statreg/96215_pit`), showing the text of each provision before each amendment                  | **Yes**, fetched directly                                                                                                    |
| L3  | Same Act, Table of Legislative Changes, 4th ed. (`statreg/e4tlc96215`), covering Jan 1, 2024 to Nov 3, 2026              | **Yes**, fetched directly                                                                                                    |
| G1  | gov.bc.ca, _B.C. basic personal income tax credits_, last updated **April 20, 2026**                                     | **Yes**, fetched directly                                                                                                    |
| G2  | gov.bc.ca, _Personal income tax rates_, last updated **April 17, 2026**                                                  | **Yes**, fetched directly                                                                                                    |
| C1  | CRA T4127 _Payroll Deductions Formulas_, **122nd ed., effective January 1, 2026** (Rev. 26 (26/05))                      | **Yes**, via a fetch tool that summarizes pages (quotes below)                                                               |
| C2  | CRA T4127, **123rd ed., effective July 1, 2026** (Rev. 26 (26/06), date modified 2026-06-03)                             | **Yes**, via the same summarizing fetch tool                                                                                 |
| —   | S.B.C. 2026 c.5 (_Budget Measures Implementation Act, 2026_), annual-statute text                                        | **No.** No BC Laws annual-statute URL resolved. The amendment is evidenced by L2 and L3 together                             |
| —   | CRA T4032-BC (July 2026 tables)                                                                                          | **No.** The guessed URL returned 404. T4032 tables are computed from T4127 Option 1, so C2 is the controlling payroll source |

C1 and C2 quotes come through a model-summarizing fetch tool and must be re-read directly by a reviewer. BC Laws pages L1–L3 and gov.bc.ca G1–G2 were downloaded raw and searched locally.

## 3. Primary text

**L1, s.4.301 (current):** "there may be deducted the amount determined by the formula A − B where A is **$690**, and B is **3.56%** of the amount, if any, by which the individual's income for the year exceeds **$19 400**."

**L2, s.4.301 before amendment:** "…A is **$436**, and B is 3.56% … exceeds $19 400." The PIT note reads: "Section 4.301 BEFORE amended by **2026-5-38**, effective **January 1, 2026** [retro from **April 16, 2026** (Royal Assent)]."

**L3, changes in force:**

- s.4.1: am 2026-5-37, effective 1 Jan 2026 [retro from 16 Apr 2026 (RA)].
- s.4.301: am 2026-5-38, effective 1 Jan 2026 [retro from 16 Apr 2026 (RA)].
- s.4.52: am 2026-5-40, effective 1 Jan 2026 [retro]; am 2026-5-41, effective 16 Apr 2026 (RA).

**L1, s.4.52(4.24):** "For the purpose of computing the tax payable by an individual for the 2026 taxation year, each amount expressed in dollars in a relevant provision is to be adjusted in accordance with subsection (2), **except the amount of $690 referred to in section 4.301**." So in 2026, $690 is used as written, while the $19,400 threshold is still indexed.

**L1, s.4.52(4.25):** "For the … 2027 to 2030 taxation years, no amount expressed in dollars in a relevant provision is to be adjusted…" (except s.8.3(6), the renter's credit).

**L1/L2, s.4.1(1)(a):** now "5.6% of the taxable income". The PIT shows "5.06%" before amendment by 2026-5-37, effective 1 Jan 2026 [retro from 16 Apr 2026 (RA)]. s.4(1) defines the "appropriate percentage" (the credit rate) as the lowest s.4.1(1) rate, so the BC credit rate is also 5.6% for 2026.

**L1, s.4.2(3):** amounts under s.4.301 (among others) "may be deducted only … from … the amount of tax payable under sections 4.1 and 4.8 to 4.83 minus any amounts deducted under the provisions referred to in subsections (1) and (2)". In other words, the reduction comes after the personal and other non-refundable credits and cannot make tax negative.

**G1:** "For the 2026 tax year, the net income threshold has increased to **$25,570** and the reduction factor is 3.56%. Budget 2026 increased the annual B.C. tax reduction credit **from $575 to $690** for the 2026 to 2030 tax years." Table: 2026: $690 / $25,570 / 3.56% / max net income **$44,952**, "Yes, however Budget 2026 will pause indexation for tax years 2027 to 2030"; 2025: $562 / $25,020 / 3.56% / $40,807.

**G2:** 2026 brackets $0–$50,363 at **5.60%**, then 7.70% / 10.50% / 12.29% / 14.70% / 16.80% / 20.50%, with thresholds at 100,728 / 115,648 / 140,430 / 190,405 / 265,545.

**C1 (Jan 2026 payroll):** factor S. If A ≤ $25,570, S = lesser of T4 and **$575**. If $25,570 < A ≤ **$41,722**, S = lesser of T4 and $575 − (A − $25,570) × 3.56%. If A > $41,722, S = $0. Table 8.1 BC lowest V = **0.0506**; Table 8.2 S2 = 575; BPA 13,216.

**C2 (Jul 2026 payroll), as quoted by the fetch tool:**

- "On February 17, 2026, the Government of British Columbia announced a change to the lowest personal income tax rate … For 2026 and subsequent years, the lowest personal tax rate is increased from 5.06% to 5.60%." "…a prorated lowest personal income tax rate of **6.14%** will apply" for the remaining six months.
- "…for 2026 and subsequent years, the basic reduction is increased from $562 to $690. Since this amount was used for the first six months of the year, a prorated basic reduction amount of **$805** will apply for the remaining six months."
- Option 1 factor S: S = lesser of T4 and $805, phased out at 3.56% above $25,570, and S = $0 where A > **$44,952\***. Footnote: "This amount is used to ensure that the tax reduction credit is not provided to individuals whose net income exceeds the legislated maximum."
- Option 2 uses **$690**, not prorated, with the same $25,570 / $44,952.
- Table 8.1 BC V = 0.0614, 0.0770, …; KP 0, 786, 3,606, 5,676, 9,061, 13,059, 22,884. Table 8.2 S2 = 805; BPA 13,216.

## 4. Reconciliation of the discrepancies

1. **$575 vs $690.** $575 is s.4.301's old $436 base, indexed through s.4.52 to 2026. The CRA January edition used it because it predates Budget 2026 (tabled 17 Feb 2026; Royal Assent 16 Apr 2026). The amendment replaced the base with $690, effective 1 Jan 2026, and s.4.52(4.24) stops $690 from being indexed in 2026. **For 2026 liability, $690 applies to the whole year.** The $575 figure in G1 ("from $575 to $690") agrees.
2. **$690 vs $805.** $805 appears only in CRA payroll formulas (C2 Option 1) for July–December pay periods. It makes total annual withholding approximate a $690 annual reduction after six months at $575: (575 + 805) / 2 = 690 exactly. It is **not** in the statute or on gov.bc.ca as a liability amount.
3. **$562 in C2's wording.** C2 says the reduction "is increased from $562 to $690". $562 is the **2025** amount (G1). The amount CRA actually used in January–June 2026 payroll was $575 (C1), and the arithmetic only reconciles with 575: (562 + 805) / 2 = 683.5 ≠ 690. This is a wording inconsistency in C2, as quoted by the fetch tool. It does not affect liability. A reviewer should re-read C2 directly.
4. **Zero point $41,722 vs $44,952.** 25,570 + 575 / 0.0356 = 41,721.69, which C1 rounds to $41,722. 25,570 + 690 / 0.0356 = 44,952.02, which G1 and C2 give as $44,952. C2 Option 1 cuts the $805 formula to zero at $44,952, where the formula would still give 805 − 19,382 × 3.56% ≈ $115. That is a deliberate payroll cliff, per the C2 footnote, so that no one above the legislated maximum gets the credit through withholding.
5. **Threshold $25,570.** The statutory base is $19,400 (L1), indexed under s.4.52(2). The 2026 value $25,570 is stated consistently by C1, C2 and G1. **I did not recompute the s.4.52(2) indexation chain** from $19,400.

## 5. Final liability vs payroll withholding

| Aspect         | Final liability (s.4.301)                                  | Payroll (T4127 factor S)                                                            |
| -------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Maximum        | $690 (all of 2026)                                         | $575 (Jan–Jun), then $805 (Jul–Dec, Option 1) or $690 (Option 2)                    |
| Income measure | "income for the year": net income, per G1 "net income"     | A = **annualized taxable income from the pay period** (an estimate, not net income) |
| Ceiling        | Only BC tax left after the s.4.2(1)–(2) credits (s.4.2(3)) | Lesser of T4 and the formula                                                        |
| Zero point     | $44,952.02                                                 | $41,722 (Jan–Jun); $44,952 hard cutoff (Jul–Dec)                                    |
| Lowest rate    | 5.60%                                                      | 5.06% (Jan–Jun), 6.14% (Jul–Dec, Option 1)                                          |

A planning engine that computes annual liability must use the **left column**. Payroll figures only approximate liability across a full year of employment income, and they never apply to RRIF, CPP, OAS or investment income, which retirees mostly have.

## 6. Independent arithmetic (illustration only, not approved expected values)

These were computed in Python `Decimal` from the L1/G1 figures only, with no engine constant or output. They show the **reduction amount before the s.4.2(3) cap**, for a given net income. The payroll columns apply the C1/C2 formulas to an equal annual A for illustration. They are **not** payable amounts.

| Net income | Liability (690) | Payroll Jan–Jun (575) | Payroll Jul–Dec (805, Opt. 1) | Mean of payroll halves |
| ---------: | --------------: | --------------------: | ----------------------------: | ---------------------: |
|     20,000 |        690.0000 |              575.0000 |                      805.0000 |               690.0000 |
|     25,570 |        690.0000 |              575.0000 |                      805.0000 |               690.0000 |
|     30,000 |        532.2920 |              417.2920 |                      647.2920 |               532.2920 |
|     35,000 |        354.2920 |              239.2920 |                      469.2920 |               354.2920 |
|     40,000 |        176.2920 |               61.2920 |                      291.2920 |               176.2920 |
|     41,722 |        114.9888 |                     0 |                      229.9888 |               114.9944 |
|     44,952 |          0.0008 |                     0 |                      115.0008 |                57.5004 |
|     44,953 |               0 |                     0 |                             0 |                      0 |
|     60,000 |               0 |                     0 |                             0 |                      0 |

Arithmetic, for example at 30,000: 30,000 − 25,570 = 4,430, and 4,430 × 0.0356 = 157.708, so the reduction is 690 − 157.708 = 532.292. The mean of the two payroll halves equals the liability up to $41,722. Between $41,722 and $44,952 it diverges, because of the January zero point and the July cliff.

**Unresolved rounding question:** CRA and G1 present a $44,952 maximum. The statute gives no rounding rule for B, so at 44,952 exactly the formula leaves $0.0008. Whether the BC428 form rounds this to $0 is not verified (the form was not read).

## 7. Overlap with draft PR #49 and existing docs

- **PR #49 (head `6543349`)** tests BC at taxable income 60,000 and 120,000. Under every reading ($575, $690 or $805), the reduction is **$0** at both points (> $44,952). **The #49 expected values are unaffected.** #49 does not exercise the reduction, so this is a coverage gap, not a discrepancy.
- **PR #49's 5.6% lowest rate is supported by the enacted statute.** s.4.1(1)(a) was amended from 5.06% to 5.6% by S.B.C. 2026 c.5 s.37, effective 1 Jan 2026 (L2, L3). This answers open gap 1 in Issue #39 comment 6805210072 ("Check the BC 5.60% enactment against the S.B.C. 2026 c.5 text"). It does so through the official consolidation, PIT and TLC, **not** the annual-statute text itself. The payroll rates 5.06% and 6.14% are not liability rates.
- **Stale figures in existing docs (not edited here):** `docs/ENGINE-CORRECTNESS-BACKLOG.md` CR-1 and `docs/CANONICAL-ENGINE-SPECIFICATION-v1.2-FINAL.md` §13.3a and §14.3 describe the BC reduction as "up to $575 … zero at $41,722", sourced from CRA T4032-BC. Those are **January 2026 payroll** figures. For 2026 liability, the figures are $690 / $25,570 / 3.56% / $44,952. The fix is a documentation correction for a separately reviewed change. Because the reduction is still unmodelled (CR-1 [G]), the engine's understatement of the reduction is up to **$690**, not $575, per 2026 year for a low-income BC filer.
- The engine (`main` 07d273b) has no field for the reduction. Nothing in this audit changes `taxYears.ts`, `tax.ts` or any test.

## 8. Open questions for an independent reviewer

1. Re-read C1 and C2 directly. The quotes came through a summarizing fetch tool. Confirm the "$562" wording in C2.
2. Read the S.B.C. 2026 c.5 annual-statute text for ss.37, 38, 40 and 41 to confirm L2/L3 directly.
3. Recompute the 2026 indexed threshold $25,570 from the $19,400 base using s.4.52(2).
4. **2031 and later:** s.4.52(4.24) excludes $690 from indexation only for 2026, and (4.25) freezes all amounts for 2027–2030. Whether $690 indexes from 2031 (and from what base) needs a reading of s.4.52(2) as amended. G1 says indexation resumes in 2031.
5. Confirm the BC428 line order and rounding (cap under s.4.2(3); the $0.0008 residual at $44,952).
6. Confirm that "income for the year" in s.4.301 means federal net income (line 23600) for a BC resident, including split-pension effects. G1 says "net income".

## 9. Suggested follow-ups (each needs separate authorization)

- Correct the $575/$41,722 references in the backlog CR-1 and spec §13.3a/§14.3 to the 2026 liability figures. This is a documentation-only change.
- When CR-1 is authorized, add hand-derived benchmark fixtures at net incomes 20,000 / 30,000 / 40,000 / 44,952 / 44,953. They must include a case where the reduction exceeds the remaining BC tax, to test the s.4.2(3) cap.
