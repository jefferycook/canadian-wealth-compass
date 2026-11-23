# Ontario 2026: tax reduction, LIFT credit and Ontario Health Premium — source audit

**Status: DRAFT research, documentation only.** This file changes no engine code, tests, tax constants, golden or reference values, or `VERIFIED`/`APPROXIMATE` flags. An autonomous Claude session wrote it. It is **not** an independent second-party review, statutory approval or methodology approval. Every finding needs second-party review before anything relies on it.

- **Task:** `law-audit:on-lift-2026`, queued in Issue #39 comment 6807487352.
- **Evidence anchors:** draft PR #48 at head `38fe8725f7da6b8bd25a0fa5335de37d971df8a2`; production `main` at `07d273b11d6b96dcec06921524aacdf6e1cc8b03`.
- **Session date:** 2026-11-11/12 (UTC).

## 1. Summary

| Item                                          | Finding                                                                                                                                                                                                                                                                                                                                                         | Confidence                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **OHP schedule (PR #48)**                     | All 18 PR #48 expected values agree with the CRA 2025 ON428 health-premium chart (C2) and the CRA T4032ON 2026 formula (C1). The schedule is the same in both years.                                                                                                                                                                                            | High for the schedule (two dated CRA sources). The **statute was not read**.                                |
| **PR #48 statutory citation**                 | PR #48 cites "Taxation Act, 2007 (Ontario) s.24(2)". **Not verified.** e-Laws did not return statute text to this session's fetch tools. One search-result snippet places the premium in "Division C — Ontario Health Premium" and "s.25" (also unverified).                                                                                                    | Citation unconfirmed; treat as possibly wrong.                                                              |
| **PR #48 docstring wording**                  | It says "Assumes combined income equals the supplied income". The OHP base is the individual's **taxable income (T1 line 26000)** (C2, C3). There is no "combined income" in the OHP test.                                                                                                                                                                      | Wording issue only. Values unaffected.                                                                      |
| **Ontario tax reduction**                     | It is **not modelled** by the engine (backlog CR-1). The mechanism is **not** "equivalent" to BC's income-based phase-out, as CR-1 states. Ontario's reduction is `2 × (basic + dependant amounts) − Ontario tax`, phased out dollar-for-dollar against **tax**, not income.                                                                                    | High for the 2025 form (C2). The 2026 amounts conflict (see §4).                                            |
| **LIFT credit**                               | It is **not modelled**. 2022+ parameters: min($875, 5.05% × employment income), less 5% of the greater of (ANI − $32,500) or (AFNI − $65,000). It needs employment income, is non-refundable, and **does not reduce the OHP**.                                                                                                                                  | High (C2, C4, G1, G2). No 2026 change found.                                                                |
| **OHP interaction**                           | On ON428 the OHP is added at line 89, **after** the tax reduction (line 80), LIFT (line 85) and the food-donation credit (line 87). None of them can reduce the OHP. The engine adds the OHP outside `provTax`, after the surtax, which agrees structurally.                                                                                                    | High (C2 line order).                                                                                       |
| **NEW — surtax vs dividend tax credit order** | ON428 computes the Ontario surtax on tax **before** the Ontario dividend tax credit (lines 63–68), then subtracts the DTC (line 70). `computeTax` subtracts the provincial DTC **before** computing the surtax (`tax.ts` lines 143–147). For an Ontario filer with eligible dividends and basic tax above $5,818 (2026), the engine **understates** the surtax. | High for the form order (C2, read raw). The engine impact is not quantified here. Needs independent review. |

## 2. Sources read in this session

| ID  | Source                                                                                                                                                 | Read?                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | CRA T4032ON _Payroll Deductions Tables — Ontario_, "Effective January 1, 2026", general-information page (page details 2025-12-17), English and French | **Yes**, via a fetch tool that summarizes pages. The EN and FR pages were read separately.                                                                                                              |
| C2  | CRA Form ON428 (5006-C), **2025**, e-text `5006-c-25e.txt`                                                                                             | **Yes**. The raw text was saved locally and the quoted lines were grepped verbatim.                                                                                                                     |
| C3  | CRA "Ontario tax information for 2025" (5006-PC) HTML                                                                                                  | **Yes**, via the summarizing fetch tool                                                                                                                                                                 |
| C4  | CRA Schedule ON428-A (5006-A), **2025**, e-text `5006-a-25e.txt`                                                                                       | **Yes**. The raw text was saved locally and the quoted lines were grepped verbatim.                                                                                                                     |
| G1  | ontario.ca, _Low-Income Workers Tax Credit_ (also known as LIFT), updated **July 15, 2026**                                                            | **Yes**, via the summarizing fetch tool                                                                                                                                                                 |
| G2  | budget.ontario.ca, _2025 Fall Economic Statement — provisions_                                                                                         | **Yes**, via the summarizing fetch tool                                                                                                                                                                 |
| G3  | budget.ontario.ca, _2026 Budget Annex_                                                                                                                 | **Yes**, via the summarizing fetch tool. It contains no LIFT, tax-reduction or OHP change.                                                                                                              |
| —   | _Taxation Act, 2007_, S.O. 2007 c.11 Sch. A (e-Laws `statute/07t11`)                                                                                   | **No.** The page is rendered by script, and every fetch returned only the page title. A raw download was not attempted after one direct CRA download was blocked by the environment's bot-check policy. |
| —   | CRA 2026 ON428 / ON428-A                                                                                                                               | **No.** Not yet published. 2026 tax-year forms normally appear in January of the following year.                                                                                                        |

## 3. Primary text (as read)

**C2 (2025 ON428), Part C, in order (verbatim excerpts from raw text):**

- Line 53: "Line 51 minus line 52" (Ontario tax on taxable income minus non-refundable credits). Line 55 adds split-income tax. Line 61 is line 55 minus the minimum-tax carryover.
- Lines 63–68: Ontario surtax on line 65 (line 61 less split-income tax): "(Line 65 minus $5,710) multiplied by 20%" plus "(Line 65 minus $7,307) multiplied by 36%".
- Line 69: "Line 62 plus line 68". Line 70: "Ontario dividend tax credit from line 57". Line 71: "Line 69 minus line 70".
- Line 73: line 71 plus the additional tax for minimum tax purposes.
- Line 74: "Basic reduction 294.00". Lines 75–76: "multiplied by $544" per dependent child (born 2007 or later) and per dependant with an impairment. Line 78: line 77 "multiplied by 2". Line 80: "Line 78 minus line 79", where line 79 is line 73. Line 81: line 73 minus line 80.
- Line 85 / 62140: "Low-income individuals and families tax (LIFT) credit (complete Schedule ON428-A)". Line 86: "Line 84 minus line 85 (if negative, enter "0")".
- Line 89: the health premium chart on taxable income. Line 90: "Line 88 plus line 89 … Ontario tax", entered on T1 line 42800.
- The health premium chart has 11 rows: ≤$20,000 → $0; to $25,000 → 6% over $20,000; to $36,000 → $300; to $38,500 → $300 + 6% over $36,000; to $48,000 → $450; to $48,600 → $450 + 25% over $48,000; to $72,000 → $600; to $72,600 → $600 + 25% over $72,000; to $200,000 → $750; to $200,600 → $750 + 25% over $200,000; above → $900.

**C4 (2025 ON428-A), verbatim line text:**

- Lines 1–5: line 10100 plus line 10400 (employment income), "Applicable rate 5.05%", "(maximum $875)".
- Lines 6–13, adjusted net income: line 23600, **plus** line 21300 (UCCB repayment) and the RDSP repayment in line 23200, **minus** line 11700 (UCCB) and the RDSP income in line 12500.
- Single filer: "Individual income threshold 32,500.00", "Applicable rate 5%", result to line 62140.
- With a spouse: the greater of (own ANI − 32,500) or (own ANI + spouse ANI − "65,0000.00") × 5%. The family threshold is printed with a typographical extra zero. It is read as $65,000, consistent with G1 and G2.

**C1 (T4032ON, January 2026), as relayed by the fetch tool (EN and FR agree):**

- Tax reduction: "Basic personal amount $300"; each dependant under 18: **$575**; each dependant with a disability: **$575**. "The reduction is equal to twice the individual's personal amounts minus the provincial tax payable before reduction."
- "The indexing factor for January 1, 2026, is 1.9%."
- The health premium formula matches C2 row for row. Surtax thresholds are $5,818 and $7,446, matching `taxYears.ts` 2026 ON.

**G1 (ontario.ca, updated 2026-07-15):** For 2022 onward: "$875 or 5.05% of your employment income, whichever is lower", reduced by 5% of the greater of ANI over $32,500 or AFNI over $65,000. Eligibility requires ANI below $50,000 and AFNI below $82,500, employment income, and Ontario tax owing. The credit reduces "Ontario personal income tax, excluding the Ontario Health Premium". No 2025 or 2026 change is listed.

## 4. Discrepancy: 2026 Ontario tax-reduction dependant amount

- 2025 (C2, G2): basic $294, dependant $544.
- Indexed with the 1.9% factor (C1): 294 × 1.019 = 299.586 → **$300** (matches C1). 544 × 1.019 = 554.336 → **$554**.
- C1 prints **$575** for each dependant amount, in both the English and French pages as relayed. $575 is also BC's January-2026 payroll reduction maximum (see PR #71), which raises the possibility of a CRA page error, or a summarizer artifact repeated twice. Neither is established.
- No Ontario source found in this session announces a non-indexed change to the dependant amount. G3 (2026 Budget annex) lists no change.
- **Unresolved.** A reviewer must read the raw C1 page and, when it is published, the 2026 ON428 line 75. Until then, a 2026 dependant amount must not be adopted. The basic $300 is supported by both C1 and the indexation arithmetic.
- **Indexation of LIFT:** G1, G2 and C4 all use $875 / $32,500 / $65,000 unchanged since 2022, which is consistent with the credit not being indexed. No statutory text was read to confirm that it is non-indexed.

## 5. Engine comparison (`main` 07d273b, read only)

- `ontarioHealthPremium(inc)` (`src/lib/planning/tax.ts:65`) uses nested `min(…)` caps that reproduce the 11-row chart. It is called with `taxable` (after the RRSP deduction), which agrees with C2/C3 "taxable income on line 26000".
- The OHP is added to `tax` outside `provTax`, so it is not surtaxed and not reduced by credits. This is structurally consistent with C2.
- **No Ontario tax reduction** and **no LIFT** in `ProvinceTax` or `computeTax`, so the engine overstates Ontario tax for low-income filers (CR-1 [G], conservative).
- **Surtax/DTC order (new):** `tax.ts:143` does `provTax -= grossedDiv × divCredit`, and then `tax.ts:147` computes the surtax on the reduced `provTax`. C2 computes the surtax on line 65, which excludes the DTC, and subtracts the DTC at line 70. For a filer with eligible dividends whose Ontario basic tax exceeds $5,818 (2026), the engine's surtax is lower than ON428's by up to 56% of the DTC above the thresholds. I did **not** quantify payable amounts. I did **not** check whether the federal or BC/AB paths have an analogous ordering question. This needs independent review **before** any engine change. Engine changes are out of scope for this task.
- Backlog CR-1 says "Ontario has an equivalent provision" to BC's income phase-out. That is inaccurate in mechanism. Ontario's phase-out is against tax (line 73), not net income. CR-1 is not edited here.

## 6. PR #48 coverage review

The PR #48 head was checked out file-only onto `main` 07d273b and run: `vitest run src/lib/planning/benchmark-ohp.test.ts` gave **18 passed**. Every expected value was re-derived in Python `Decimal` from the C2 chart (§7). All 18 agree.

**Gaps (none of them is a wrong value):**

1. **Citation.** "s.24(2)" is unverified. Replace it with the CRA C2/C1 references, or confirm the section against e-Laws.
2. **Docstring.** "combined income" should read "taxable income (T1 line 26000)".
3. **Missing boundary fixtures.** Add the first dollar above each flat band (36,001; 48,001; 72,001; 200,001) and the first dollar past each cap (25,001; 38,501; 48,601; 72,601; 200,601). Add a sub-dollar point at 20,000.01, which gives 0.0006 and therefore needs a tolerance tighter than `toBeCloseTo(…, 2)` to be distinguishable from 0.
4. **No `computeTax`-level OHP test.** Nothing confirms that the OHP is (a) on taxable income after the RRSP deduction, (b) excluded from the surtax base, (c) zero for non-ON provinces, or (d) unaffected by credits. Those are wiring tests, not value tests.
5. **Out of scope for #48:** no LIFT or tax-reduction fixtures are possible until the engine models them (CR-1).

## 7. Independent arithmetic (illustration only, not approved expected values)

Computed in Python `Decimal` from C2/C4/G1 parameters only, with no engine constant or output. These are **component values**, not payable amounts.

**OHP at boundary points** (C2 chart):

| Taxable income |    OHP |     | Taxable income |    OHP |
| -------------: | -----: | --- | -------------: | -----: |
|         20,000 |      0 |     |         48,001 | 450.25 |
|      20,000.01 | 0.0006 |     |         48,600 | 600.00 |
|         25,000 | 300.00 |     |         48,601 |    600 |
|         25,001 |    300 |     |         72,001 | 600.25 |
|         36,001 | 300.06 |     |         72,601 |    750 |
|         38,500 | 450.00 |     |        200,001 | 750.25 |
|         38,501 |    450 |     |        200,601 |    900 |

**LIFT before the line-86 cap** (C4 formula; S = spouse ANI):

| Employment income |   Own ANI | Spouse ANI |       LIFT | Note                                                       |
| ----------------: | --------: | ---------: | ---------: | ---------------------------------------------------------- |
|            10,000 |    10,000 |          — |     505.00 | 5.05% leg binds                                            |
|         17,326.73 | 17,326.73 |          — | 874.999865 | just under the $875 cap point (875 / 0.0505 = 17,326.7327) |
|            30,000 |    32,500 |          — |     875.00 | at the individual threshold                                |
|            30,000 |    40,000 |          — |     500.00 | 875 − 5% × 7,500                                           |
|            30,000 |    50,000 |          — |          0 | zero point = 32,500 + 875 / 0.05                           |
|            30,000 |    30,000 |     40,000 |     625.00 | family leg: 875 − 5% × 5,000                               |
|            30,000 |    30,000 |     52,500 |          0 | AFNI 82,500                                                |
|            30,000 |    40,000 |     30,000 |     500.00 | individual leg (7,500) beats family leg (5,000)            |
|                 0 |    20,000 |          — |          0 | no employment income (e.g. a retiree)                      |

**Ontario tax reduction: line-73 tax at which the reduction reaches zero** (= 2 × amounts):

| Amount set                               | 0 dependants |     1 |     2 |
| ---------------------------------------- | -----------: | ----: | ----: |
| 2025 ON428 ($294 / $544)                 |          588 | 1,676 | 2,764 |
| 2026 indexed by arithmetic ($300 / $554) |          600 | 1,708 | 2,816 |
| 2026 as relayed from C1 ($300 / $575)    |          600 | 1,750 | 2,900 |

## 8. Open questions for an independent reviewer

1. Read _Taxation Act, 2007_ directly. Confirm the section numbers and text for the health premium, the tax reduction (and its indexation), and LIFT (and whether it is non-indexed). Check PR #48's "s.24(2)".
2. Resolve the 2026 dependant amount, $575 versus $554 (§4), from the raw C1 page or the 2026 ON428.
3. Confirm the surtax-before-DTC ordering against the statute, quantify the engine understatement, and decide whether it warrants a backlog entry. The proposed severity is to be set by the reviewer.
4. Confirm that ANI for LIFT includes the effects of pension-income splitting (line 21000 deduction / line 11600 inclusion flow through line 23600).
5. Confirm whether the tax reduction is computed per spouse with dependant amounts claimable only by the higher-net-income spouse (C2 note), for future household modelling.

## 9. Suggested follow-ups (each needs separate authorization)

- PR #48: correct the citation and docstring, and add the §6 boundary points. Under the single-commit rule this needs a replacement PR. No expected-value change is needed.
- Add a backlog entry for the surtax/DTC ordering after independent review.
- Correct CR-1's "equivalent provision" wording (documentation only).
- When CR-1 is authorized, add Ontario tax-reduction and LIFT fixtures using §7, including a case where LIFT exceeds the remaining Ontario tax while the OHP stays payable.
