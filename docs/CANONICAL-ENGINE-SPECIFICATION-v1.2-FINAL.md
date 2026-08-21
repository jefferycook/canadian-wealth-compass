# Canonical Financial Planning Engine Specification
### Canadian Retirement, Tax & Decumulation Engine — **v1.2 FINAL (implementation specification)**

> **Document revision — v1.2 FINAL + Errata 1–4.** Erratum 1 (bridge benefits) · Erratum 2 (opening-year room semantics) · Erratum 3 (spousal-RRSP scope) · Erratum 4 (Saskatchewan scope + component-level rule status). Synced to the Lovable project 2026-08-21. **If you are implementing from this document, confirm it contains "Erratum 4" and "§13.2a" — an older copy will misdirect Batch 0C.**


**Status: FINAL.** This document supersedes v1.0 and v1.1 and is the specification handed to the development team. No further audit round is recommended; the open items below are *implementation* work, not further investigation.

**Author role:** Senior Canadian financial-planning software architect & financial-calculation auditor.
**Scope:** Audits two codebases and specifies the target production engine. Contains **no application code** by design.

**Codebases reviewed**

- **Original prototype** — single-file HTML/JS (`retirement-planner.html`, v4.0), DOM-driven, verified 2026 constants, regression-locked at single-filer lifetime tax **$276,326**.
- **Lovable rebuild** — `canadian-wealth-compass` (React/TypeScript/Supabase). Faithful port of the original engine into typed, testable, persistable modules (`src/lib/planning/*`) plus auth, saved plans, scenarios, a CPP/OAS estimator, and 53 Vitest tests reproducing the same $276,326 figure.

**Verdict unchanged from v1.0/v1.1:** Lovable is the better *software*; it is not more *financially correct*, because it ported the original's methodology verbatim — including its errors. Keep Lovable's architecture; replace the methodology per this document.

---

## Revision history

| Version | Change |
|---|---|
| v1.0 | Initial audit + specification. |
| v1.1 | Corrected the pension-splitting **double-50% cap** (search reached only 25% of eligible pension) to **[C]**; stated province-table coverage precisely (ON/BC/AB/CUSTOM only; other keys **throw**); added Appendix B second-pass verification of every `[ok]`. |
| **v1.2 FINAL + Erratum 4 (SK scope + status granularity)** | Batch 0C scope consistency only, no methodology change. **4A — Option A adopted:** Saskatchewan stays **`UNSUPPORTED`**; `PRRIF` is built for Manitoba, no SK behaviour is implemented, and the MB/SK PRRIF test is split. **4B — status is component-level**, gated at the point of use (resolves Quebec's mixed verified/approximate rules). See §13.2a and the corrected Batch 0C rows. |
| **v1.2 FINAL + Erratum 3 (spousal-RRSP scope)** | Scope consistency only, no methodology change. §2.7 defers spousal RRSPs while §2.6/Batch 0B required a younger-spouse contribution test — irreconcilable. **Ruled Option A: spousal RRSPs are fully deferred.** Batch 0B models only `contributor === owner`; post-71 room accrues but stays dormant with a disclosure. See §2.6 item 4 and the corrected year-71 tests. |
| **v1.2 FINAL + Erratum 2 (opening-year room semantics)** | Narrow Batch 0B input-contract correction, no audit, no other methodology change. v1.2 as issued had no plan-start-year special case, so a literal implementation would **double-count opening contribution room** (the UI's "room available" already includes the current year's statutory accrual), and it conflated RRSP **contribution room** with **deduction limit**. **Verified against CRA and corrected.** See §2.6 Erratum 2 for the rulings and the exact ledger formulas. |
| **v1.2 FINAL + Erratum 1 (bridge benefits)** | Narrow correction, no audit, no other methodology change. v1.2 as issued said `pensionEligible = RPP lifetime pension + bridge + (age ≥ 65 ? rrifEligibleCash : 0)` while simultaneously stating that only RPP **lifetime** pension qualifies under 65 — an internal contradiction. **Verified against CRA and corrected: `bridgeInc` is removed from `pensionEligible` by default.** See §1.5 Erratum 1 and the amended Batch 0A. |
| **v1.2 FINAL + roadmap addendum** | Roadmap clarification only — no audit, no methodology change. Adds **§14 National tax coverage as a pre-launch requirement** (13 provinces/territories, jurisdiction-gating rules, per-jurisdiction rule-record contents), records the **current UX phase and its engine freeze** in §12A, and restates the residence-vs-pension-jurisdiction separation as a named invariant (§0.9). Verified while updating: the production province selector is `provinceKeys(YEAR).filter(k => k !== "CUSTOM")` → exactly **ON, BC, AB**, with CUSTOM correctly excluded — consistent with the implemented verified tables and with this document. |
| **v1.2 FINAL** | Reconciles a further targeted Lovable audit. **Four new confirmed defects** (contribution room not enforced anywhere in the core engine; CPP lever forces both spouses to one age; OAS lever likewise; non-registered loss years produce zero taxable distributions). **One Lovable finding rejected on primary-source evidence** (Manitoba `full65`). Locked-in rules for **Manitoba, federal/OSFI and Quebec** verified against regulators and restated precisely. Estate haircut escalated because it **selects the withdrawal strategy**. Development order replaced by the **Phase 0 Implementation Contract** (§12). Source standard and rules-data record schema fixed (§13). |

---

## Reconciliation of the targeted Lovable audit (read this first)

Each claim was re-inspected in the current code and, where legal rules are involved, checked against a primary regulator source. **I did not accept any finding on assertion alone**, and one is rejected.

| # | Lovable claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `tfsaRoom`/`rrspRoom` are **not enforced** by `projection.ts` | **CONFIRMED — escalated to [C]** | `grep` of `projection.ts` returns **zero** references to either field. `a.contrib` is applied with only an age test (`contribEnd`), no room test. §2.6 rewritten. |
| 2 | CPP lever forces **both spouses to the same age** | **CONFIRMED — [C] for advice** | `levers.ts → leverOverride()`: `o.mods = (people) => { for (const p of people) { if (cppAge != null) p.cpp.age = cppAge; … } }`. §§4.3, 4.5, 8 corrected. |
| 3 | OAS lever forces both spouses to the same age | **CONFIRMED — [C] for advice** | Same loop, same function: `if (oasAge != null) p.oas.age = oasAge;`. §§5.4, 8 corrected. |
| 4 | Manitoba `full65: true` (100% unlock at 65) **is not correct** | **REJECTED — the claim is wrong; the code's headline rule is right.** Two *different* Manitoba defects found instead. | Manitoba Pension Commission **Policy Bulletin #1**: *"A LIRA owner who is at least 65 years old may apply … to unlock the balance in one or more of their LIRAs or LIFs"* — **no percentage or YMPE limit**; in force **1 Oct 2021** (Bill 8). See §3.2-MB for the two real defects. |
| 5 | Quebec LIF: no max at 55+, but under-55 rules still apply | **CONFIRMED — code is age-gated correctly; spec/tests hardened** | Retraite Québec: no upper limit **55+** from 1 Jan 2025; **under 55** a prescribed-rate maximum **and** temporary-income provisions remain. Also: LIF→RRSP/RRIF transfers now **prohibited at any age**. §3.2-QC. |
| 6 | Federal unlocking must not be simplified to "50% at 55" | **CONFIRMED** | OSFI: must first transfer to an **RLIF**; then up to **50%** of the RLIF, **within 60 days** of the RLIF's establishment, **once only** (no carry-forward of unused room), to an RRSP/RRIF; minimum age **55**. §3.2-FED. |
| 7 | Non-registered interest/dividends computed only when `growth > 0` | **CONFIRMED — [C]** | `projection.ts`: `if (a.type === "NONREG" && growth > 0) { … } else { /* loss years: no taxable yield */ a.bal += growth; }`. A −10% year yields **zero** taxable distributions. §6 rewritten. |
| 8 | The crude `afterTaxEstate()` haircut **selects the Auto strategy** | **CONFIRMED — priority raised** | `engine.ts → runPlan()`: `if (!best || short < best.short || (short === best.short && est > best.est))` where `est = afterTaxEstate(P)`. §1.15 / §7.8. |

> **On item 4.** The instruction was to treat Manitoba as a must-fix if `full65` produces an invalid 100% unlock. It does not: Manitoba genuinely permits unlocking the **entire** balance at 65+, and is among the most permissive jurisdictions in Canada. Encoding it as a *jurisdictional* rule is correct. Two *implementation* defects do exist and are must-fix (§3.2-MB): the one-shot `_split` flag can permanently block the age-65 full unlock, and the age-55 50% transfer is modelled into an **RRSP** when Manitoba law directs it to a **prescribed RRIF (PRRIF)** — which carries mandatory RRIF minimums, so the engine under-states forced taxable income. Shipping a "Manitoba unlocks 0/50% at 65" change would introduce a *new* error, so it must not be made.

---

## How to read this document

| Field | Meaning |
|---|---|
| **Goal** | What the planner is trying to calculate |
| **Methodology** | The correct Canadian planning approach |
| **Inputs / Outputs** | Data required and produced |
| **Formula** | The algorithm, precisely |
| **Fed vs prov** | Federal/provincial differences |
| **Annual?** | Whether the rule/figure changes each tax year |
| **Residence vs jurisdiction** | Whether province of *residence* governs, or the *pension jurisdiction* of the money |
| **Couples** | Spousal/partner considerations |
| **Edge cases** | What breaks it |
| **Now** | What the code does today, and the problems |
| **Recommended** | The production implementation |
| **Tests** | Cases that prove it is right |

**Severity tags.** **[C]** critical — wrong client dollars or legally impossible advice; fix before real use. **[G]** gap — materially incomplete but not wrong within its scope. **[A]** acceptable MVP approximation — must be disclosed on screen. **[L]** launch-blocker — must be exact before public, unsupervised use.

---

## 0. Global conventions (define once, enforce everywhere)

**0.1 Nominal dollars.** The engine runs in **nominal (future) dollars**; today's-dollar inputs are inflated by `infFac = (1+inflation)^offset`. Tax must be computed nominally because brackets are themselves indexed. **[Both correct.]**

**0.2 Indexation.** Brackets, BPA, age amount, pension amount and the OAS threshold index to CPI annually. Both engines **freeze the 2026 table for all future years** while inflating income → systematic overstatement of lifetime tax. **[C]** — §1.13.

**0.3 Time step.** Annual. Sub-annual timing (monthly withdrawals, mid-year death/retirement) is approximated to whole years. **[A]** — disclose.

**0.4 Rounding.** Never round intermediates; round for display only. The regression asserts `Math.round(lifetimeTax) === 276326`.

**0.5 Determinism.** `projection(PlanInputs, ProjectionOverride)` is pure and deterministic. This is what makes scenario comparison, the optimizer and the test suite possible — preserve it. Any Monte-Carlo layer wraps the deterministic core; it does not replace it.

**0.6 "Amount at 65" convention.** CPP/OAS are entered as the age-65 entitlement, then scaled for start age and indexed. Reasonable, with consequences for survivor benefits (§4.4) and deferral (§5.2).

**0.7 Horizon keyed to Person A.** Expenses and the projection horizon key off Person A's age even if A predeceases B. **[G]** — prefer keying to the last survivor.

**0.9 Invariant — two different jurisdictions, never interchangeable.** The engine carries **two** independent jurisdiction concepts, and conflating them is a correctness failure, not a simplification:

| Concept | Governs | Source of truth |
|---|---|---|
| **Province/territory of residence** | Income tax: brackets, BPA, age amount, pension amount, dividend credits, surtax, health premium | `PlanInputs.tax.provinceKey` |
| **Pension jurisdiction of the money** | Locked-in rules: LIRA/LIF unlocking %, minimum ages, LIF maximums, conversion vehicles | `AccountInput.juris`, **per account** |

The same client routinely has both — e.g. a **BC resident** (BC tax) holding an **Ontario-regulated LIRA** (Ontario unlocking, 50%). Neither value may ever be defaulted from the other, and a missing pension jurisdiction must never inherit the tax province. This invariant applies to §1.2, §3.1–3.2, §11.1 item 10, and §14.

**0.8 Layer discipline (new in v1.2).** A rule is only *enforced* if the **core projection** enforces it. Anything enforced solely in a recommendation helper, an allocator, or the UI is **advisory** and can be bypassed by saved plans, direct edits, scenario overrides or the optimizer. §2.6 exists because contribution room was advisory-only in every layer.
# 1. TAX ENGINE

The tax engine is the spine: the projection's withdrawal solver calls it once per binary-search iteration per year (up to ~50× per year per scenario), so it must be both correct and fast. Both codebases implement essentially the same `computeTax(income, opts, taxYear)` per person and a `householdTax(...)` splitting optimizer. The structure is sound; the errors are in coverage and in a few specific credits.

## 1.1 Federal tax [ok, with indexation caveat]

- **Goal:** Federal income tax before credits, on taxable income.
- **Methodology:** Progressive marginal brackets on taxable income (ordinary + grossed-up dividends + taxable capital gains).
- **Formula:** `bracketTax(taxable, federalBrackets)`; 2026 bands 14 / 20.5 / 26 / 29 / 33% at $58,523 / $117,045 / $181,440 / $258,482.
- **Fed vs prov:** Federal layer only.
- **Annual?** Yes — brackets index to CPI.
- **Residence/jurisdiction:** Neither (federal is national; Quebec's abatement is a separate wrinkle, see 1.2).
- **Couples:** Per person, then splitting (1.5).
- **Now:** Both correct for 2026. **Both freeze the bracket table for all future years [C]** (see §0.2 / 1.13).
- **Recommended:** Keep. Drive brackets from a per-year table with an indexation fallback for years beyond the published table.
- **Tests:** zero income → 0; a $100k ordinary income hand-calc; monotonic in income; top-bracket dollar taxed at 33%.

## 1.2 Provincial tax [ok for ON/BC/AB; gap elsewhere; Quebec special]

- **Goal:** Provincial income tax before provincial credits.
- **Methodology:** Province-specific brackets, credits, surtax, health premium; **based on province of residence on Dec 31**.
- **Fed vs prov:** Each province sets its own brackets/credits; Ontario has a surtax and a health premium; BC/AB do not.
- **Residence vs jurisdiction:** **Residence matters here** (not pension jurisdiction). Province is the taxing province.
- **Now (precise):** `taxYears.ts` → `PROVINCES_2026` contains tables for **exactly four keys: `ON`, `BC`, `AB`, `CUSTOM`**. `types.ts` → `ProvinceKey` declares **14** values (`AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT, CUSTOM`). The 10 declared-but-untabled jurisdictions (`MB, NB, NL, NS, NT, NU, PE, QC, SK, YT`) do **not** mis-tax silently — `getProvince()` executes `if (!p) throw new Error("Unknown province …")`, so selecting one **throws** at projection time. Whether an end user can reach that state depends on the app's province dropdown; the engine itself fails loudly rather than approximating. **[G]** (coverage gap), not a silent-miscalculation bug. Quebec is a special case even once tabled: QC residents file a separate provincial return, the federal **Quebec abatement (16.5%)** applies, and QC has its own pension plan (**QPP**) and credits — so "federal + a QC bracket table" would be **wrong [C for QC specifically]** if it were ever added as a mere bracket swap.
- **Production selector (verified during the v1.2 roadmap update):** `PlanWizard.tsx` builds its options as `provinceKeys(YEAR).filter(k => k !== "CUSTOM")`, so the live selector offers exactly **Ontario, British Columbia, Alberta** and correctly excludes CUSTOM. This is the **right pattern** — selectability is *derived from the data layer* rather than hardcoded, so a jurisdiction becomes available the moment its table lands. §14 extends it with one more condition: derive from the table **and** its `status === "VERIFIED"`.
- **Recommended:** Ship ON/BC/AB as exact; keep the throw (or a friendly "not yet supported") for the rest rather than approximating. Add provinces only as vetted tables land. Treat Quebec as a dedicated workstream (abatement + QPP + QC credits), not a bracket swap. **National coverage of all 13 provinces/territories is a pre-launch requirement — see §14.**
- **Tests:** ON surtax kicks in at the two thresholds; ON health premium steps and $900 cap; AB flat-ish high BPA; a QC guard test that refuses rather than approximates.

## 1.3 Basic personal amount (BPA) [ok]

- **Goal:** Non-refundable credit shielding a base amount of income.
- **Methodology:** Federal BPA is enhanced and **phases down across the top two brackets** from a maximum ($16,452 in 2026) to a floor ($14,829) between $181,440 and $258,482 of net income; provincial BPAs are flat per province.
- **Formula:** Linear interpolation of the federal BPA over the phase-out range × lowest federal rate = credit. **[Both implement this correctly.]**
- **Annual?** Yes.
- **Now:** Correct. Minor: the phase-out uses **taxable income as a proxy for net income** (§1.11) — immaterial for most retirees.
- **Tests:** below phase-out → full BPA; above top → floor BPA; a mid-range interpolation hand-check.

## 1.4 Age amount [ok, minor proxy]

- **Goal:** Extra credit for those 65+.
- **Methodology:** Federal age amount ($9,208 in 2026) reduced by 15% of **net income** over a threshold (~$46,432), to zero; each province has its own age amount/threshold.
- **Annual?** Yes. **Residence:** provincial portion varies by province.
- **Now:** Both correct, again using taxable as the net-income proxy **[A]**.
- **Tests:** age 64 → 0; age 65 low income → full; high income → fully clawed back.

## 1.5 Pension income amount + pension income splitting [C — TWO critical bugs: eligibility + a 25% split cap]

This is the highest-value tax interaction in a retirement plan and it carries **two independent critical bugs**: (A) the *wrong income* is treated as eligible, and (B) the *search only reaches half the legal split*.

- **Goal (credit):** A non-refundable credit on up to $2,000 of *eligible pension income* (federal; provinces have their own, e.g. ON $1,796).
- **Goal (splitting):** Allow up to **50%** of *eligible pension income* to be taxed in the lower-income spouse's hands.
- **Correct eligibility (verified, CRA line 31400 / T1032):**
  - **Age 65+:** eligible pension income includes **life annuity from an RPP**, **RRIF/LIF withdrawals**, and annuity income from RRSP/DPSP. **A plain RRSP lump-sum withdrawal does NOT qualify.**
  - **Under 65:** only **RPP lifetime pension** (and a few death-of-spouse cases) qualifies. **RRIF income does NOT qualify under 65** except on death of a spouse.
### Bug A — wrong income counted as eligible

- **The bug:** Both engines compute `pensionEligible = penInc + bridge + mandatory(RRIF/LIF minimums) + (age≥65 ? schedRegCash : 0)`, where `schedRegCash` **lumps RRSP and RRIF scheduled withdrawals together**. So:
  1. **A plain RRSP withdrawal at 65+ is wrongly treated as pension-eligible** — it wrongly earns the $2,000 credit and, worse, is wrongly allowed into pension splitting. This **understates tax** for RRSP-melt strategies and biases the optimizer toward them.
  2. Under 65, RRIF minimums are (correctly, in the code) treated as pension-eligible only via `mandatory`, but `mandatory` is credited at all ages, so **a RRIF minimum taken under 65 is wrongly credited/split**.
- **Fed vs prov:** Both federal and provincial pension amounts; splitting is a federal election that flows to the provincial return automatically.
- **Annual?** Credit amounts index; the 50% rule and the eligibility rules are structural (rarely change).
- **Couples:** Splitting only exists for married/common-law (not "partners") — both engines gate this correctly via `canSplit`.
### Bug B — the double-50%: the search only reaches a 25% split [C]

- **The code:** `householdTax()` optimizes the split by calling, for each direction,
  `tryDir(0, 1, 0.5 * a.pensionEligible)` and `tryDir(1, 0, 0.5 * b.pensionEligible)`.
  Inside `tryDir(from, to, maxT)` the transfer tested is `T = maxT * f` with the loop
  `for (let f = 0.05; f <= 0.5001; f += 0.05)`.
- **The arithmetic:** `maxT` is *already* 50% of eligible pension, and `f` tops out at 0.50, so the **largest transfer ever evaluated is `0.5 × 0.5 = 25%` of eligible pension income.** CRA (Form T1032) permits allocating up to **50%**. The optimizer therefore **cannot find the optimal split whenever the best allocation exceeds 25% of eligible pension** — which is the *common* case for a lopsided couple (one large DB pension / RRIF, one low-income spouse), where the true optimum is at or near the full 50%.
- **Consequence:** household tax for couples is **overstated** (they are silently *under-split*) exactly when splitting matters most. It also **biases the optimizer** against strategies whose payoff is splitting (e.g. RRSP→RRIF conversion at 65), because the modelled benefit of splitting is halved.
- **Why no test caught it (important):** the suite's `"respects the 50% statutory transfer limit"` test asserts only `splitAmt <= 50000` — a **one-sided ceiling check** that the 25%-capped value (`25000`) satisfies. `"finds a real saving for a lopsided couple"` asserts only `splitAmt > 0`. Both pass while the transfer is capped at half the legal maximum. **A passing test proved the cap was not *exceeded*; it never proved the optimum was *reached*.**
- **Does it move the $276,326 regression?** No — the regression fixture is a **single filer**, which takes the `incs.length === 1` branch and never calls `tryDir`. This is precisely why the headline regression number did not surface the bug, and why couple-specific optimum tests are required.
- **Fix:** search the **full 0%→50%** range of eligible pension income. Either pass the *un-halved* eligible amount and let `f` run 0→0.50 (`T = pensionEligible * f`, `f ∈ [0, 0.50]`), or keep `maxT = 0.5 * pensionEligible` and let `f` run `0→1.0`. Use a fine step (e.g. 1–2%) or, better, solve the split analytically/with a bounded 1-D optimizer since combined tax is convex in the transfer within a bracket. Guarantee the endpoints `0%` and the full `50%` are always evaluated.

### Recommended production implementation (fixes both bugs)

1. Track registered withdrawals as **two streams**: `rrifEligible` (RRIF/LIF minimums + any withdrawal from an account in RRIF/LIF status) and `rrspNonEligible` (withdrawals from an account still in RRSP/LIRA status). *(Bug A)*
2. `pensionEligible = rppLifetimePension + (age≥65 ? rrifEligible : 0)` — **no unconditional bridge term**; see **Erratum 1** below. Do **not** include plain RRSP withdrawals at any age. *(Bug A)*
3. Feed only `pensionEligible` to both the $2,000 credit and the splitting optimizer. *(Bug A)*
4. Search the split over the **entire statutory range, 0% through 50% of eligible pension income**, both directions; always test the 0% and 50% endpoints; keep the lowest combined household tax. *(Bug B)*
- **Tests (both bugs):**
  - **Split range:** a lopsided couple whose optimum is the **full 50%** must return `splitAmt ≈ 0.5 × pensionEligible` (not `0.25 ×`). Construct a case where 50% is strictly better than 25% and assert the optimizer picks ≥ 49%.
  - **Endpoint coverage:** assert the search evaluates `splitAmt == 0` and `splitAmt == 0.5×eligible` as candidates.
  - **Monotone benefit:** for a fixed lopsided couple, optimal combined tax with the fixed search ≤ optimal with any 25%-capped search, strictly less in at least one constructed case (a **regression guard** against re-introducing the cap).
  - **Eligibility (Bug A):** 66-year-old with only RRSP (not RRIF) withdrawals → **no** pension credit, **no** split allowed; same person after converting to a RRIF → credit + split allowed; 60-year-old with RRIF minimum → not eligible; couple with a DB pension at 60 → splitting allowed at 60.
  - **Bridge (Erratum 1):** a 60-year-old with an RPP lifetime pension **and** a bridge benefit has `pensionEligible` equal to the **lifetime portion only**; the bridge is taxed as ordinary income and neither earns the credit nor enters the split. Setting the affirmed-eligibility flag (below) adds it; the flag defaults to off.

### Erratum 1 — bridge benefits are not lifetime retirement benefits [C, narrow]

**The contradiction.** v1.2 as issued carried an unconditional `+ bridge` term in `pensionEligible` while simultaneously stating that under 65 only **RPP lifetime pension** qualifies. Both cannot be true. The `+ bridge` term was inherited from the code (`projection.ts`: `pensionElig: p.penInc + p.bridgeInc + p.mandatoryTaxable + (p.age>=65 ? p.schedRegCash : 0)`), so the error exists in **both codebases and the spec**.

**Verified against CRA (Aug 2026):**

1. **RPP glossary — decisive on the definition.** *"Bridging benefits paid to a plan member are benefits payable for a temporary period ending no later than a date known at the time payments start."* And, in the definition of lifetime retirement benefits: *"Bridging benefits, by definition, are **not** lifetime retirement benefits."*
2. **Line 31400 eligible-pension-income tables.** Both the under-65 and the 65+ tables describe the RPP entry as **"RPP lifetime retirement benefits (including retroactive lump-sum payments)"** — T4A **box 016**. Neither table mentions bridging benefits, bridge benefits, or temporary supplements anywhere.

**Conclusion: the finding is correct.** A bridge benefit does not qualify **merely because it is paid from a pension plan**. Including it unconditionally overstates eligible pension income, which overstates the $2,000 credit and — more materially — **inflates the amount admitted to pension income splitting**, understating household tax for exactly the pre-65 DB-pensioner couples where bridges are common.

**One nuance the engine must respect (do not over-correct to a blanket exclusion).** Bridge amounts are typically **reported in T4A box 016 together with the lifetime pension**, and professional guidance (e.g. Sun Life's pension-splitting reference) lists DB plan income *"and bridge benefits **subject to conditions**"* as eligible — reflecting that a bridge forming part of a life annuity out of an RPP can fall within the statutory "life annuity out of or under a superannuation or pension plan." The correct engineering answer is therefore **source classification, not a hardcoded yes or no**:

| Bridge source | Default treatment | Notes |
|---|---|---|
| Bridge paid from the RPP, not affirmed as part of the life annuity | **Ordinary income only** — not pension-eligible | The safe default: under-claims rather than over-claims |
| Bridge affirmed by the adviser as an eligible RPP life-annuity payment meeting the conditions | Pension-eligible | Requires an explicit affirmation flag; **never** inferred |
| Supplement from another vehicle (e.g. an **RCA**, a non-registered top-up, an employer SERP) | **Not pension-eligible** | Must be classified by source and verified per vehicle before any eligibility is granted; status `APPROXIMATE` until confirmed |

**Direction of the safe error.** Understating eligibility causes the tool to under-claim a credit and under-split — a conservative, defensible outcome. Overstating it tells a client their household tax is lower than it will be. For a planning tool the default must be the conservative one.

**Scope of this erratum.** It changes `pensionEligible` only. `bridgeInc` remains **fully taxable ordinary pension/retirement income** in every other respect — it still appears in `ordinary`, in `cash`, in guaranteed income (§7.3), and in the bridge-timing logic (paid from retirement to its end age). **No other methodology changes.**

## 1.6 Eligible dividends [ok]

- **Goal:** Tax Canadian eligible dividends at their preferential rate via gross-up + credit.
- **Formula:** Taxable = cash × 1.38; federal credit = grossed-up × 15.0198%; provincial credit = grossed-up × province rate.
- **Now:** Both correct for eligible dividends.
- **Tests:** eligible dividend taxed more lightly than equal ordinary income; credit never negative.

## 1.7 Non-eligible dividends [G — unsupported in both]

- **Goal:** Tax dividends from CCPCs (small-business corporations) at their higher gross-up/lower credit.
- **Correct 2026 rule:** gross-up **15%**, federal dividend tax credit **9.0301%** of the grossed-up amount; provincial non-eligible credits differ from eligible.
- **Now:** **Neither engine models non-eligible dividends.** The non-registered return mix has only `int / div / cg`, and `div` is always treated as **eligible**. For a retiree drawing dividends from a private corporation or from funds distributing non-eligible dividends, tax is **understated**. **[G]**, rising to **[C]** for business-owner clients.
- **Recommended:** Split the non-reg `div` bucket into `eligDiv` and `nonEligDiv` with separate gross-up/credit constants; default new plans to 100% eligible so nothing changes for the common case.
- **Tests:** non-eligible dividend taxed more heavily than an equal eligible dividend; business-owner fixture.

## 1.8 Capital gains [ok for 2026; keep the rate as data]

- **Goal:** Tax realized gains at the inclusion rate.
- **Verified 2026 status:** inclusion rate is **50%** for individuals. The proposed 66.67% rate on gains over $250,000 was **cancelled March 21, 2025** and never took effect. So the engines' hardcoded 50% is **currently correct**.
- **Now:** Both hardcode `× 0.5`. Fine today, but it should live in the tax-year table so a future change (or a client with >$250k realizations, if the measure ever returns) is a data edit, not a code hunt. **[A]**
- **Realization model:** Gains are realized (a) on scheduled/discretionary non-reg withdrawals in proportion to the embedded gain `(bal−acb)/bal`, and (b) on asset sales/downsizes. This proportional-ACB model is a reasonable planning approximation. **[A]** Real life realizes specific lots; disclose.
- **Tests:** $100k gain → $50k taxable; ACB tracked so a later sale isn't double-taxed; principal-residence sale → no taxable gain.

## 1.9 Interest income [ok]

Fully taxable as ordinary income. Non-registered interest accrues each year, is taxed, **and is reinvested (added to balance and ACB)** rather than paid as cash. Correct treatment for a total-return account. **[Both ok.]**

## 1.10 RRSP deduction / contribution refund [C — not modelled]

- **Goal:** A pre-retirement RRSP contribution reduces taxable income now (a refund), which a good plan reinvests.
- **Now:** **Neither engine models the deduction.** Contributions add to the RRSP balance but **do not reduce that year's taxable income**, and no refund is generated or recycled. For a still-working contributor this **overstates tax during accumulation and understates the value of RRSP saving** relative to TFSA. **[C]** for accumulation-stage clients; immaterial for already-retired clients.
- **Recommended:** In a contribution year, reduce the contributor's `ordinary` income by the deductible RRSP amount (bounded by RRSP room), let the tax engine produce the lower tax, and (optionally) model the refund as a TFSA/non-reg contribution the following year via a "reinvest refund" toggle.
- **Tests:** working client contributing $10k to RRSP pays less tax than contributing $0; TFSA contribution produces no deduction; deduction capped at room.

## 1.11 Net income vs taxable income proxy [A]

Several credits and the OAS clawback are legally driven by **net income** (line 23600), not taxable income. Both engines use **taxable income as the proxy**, ignoring deductions (RRSP, union dues, etc.). For a typical retiree with few deductions this is close. **[A]** — disclose, and revisit once the RRSP deduction (1.10) is modelled, because then net ≠ taxable and the clawback base must use net.

## 1.12 OAS recovery tax (clawback) [ok, proxy caveat]

- **Goal:** The 15% recovery tax on OAS when income exceeds the threshold.
- **Formula:** `min(OAS received, 15% × max(0, netIncome − threshold))`; 2026 threshold ≈ $95,323.
- **Residence:** national. **Couples:** individual — each spouse's own income drives their own clawback (both engines correctly compute it per person).
- **Now:** Correct except the net-income proxy (1.11) and the fixed threshold (1.13). One subtlety: the recovery tax is legally based on the **prior year's** net income and reconciled; the engine applies it in the **same** year. Acceptable for planning **[A]**.
- **Tests:** income below threshold → 0; well above → capped at OAS received; per-spouse independence.

## 1.13 Annual indexation of the whole tax table [C]

- **Problem:** Brackets, BPA, age amount, pension amount, and the OAS threshold are **frozen at 2026** for every future projection year while income is inflated. Over 30 years at 2% that pushes real income up ~80% against a static bracket grid → **systematic overstatement of lifetime tax** (the $276,326 regression figure is itself inflated by this).
- **Recommended:** Index every bracket and credit by an assumed indexation rate (default = inflation, overridable) for years beyond the last published table. Keep published exact tables for the years CRA has released; index beyond.
- **Tests:** with indexation = inflation, a flat-real-income projection shows flat real tax; a 40-year all-TFSA plan shows near-zero tax growth.

## 1.14 Marginal & average tax [ok, one heuristic to fix]

- **Average rate** = tax / taxable income per year. Fine.
- **Marginal rate**: `approxMarginal` bumps ordinary income $1,000 and measures Δtax — correct per person.
- **Household marginal heuristic [G]:** the projection reports the household marginal as `min` of the two spouses' marginals. That is a *display* convenience, not a real quantity; it should not feed any decision. Ensure the optimizer uses **actual re-simulated tax deltas**, never this reported number. (It currently does; keep it that way.)

## 1.15 Tax at death / terminal return [C — approximation only]

- **Goal:** The tax hit in the year of death and the true after-tax estate.
- **Correct methodology:** In the year of death there is a **terminal T1** that (a) includes the **full fair-market value of RRSP/RRIF/LIRA/LIF** as income (unless rolled to a spouse or dependent), and (b) triggers a **deemed disposition** of non-registered capital property at FMV, realizing all embedded gains. TFSA passes tax-free. A **spousal rollover** defers both — registered rolls to the survivor's registered plan, and capital property can roll at cost — so the big terminal tax hits on the **second** death.
- **Now:** Neither engine files a terminal return. Instead, `afterTaxEstate` applies flat haircuts to the *ending* balance: **TFSA ×1.00, non-reg ×0.92, registered ×0.62**. This is a crude proxy that (a) ignores the actual marginal-rate spike of collapsing a large RRIF in one year (often materially **more** than 38%), (b) ignores the deemed disposition on non-reg being a *gains-only* 50%-inclusion event (the 0.92 is a guess), and (c) never models the **first death** spousal rollover explicitly for tax (accounts roll, but no terminal return is computed at all). **[C]** for estate accuracy; **[A]** only if the tool explicitly frames the estate number as a rough after-tax figure.
- **v1.2 escalation:** this proxy is not confined to a displayed number — it is the **tie-break that selects the client's withdrawal strategy** in `runPlan()`. See §7.8 for the mechanism and the direction of the resulting bias.
- **Recommended:** At each death year, run a real terminal return: add remaining registered FMV (net of spousal rollover) to that year's income and tax it through `computeTax`; realize non-reg embedded gains via deemed disposition; TFSA at par; subtract from the estate. On the first death with a spouse, apply the rollover (no terminal tax on rolled assets) — which both engines already do for *balances*; extend it to *tax*.
- **Tests:** single person dying at 90 with a $500k RRIF shows a large terminal-year tax spike, not a flat 38%; couple, first death → near-zero incremental tax (rollover), second death → full inclusion; TFSA never taxed at death.
---

# 2. REGISTERED ACCOUNTS

## 2.1 RRSP [ok as a container; deduction gap = §1.10]

- **Goal:** Tax-deferred growth; contributions deductible; withdrawals fully taxable as ordinary income; mandatory conversion to a RRIF by end of the year the holder turns **71**.
- **Methodology:** Contributions grow tax-free; withdrawals are ordinary income; **RRSP withdrawals do not require conversion** (you can draw from an RRSP directly — the original tool correctly established this) but they are **not pension-eligible** (§1.5).
- **Inputs:** balance, expected return, contributions (amount, end age), optional explicit conversion age.
- **Now:** Both model the container and the auto-convert at 71 correctly. **Gaps:** the deduction/refund (§1.10) and the pension-eligibility mislabel (§1.5).
- **Residence/jurisdiction:** neither — RRSP is federal.
- **Couples:** spousal RRSPs and the attribution rules are **not modelled** (§2.7). **[G]**
- **Tests:** auto-convert at 71 if no earlier age set; direct RRSP withdrawal produces ordinary income and no pension credit; contribution capped at room (§2.6).

## 2.2 RRIF [ok minimums; pension-credit interaction = §1.5]

- **Goal:** Decumulation vehicle with a **mandatory annual minimum** and no maximum.
- **Formula:** minimum factor × Jan-1 balance. Below 71, factor = **1/(90 − age)**; 71+, the statutory table (5.28% at 71 … 20% at 95+). Both engines carry the correct table and the pre-71 formula.
- **Correct nuances not modelled [G]:**
  - **Younger-spouse election:** a RRIF holder may base minimums on a **younger spouse's age**, lowering forced income. Not modelled.
  - **First-year exemption:** no minimum required in the year the RRIF is established. Not modelled (immaterial at annual granularity).
- **Now:** Minimums correct. RRIF withdrawals are correctly pension-eligible at 65+ — but the code can't tell RRIF from RRSP cash (§1.5).
- **Tests:** age-70 RRIF min = balance/(90−70)=5.0%; age-71 = 5.28%; 95+ = 20%; minimum still forced in a year the client doesn't need the cash (raises taxable income).

## 2.3 TFSA [ok; couple room = §2.6]

- **Goal:** Tax-free growth and withdrawals; withdrawals are **not income** (don't affect OAS clawback or credits) — which makes the TFSA the key clawback-management lever.
- **Now:** Both correct: TFSA withdrawals produce cash but no taxable income; new room accrues at $7,000/yr.
- **Edge case:** TFSA **recontribution room** (withdrawals restore room next calendar year) is not modelled; minor for decumulation. **[A]**
- **Tests:** TFSA withdrawal moves no tax; leaning on TFSA in a high-income year reduces OAS clawback.

## 2.4 LIRA / DCPP [ok; see locked-in §3]

Locked-in accumulation vehicles. A LIRA (locked-in RRSP) and a DCPP that has been transferred to a locked-in vehicle must convert to a **LIF** (or annuity) to pay income, generally by 71. Before conversion they are **not drawable** — both engines correctly exclude them from the discretionary draw until `convAgeOf`. Modelled well as containers; the unlocking mechanics are in §3.

## 2.5 Treatment at death (registered) [C — tax not modelled; see §1.15]

- **Correct:** Registered plans with a **spouse** beneficiary roll over tax-free to the survivor's registered plan (first death). With no spouse, the **entire FMV is taxable on the terminal return** (second death / single person). A financially dependent child/grandchild is a special case.
- **Now:** Both roll *balances* to the survivor on the first death (correct) but never compute the *terminal tax* on the last death (§1.15). **[C]**

## 2.6 Contribution limits & carry-forward room [C — **not enforced anywhere in the core engine**]

> v1.1 described this as "Person-A-only, no dynamics." That was **too generous and factually wrong about where the check happens.** Re-inspection shows contribution room is **never enforced by the projection at all**. The engine will happily model $50,000/year into a TFSA, forever. Because the tool *recommends* savings amounts, this is not merely a modelling gap — it is a **recommendation-correctness blocker**: the planner can advise a client to make a **legally impossible contribution**, and will then show them the (illegally inflated) result.

### The three layers — and which one actually binds

| Layer | What it does with room today | Binding? |
|---|---|---|
| **1. Displayed / referenced by recommendation functions** | `analysis.ts:277` sums `p.tfsaRoom` across people and, if `tfsaRoom > 5000 && nonreg > 5000`, emits a "shelter it" recommendation quoting `min(tfsaRoom, nonreg)`. `levers.ts:212-245` (`recommendSavingsAccount`) sums both rooms and returns a `roomAvailable` figure with the advice text. | **No.** Room only shapes *words and a destination*; it never caps an amount. |
| **2. Savings allocator** | The original prototype had `buildAlloc()`, which **did** cap a recommended monthly saving to a room-aware cascade (TFSA → RRSP → non-registered). **The Lovable port did not carry this forward.** `recommendSavingsAccount()` chooses *which account* but never *how much*; `leverOverride()` converts `extraMonthlySaving` straight into `goalSaves` with **no room test** and a hardcoded `owner: "A"`. | **No.** Lovable regressed here relative to the original. |
| **3. Core projection (`projection.ts`)** | **Zero references to `tfsaRoom` or `rrspRoom`.** Regular contributions apply as `if (a.contrib > 0 && (a.contribEnd === 0 \|\| age <= a.contribEnd)) { a.bal += a.contrib * infFac; … }`. Injected `goalSaves` apply with only an "is the owner still pre-retirement" test. | **No.** Nothing anywhere prevents an over-contribution. |

**Consequences.** (a) Any recommendation of the form "save $X/month into your TFSA" is unvalidated against room. (b) A saved plan or a hand-edited contribution of $50,000/yr into a TFSA projects as tax-free forever, materially inflating the estate and the plan-funded score. (c) The optimizer (§9), once built, will *exploit* the missing constraint — an unconstrained optimizer will discover that infinite TFSA contributions dominate every other strategy. **Room enforcement is a precondition for the optimizer, not a nicety.**

**Classification: [C] and [L].** It produces wrong client numbers *and* legally impossible advice.

### Correct Canadian methodology

**TFSA (per person, per calendar year).** Room is personal and starts at 18 (residency-dependent). This is the **steady-state** recursion for years after the plan starts; the **plan-start year is different and must not apply it** — see **Erratum 2** below.
```
tfsaRoom[t] = tfsaRoom[t-1]
            + annualTfsaDollarLimit[t]          (if resident and age >= 18)
            + withdrawalsMadeIn[t-1]            (restored on Jan 1 of the FOLLOWING year)
            - contributionsMadeIn[t]
```
CRA's published formula for available contribution room is exactly this: current-year dollar limit **+** unused room from previous years **+** withdrawals made the previous year **−** contributions already made this year.
Key rules: withdrawals restore room **the next calendar year, not immediately** (re-contributing in the same year is the classic over-contribution error); unused room carries forward indefinitely; **no age cap** (accrues for life); over-contributions attract a **1%/month penalty on the highest excess amount**; there is **no deduction** (contributions are after-tax).

**RRSP — two distinct quantities that must not be conflated.**
1. **Contribution room** (how much may be *put in*):
```
rrspRoom[t] = rrspRoom[t-1]
            + min(0.18 × earnedIncome[t-1], rrspDollarLimit[t])
            - pensionAdjustment[t-1]            (PA: employer plan accrual)
            - PSPA[t]                            (past-service pension adjustment)
            + PAR[t]                             (pension adjustment reversal, on plan termination)
            - contributionsMadeIn[t]
```
2. **Deduction limit** (how much may be *claimed this year*): contributions may be **carried forward undeducted** and claimed in a later, higher-bracket year, and **unused undeducted contributions** persist as a separate balance. The CRA Notice of Assessment relationship is **`Deduction Limit = Unused (undeducted) Contributions + Available Contribution Room`**, so **`Available Contribution Room = Deduction Limit − Unused Contributions`**. The two are different numbers and must be carried separately (**Erratum 2**). As with the TFSA, the recursion above is **steady-state only** — the plan-start year takes the client's entered figure verbatim.

Key rules: **age limit — no contributions after 31 December of the year the annuitant turns 71**. *(In law, spousal RRSP contributions may continue to a younger spouse's plan until **their** year-71 — this is correct Canadian methodology but is **deferred to §2.7 / Phase 5 and NOT implemented in Batch 0B**; see Erratum 3.)* Over-contribution buffer of **$2,000 lifetime** before the 1%/month penalty; earned income is a defined term (employment/self-employment/net rental, **not** investment income or pensions).

**Spousal RRSP — methodology recorded, implementation deferred (Erratum 3).** Contributions use the **contributor's** room but are owned by the annuitant spouse; withdrawals within **3 calendar years** of a contribution are attributed back to the contributor. **Batch 0B does not model this**: it models only contributions where `contributor === account owner` (§2.7). The rule is documented here so Phase 5 implements it against a stated standard, not so 0B infers it.

### Production implementation — per-person annual room ledgers

Add to the per-person state a ledger advanced **once per projection year**, before contributions are applied:

```
PersonRoomLedger (per person, per year t)
  tfsaRoomOpen           tfsaAccrual[t]        tfsaWithdrawalsPrevYear
  tfsaContributions[t]   tfsaRoomClose         tfsaExcess[t]
  rrspRoomOpen           rrspAccrual[t]        pensionAdjustment[t]
  pspa[t]  par[t]        rrspContributions[t]  rrspRoomClose
  rrspUndeductedCarry    rrspDeductionClaimed[t]
  earnedIncome[t]        age[t]                over-contribution flags
```

Required engine behaviour:
1. **Hard cap at the point of contribution.** In `projection.ts`, every contribution path — regular `a.contrib`, injected `goalSaves`, lump sums with a registered destination, and surplus sweeps (§7.7) — must be clamped to the owner's remaining room for that account type, in that year. Contributions in excess are either **rejected and re-routed to non-registered** (recommended default) or recorded as an explicit modelled over-contribution with the 1%/month penalty. Never silently accepted.
2. **Cascade on overflow.** When a target's room is exhausted, overflow follows TFSA → RRSP → non-registered (restoring the original's `buildAlloc` behaviour, now enforced in the engine rather than in a helper).
3. **Per person, not per household.** Room is individual. Couple savings allocate across **both** ledgers; the current `owner: "A"` hardcode in `leverOverride()` must go.
4. **RRSP age-71 stop (Erratum 3 — Option A).** No contribution to the owner's **own** RRSP after 31 December of the year the owner turns 71. Room **continues to accrue** on the ledger from earned income and is **not** consumed. Batch 0B does **not** redirect that room to a younger spouse — spousal RRSPs are out of scope (§2.7). Where a person past 71 holds unused room and has a spouse aged ≤ 71, surface a **disclosure** ("a spousal RRSP contribution may still be available to you — not modelled in this plan") rather than silently modelling or silently ignoring it.
5. **TFSA withdrawal restoration with a one-year lag.** Track withdrawals by year; add to room at the *following* year's opening.
6. **Unknown room is neither infinite nor a free annual limit — amended by Erratum 2.** When a client leaves room blank (`null`), the plan-start year carries **zero** verifiable room, because a plan begun partway through the year may follow contributions the client has already made. Statutory accrual begins on **January 1 of the next projection year**. `null` is never unlimited, and never the current year's annual limit. Surface an on-screen "enter your CRA figure for accuracy" flag. Engine-generated contributions are capped at zero in that year; client-asserted contributions are honoured but flagged (see Erratum 2, *Asserted vs recommended*).
7. **Deduction ≠ contribution (ties to §1.10).** Track undeducted carry-forward so the tax engine can claim a deduction in a later year.

**MVP scope call.** PA/PSPA/PAR require employer-plan data most clients cannot supply. For the MVP: accept an **optional** PA input (defaulting to 0), and where the client has a DB/DC pension, show a prominent "your RRSP room is reduced by your pension adjustment — enter your CRA Notice of Assessment figure for accuracy" warning. PSPA/PAR are **[G]**, deferred, and must be *disclosed* rather than silently ignored.

### Erratum 2 — opening-year room semantics (Batch 0B input contract) [C, narrow]

**The defect.** §2.6 as issued gave a single steady-state recursion (`tfsaRoom[t] = tfsaRoom[t-1] + annualLimit[t] + withdrawals[t-1] − contributions[t]`) with no special case for the **plan-start year**, and said unknown room defaults to "accrual-only," i.e. the current year's full annual limit. Implemented literally, both **double-count the plan-start year**: the UI field asks for *room available now*, which **already includes** the current year's statutory accrual, so adding the annual limit again invents room the client does not have. The same error appears on the RRSP side, compounded by conflating **contribution room** with **deduction limit**.

**Verified against CRA (Aug 2026).**

1. **TFSA — CRA's own formula for available contribution room:**
   `TFSA dollar limit of the current year` **+** `unused contribution room from previous years` **+** `withdrawals made the previous year` **−** `contributions already made this year`.
   CRA states the dollar limit *"is added to your contribution room on January 1"* and that a withdrawal *"you will regain the same amount as new available contribution room on January 1 of the **following year**."*
   → A user-entered "room available" figure is the **output** of that formula. It already contains the current year's limit and is already net of contributions made so far this year. **Adding the annual limit again in the plan-start year is a double-count.** Finding confirmed.
2. **RRSP — the deduction limit is not the contribution room.** The CRA Notice of Assessment / RRSP Deduction Limit Statement relationship is
   `Deduction Limit = Unused (undeducted) Contributions + Available Contribution Room`, i.e.
   **`Available Contribution Room = Deduction Limit − Unused Contributions`.**
   → The two must be carried as separate quantities. Treating an entered "RRSP room" as a deduction limit (or vice-versa) mis-states how much may legally be **contributed**. Finding confirmed.

**Rulings on the eight questions.**

| # | Question | Ruling |
|---|---|---|
| 1 | TFSA opening-year double-count | **Confirmed.** Plan-start year uses the entered figure verbatim; no annual-limit addition. Recursion begins the following January 1. |
| 2 | Unknown TFSA room → 0 in start year | **Adopted**, with a refinement: zero applies to **engine-generated** contributions and recommendations. See "Asserted vs recommended" below. |
| 3 | Separate contribution room / deduction limit / undeducted carry | **Adopted**, exactly as CRA defines them; the identity above is enforced as a validation. |
| 4 | RRSP plan-start year is authoritative | **Confirmed.** No current-year regeneration from prior-year earned income when the client supplied current available room. Current-year earned income and PA generate **next** year's new room. |
| 5 | Unknown RRSP room | **Adopted**, with the same asserted-vs-recommended refinement, plus the PA interaction in row 6. |
| 6 | Pension adjustment | **Never infer PA from the eventual DB pension amount.** `PA = 0` is acceptable **only** as a disclosed estimate, never silently. Withholding rule below. |
| 7 | $2,000 cushion | **Confirmed.** Never added to recommended available room; recognised only in penalty modelling. |
| 8 | Refund reinvestment | **Confirmed — defaults to `false`.** Opt-in only, and the resulting reinvestment is itself room-capped. |

**Asserted vs recommended (necessary refinement to §2.6's "hard cap").** §2.6 requires every contribution path to be clamped to remaining room. With unknown room set to zero, a literal clamp would **delete a client's stated reality** — a client who says "I put $500/month into my TFSA" is describing a fact, not requesting advice. Batch 0B therefore distinguishes by *source*:

- **Client-asserted actual contributions** (`AccountInput.contrib` entered in the plan): **honoured** even when room is unknown, but marked `unverifiedRoom` and surfaced as *"we can't confirm you have room for this — enter your CRA figure."* Where room **is** known, they are clamped normally and any excess is reported as a modelled over-contribution.
- **Engine-generated contributions** (`goalSaves`, optimizer-injected savings, surplus sweeps, and every "save $X more" recommendation): clamped to **known** room only. **Unknown room = zero capacity**, so no registered contribution is ever recommended against room the tool cannot verify.

This preserves the rule that the tool never *recommends* an illegal contribution, without the engine overruling the client about their own life.

**PA withholding rule (ruling on question 6).** For a **member of a DB/DC pension plan**:

- If **current available room is supplied** → the plan-start year is authoritative and recommendations proceed normally for that year; **future** years are flagged `APPROXIMATE` whenever PA is unknown, because PA can consume nearly all of the 18% accrual for a DB member.
- If **both current room and PA are unknown** → **withhold registered-contribution recommendations entirely** for that person, and show the prompt for their CRA figure. Projection may still run with `PA = 0` **flagged as an estimate**, so the client sees a plan; it simply must not advise a contribution built on two compounding unknowns.
- `PA = 0` is never a silent default for a pension-plan member.

---

### Erratum 2 — exact ledger formulas to implement

Notation: `t₀` = plan-start year; `t` = any later projection year. All figures are per person. `⌀` denotes an unknown (null) input.

**TFSA**

```
── Plan-start year t₀ ────────────────────────────────────────────────
KNOWN room (user entered a current available figure):
    tfsaRoomOpen[t₀]  = enteredTfsaAvailableRoom          // authoritative, verbatim
                                                          // already includes t₀'s dollar limit
                                                          // already net of t₀ contributions to date
    // DO NOT add tfsaAnnualLimit[t₀]

UNKNOWN room (⌀):
    tfsaRoomOpen[t₀]  = 0                                 // not the annual limit, not unlimited
    roomStatus[t₀]    = "UNKNOWN"                         // UI: "enter your current TFSA room"

Both cases:
    tfsaRoomClose[t₀] = max(0, tfsaRoomOpen[t₀] − tfsaContributions[t₀])

── Every following year t > t₀ ───────────────────────────────────────
    tfsaRoomOpen[t]   = tfsaRoomClose[t−1]
                      + tfsaAnnualLimit[t]                // added Jan 1; only if resident and age ≥ 18
                      + tfsaWithdrawals[t−1]              // restored Jan 1 of the FOLLOWING year
    tfsaRoomClose[t]  = max(0, tfsaRoomOpen[t] − tfsaContributions[t])

    excess[t]         = max(0, tfsaContributions[t] − tfsaRoomOpen[t])   // 1%/month on highest excess
```
No upper age limit — TFSA room accrues for life. Never a deduction.

**RRSP**

```
── Plan-start year t₀ ────────────────────────────────────────────────
KNOWN available contribution room:
    rrspContribRoomOpen[t₀] = enteredRrspAvailableRoom     // authoritative, verbatim
    rrspUndeductedCarry[t₀] = enteredUndeducted ?? 0
    rrspDeductionLimitOpen[t₀]
        = enteredDeductionLimit
          ?? (rrspContribRoomOpen[t₀] + rrspUndeductedCarry[t₀])   // CRA identity

    // DO NOT add min(0.18 × earnedIncome[t₀−1], dollarLimit[t₀]) in t₀ —
    // the entered figure already reflects it.

    VALIDATION when all three supplied:
        assert |enteredDeductionLimit
                − (enteredRrspAvailableRoom + enteredUndeducted)| ≤ tolerance
        // on failure: surface a validation error; never silently pick one

UNKNOWN available contribution room (⌀):
    rrspContribRoomOpen[t₀] = 0                            // no legal current-year contribution assumed
    roomStatus[t₀]          = "UNKNOWN"

── Every following year t > t₀ ───────────────────────────────────────
    newRoom[t] = max(0,
                     min(0.18 × earnedIncome[t−1], rrspDollarLimit[t])
                     − pensionAdjustment[t−1]
                     − PSPA[t]
                     + PAR[t] )

    rrspContribRoomOpen[t]    = max(0, rrspContribRoomClose[t−1] + newRoom[t])
    rrspDeductionLimitOpen[t] = rrspDeductionLimitClose[t−1] + newRoom[t]

── Within any year (contribute, then deduct) ─────────────────────────
    ownPlanCapacity[t]  = (age[t] ≤ 71) ? rrspContribRoomOpen[t] : 0
        // No contribution to one's OWN RRSP after Dec 31 of the year the owner turns 71.
        // Room still ACCRUES and remains on the ledger — it is simply DORMANT.
        // Batch 0B models only contributor === owner (Erratum 3, Option A), so this room
        // is NOT redirected to a younger spouse; emit a disclosure instead.
        // Spousal RRSP (contributor/annuitant split + 3-year attribution) = §2.7 / Phase 5.

    rrspContribRoomClose[t] = max(0, rrspContribRoomOpen[t] − rrspContributions[t])

    rrspDeductionClaimed[t] ≤ min( rrspDeductionLimitOpen[t],
                                   rrspUndeductedCarry[t−1] + rrspContributions[t] )

    rrspUndeductedCarry[t]     = rrspUndeductedCarry[t−1]
                               + rrspContributions[t]
                               − rrspDeductionClaimed[t]
    rrspDeductionLimitClose[t] = rrspDeductionLimitOpen[t] − rrspDeductionClaimed[t]

── Constants and flags ───────────────────────────────────────────────
    $2,000 lifetime cushion: NEVER added to recommendable room.
        recommendableRoom[t] = rrspContribRoomOpen[t]        // cushion excluded
        penaltyThreshold[t]  = rrspContribRoomOpen[t] + 2000 // penalty modelling only

    reinvestRrspRefund: default FALSE (opt-in); any reinvestment is itself room-capped.
```

**Saved-plan compatibility mapping.** `PersonInput.rrspRoom` (existing) → **`rrspContributionRoomOpen`** — i.e. current **available contribution room**, matching both the field's label and CRA's term. Two new optional inputs: `rrspDeductionLimitOpen?: number | null` and `rrspUndeductedContributions?: number | null`, both defaulting to `null`. When the deduction limit is absent it is **derived** from the identity; when both are present the validation above runs. `PersonInput.tfsaRoom` (existing) → **`tfsaRoomOpen[t₀]`**, used verbatim in the plan-start year. No existing field changes meaning in a way that breaks a saved draft: `null` continues to mean "unknown," but **now resolves to 0 for the plan-start year rather than to the annual limit** — which is the intended correction and will change results for plans that left room blank.

**Tests required (added to Batch 0B).**
- **No double-count:** `tfsaRoom = 25,000`, plan starts 2026 → contributable in 2026 is exactly **$25,000**, not $32,000; and 2027 opening room is `close(2026) + annualLimit(2027) + withdrawals(2026)`.
- **Unknown TFSA:** blank room → engine-generated TFSA contributions in the start year are **$0** (not the annual limit); statutory accrual begins the following January 1; a **client-asserted** `contrib` is still honoured and flagged `unverifiedRoom`.
- **RRSP identity:** with all three inputs supplied and inconsistent, a validation error is raised; with only room supplied, the deduction limit is derived as `room + undeducted`.
- **RRSP start-year authority:** entered room is not augmented by 18% of prior-year earned income in `t₀`; the same earned income **does** create room in `t₀+1`.
- **Deduction ≠ contribution:** a contribution may exceed the amount deducted in the same year, with the difference persisting in `rrspUndeductedCarry` and deductible later.
- **Year-71 (Erratum 3, Option A):** no own-plan contribution accepted after the year the owner turns 71; room **still accrues and remains on the ledger**; the engine does **not** allocate that room to a younger spouse, and a disclosure is emitted when unused room coexists with a spouse aged ≤ 71.
- **PA:** for a pension-plan member with unknown PA **and** unknown room, registered-contribution recommendations are **withheld**; with room supplied, the start year proceeds and later years are flagged `APPROXIMATE`.
- **Cushion:** recommended room never includes the $2,000; a modelled contribution of `room + 1,500` is penalty-free but flagged, and `room + 2,500` attracts the 1%/month penalty on the excess above the cushion.
- **Refund:** `reinvestRrspRefund` defaults false; enabling it routes the refund through the same room clamp.

**Scope.** This erratum changes **input semantics and the opening-year ledger only**. Batch 0A is untouched. The steady-state recursions, the cascade, the per-person requirement, and every other §2.6 rule stand as written.

### Tests

> **Every enforcement test below must state its contribution *source*.** Per Erratum 2, a **client-asserted** contribution and an **engine-generated** one are treated differently when room is unknown. A test that says only "a $50,000 TFSA contribution" is ambiguous and must not be written.

- **Client-asserted contribution, room UNKNOWN:** `AccountInput.contrib = $50,000/yr` into a TFSA with `tfsaRoom = null` in `t₀` → the contribution **remains in the projection at $50,000**; `unverifiedRoom = true`; the tool makes **no claim** that the amount is within room; the client is prompted for their CRA figure. It is **not** re-routed, reduced or penalised **merely because room is unknown**. *(Asserting a re-route here would be wrong — the client is stating a fact about their own life.)*
- **Client-asserted contribution, room KNOWN and exceeded:** `AccountInput.contrib = $50,000/yr` with `tfsaRoomOpen[t₀] = $25,000` → the first $25,000 is within room and the **$25,000 excess is modelled and reported under the explicit over-contribution treatment** (1%/month on the highest excess, cushion rules per §2.6). The excess is **never silently absorbed as if it were legal room**.
- **Engine-generated contribution, room UNKNOWN:** a `goalSaves` / optimizer / recommendation / surplus-sweep request of $50,000 into a TFSA with `tfsaRoom = null` in `t₀` → **$0 may be allocated to the TFSA in `t₀`**; the remainder follows the approved cascade (TFSA → RRSP → non-registered) subject to each destination's own known room; statutory new room begins **January 1 of `t₀+1`**.
- **Unknown-room accrual:** blank room → **`t₀` known room = $0**; **`t₀+1` opening room = the statutory annual limit plus any applicable prior-year withdrawal restoration** (per the Erratum 2 recursion). Blank room is never the current-year annual limit, and never unlimited.
- **Carry-forward:** entered room of $50,000 + N years of accrual is fully usable, then capped.
- **TFSA withdrawal restoration lag:** withdraw $10,000 in year *t*; re-contributing $10,000 in year *t* is refused/penalised; in *t+1* it is allowed.
- **RRSP 71 stop (Erratum 3, Option A):** no contribution to the **owner's own** RRSP accepted after the year the owner turns 71; the owner's room **continues to accrue** and remains visible on the ledger; **no** contribution is auto-allocated to a younger spouse's plan; where unused room coexists with a spouse aged ≤ 71, the disclosure fires. *(There is no "spousal contribution accepted" test in Batch 0B — spousal RRSPs are deferred to §2.7 / Phase 5.)*
- **Per-person:** a couple with two TFSAs uses **both** rooms; savings no longer all land on Person A.
- **Cascade:** a saving larger than TFSA room overflows to RRSP room, then to non-registered, and the sum of allocations equals the requested saving.
- **Optimizer guard:** with room enforced, the optimizer cannot produce a plan whose registered contributions exceed cumulative room in any year (property test over random plans).
## 2.7 Spousal treatment (registered) [G]

Spousal RRSPs, the 3-year attribution rule, and pension-adjustment reversals are **not modelled**. For most retiree plans this is minor; for accumulation-stage couples it matters. **[G]** — schedule post-MVP.

---

---

# 3. LOCKED-IN ACCOUNTS (LIRA / LIF) — pension jurisdiction is king

The original tool's strongest idea, faithfully ported: **the rules follow the pension jurisdiction of the money, not the client's province of residence.** Keep this. What follows tightens the jurisdictional rules themselves, three of which were verified against regulators for v1.2.

## 3.1 Residence vs pension jurisdiction [ok — keep]

- **Rule:** A locked-in account is governed by the jurisdiction of the **pension plan the money came from** — which may differ from where the client lives now. Unlocking %, minimum ages and LIF maximums all derive from it.
- **Now:** Both engines attach `juris` per account and drive unlocking/LIF-max from it. Correct, and rare among consumer tools.
- **Test (exists, keep):** an Ontario LIRA held by a BC resident uses **Ontario** rules (50%), not BC (none).

## 3.2 Unlocking rules by jurisdiction — verified detail

The engine's `UNLOCK_RULES` table is a reasonable skeleton but compresses each jurisdiction to `{pct, minAge, full65?, noMax55?}`. Three jurisdictions were verified against primary sources for v1.2 and are restated precisely below; the rest are marked for verification before they are offered.

### 3.2-FED Federal (PBSA) — **must not be simplified to "50% at 55"** [C: over-simplified]

**Verified (OSFI).** The federal one-time unlocking is a *sequence*, not a percentage:

1. **Age 55+** (the "earlier of age 55 or the earliest retirement age under the plan").
2. The money must first be transferred into a **Restricted Life Income Fund (RLIF)** — a distinct vehicle. A locked-in RRSP/LIRA is **not** eligible directly.
3. Within **60 days of the RLIF's establishment**, up to **50%** may be transferred out to an **RRSP or RRIF** (including a spousal RRSP).
4. The 50% is calculated on the RLIF balance **on the date of the actual withdrawal**.
5. **One-time only, with no carry-forward:** *"If you choose to unlock less than 50% … you will not be able to unlock any more funds under this option at a later date."*

**Other federal unlocking options (currently unmodelled, [G]):** small balance — age **55+** and total locked-in holdings **≤ 50% of YMPE** ($37,300 for 2026); financial hardship — low income (declining scale from 50% YMPE at zero expected income to nil at 75% YMPE = $55,950 for 2026) or high medical/disability costs; shortened life expectancy (physician-certified, full balance); non-residency — ceased Canadian residency **≥ 2 calendar years**, full balance.

**Engine implication:** the `{pct:50, minAge:55}` encoding gets the *arithmetic* right but loses the RLIF requirement, the 60-day window and the use-it-or-lose-it nature — all of which a client would need to act. Model the numbers as-is for the MVP, but the rule record must carry the procedural detail and the UI must state it (§13).

### 3.2-MB Manitoba — **Lovable's finding rejected; two different defects are real** [C: implementation]

**Verified (Manitoba Pension Commission Policy Bulletin #1; Bill 8 in force 1 Oct 2021).**

- **Age 55+:** a **once-in-a-lifetime** transfer of up to **50%** of LIRA/LIF balances to a **prescribed RRIF (PRRIF)**. Where funds come from more than one plan, the transfers must be completed within **30 days**.
- **Age 65+:** *"A LIRA owner who is at least 65 years old may apply … to unlock the balance in one or more of their LIRAs or LIFs."* **No percentage limit and no YMPE ceiling** — the full balance. Manitoba is among the most permissive jurisdictions in Canada.
- **Small balance (any age):** total < **40% of YMPE** ($29,840 for 2026), no spousal consent required.
- Also: financial hardship, shortened life expectancy (≤ 2 years, certified), non-residency (≥ 2 calendar years). Spousal consent generally required otherwise.

**Therefore `full65: true` is CORRECT** as a statement of Manitoba law, and must **not** be removed. Removing it would introduce a new error and would understate a real client option.

**The two genuine Manitoba defects (must-fix):**

1. **The one-shot `_split` flag can permanently block the age-65 full unlock.** In `projection.ts` the unlock branch sets `a._split = true` and the loop begins `if (a._split) continue;`. A Manitoba client who unlocks 50% at, say, 57 is therefore **never** re-evaluated at 65, so the engine silently denies the full unlock that Manitoba law allows. **Fix:** track *how much* has been unlocked per account (a cumulative fraction), not a boolean, and re-evaluate each year against the age-appropriate jurisdictional maximum; the age-55 50% and the age-65 balance-unlock are **separate entitlements**, not one event.
2. **Wrong destination vehicle for the 55+ transfer.** The code moves the unlocked share into an account typed `"RRSP"`. Manitoba directs it to a **prescribed RRIF**. A PRRIF carries **mandatory RRIF minimum withdrawals** (and no maximum); an RRSP has **no** minimum until conversion (default 71). Modelling a PRRIF as an RRSP therefore **understates forced taxable income** for years 55→71 and overstates deferral. **Fix:** introduce a `PRRIF` account type (RRIF minimums, no maximum, pension-income-eligible at 65+) and target it for **Manitoba**. *(Saskatchewan is widely described as using a similar PRRIF mechanism, but it was **not** regulator-verified for v1.2 and is therefore **`UNSUPPORTED`** in Batch 0C — see Erratum 4. The `PRRIF` type built here is reused when SK is verified; no SK behaviour is implemented now.)*

### 3.2-QC Quebec — age gate is right; wording must never imply "no maximum at any age"

**Verified (Retraite Québec, amendments effective 1 January 2025).**

- **Age 55+:** **no maximum** withdrawal. (This is the change; before 2025 a maximum applied.)
- **Under 55:** a **maximum still applies**, now computed by applying a **prescribed rate** directly to the LIF balance, and **temporary income provisions remain** (the temporary-income ceiling was raised to 50% of the MPE less estimated income).
- Age is now determined at the **date of application**, not 31 December of the prior year.
- **LIF → RRSP/RRIF transfers are prohibited at any age** — which is why Quebec's unlock percentage is correctly `0`.

**Engine status:** the code's gate `if (!(jr.noMax55 && age >= 55))` is **correctly age-conditioned** — under 55 it still applies a maximum. **[ok]** The risks are documentation and testing, not logic: the flag's name (`noMax55`) reads like "no maximum," and no test covers it. **Required:** (a) no spec, comment, table or test may state or imply "Quebec has no LIF maximum" without the **55+** qualifier; (b) add a test asserting a maximum **is** applied at 54 and **is not** at 55; (c) the under-55 maximum currently uses the generic annuity-formula approximation rather than Quebec's prescribed-rate formula — **[A]** for MVP, flagged APPROXIMATE, and temporary income is **[G]** unmodelled.

### 3.2-ON / other jurisdictions — status

Ontario (50% via a Schedule 1.1 LIF, Form 5.2 within 60 days of the transfer, one-time per transfer, spousal consent) is the best-documented rule in the codebase and matches the original's research. **Alberta (50% from 50), Nova Scotia (50% @55), New Brunswick (25%), British Columbia (none)** carry the original's headline percentages and were **not** re-verified for v1.2 — they must be marked `APPROXIMATE` until each is confirmed against its regulator. **Saskatchewan, Newfoundland & Labrador, PEI and the territories are absent from `UNLOCK_RULES` entirely.** Saskatchewan is the highest-value backfill — it is *reported* to be the most permissive regime (LIRA/LIF → PRRIF with effectively full access) — but that description is **unverified context, not an implementation instruction** (Erratum 4). Any jurisdiction not verified must be **`UNSUPPORTED`** and refused, not defaulted to Ontario. **The current fallback `UNLOCK_RULES[juris] ?? UNLOCK_RULES.ON` silently applies Ontario law to unknown jurisdictions and must be replaced by an explicit failure.** **[C]**

## 3.3 LIF minimums [ok] and LIF maximums [C for non-Ontario]

- **Minimums:** the RRIF minimum table applies. **[ok]**
- **Maximums:** the reason locked-in money constrains a plan.
  - **Ontario:** uses the published **FSRA table** — exact. **[ok]**
  - **All other jurisdictions:** an **annuity-formula approximation** at a 6% reference rate. Real maximums are set per regulator with their own reference-rate mechanics (federal uses the greater of the formula and the prior year's return; Quebec now uses a prescribed rate; others differ). **[C]** for any client whose plan is LIF-bound outside Ontario.
- **Fix:** published maximum tables per jurisdiction; retain the formula only as an explicitly labelled `APPROXIMATE` fallback, surfaced in the UI.
- **Tests:** ON max matches FSRA at ages {55, 65, 75, 85}; QC has a max at 54 and none at 55+; max ≥ min at every age (existing test, keep); a LIF-bound plan sets `lifBound`.

## 3.4 Conversion rules & timing [ok]

LIRA/DCPP → LIF at retirement (or an explicit age); RRSP → RRIF by 71; RRSP drawable without conversion. `convAgeOf` is correct. Conversion *timing* is an optimizer lever (§9), not merely a default.

## 3.5 Unlocking as a modelled, recommendable event [ok — promote to a lever]

Unlocking is a client decision with permanent consequences, correctly modelled as a plan action rather than an automatic default. Promote it to a first-class optimizer lever (§9.4) **after** defect 3.2-MB.1 is fixed, since the optimizer must be able to evaluate "unlock 50% at 55" *and* "unlock the balance at 65" as distinct, sequential options.
# 4. CPP (Canada Pension Plan)

## 4.1 Early / delayed CPP [ok]

- **Goal:** Adjust the age-65 entitlement for the actual start age.
- **Formula:** −0.6%/month before 65 (min age 60 → −36%); +0.7%/month after (max age 70 → +42%). Both engines: `cppFactor` correct and clamped to 60–70.
- **Annual?** The adjustment percentages are structural; the **maximum** ($18,091.80/yr in 2026) and the average indexed to wages/CPI annually.
- **Residence/jurisdiction:** national (except Quebec → **QPP**, similar but distinct amounts/rules — a Quebec gap, §1.2). **[G]**
- **Tests:** start 60 → 64% of the 65 amount; start 70 → 142%; clamp outside 60–70.

## 4.2 Input model & the "amount at 65" convention [G — enhancement vs. entitlement]

- **Now:** CPP is entered as the **age-65 amount** then scaled by `cppFactor` and indexed. The Lovable **estimator** (`estimateCppAt65`) is a real improvement: it maps an earnings level (max / above-avg / average / partial) to a share of the max, anchored to the **published average new benefit**. Good for clients who don't know their number.
- **Gap:** neither models the **post-2019 CPP enhancement** ramp (the max is rising in real terms for younger cohorts) nor the **drop-out provisions**. For clients currently near retirement, the "enter your Service Canada estimate" path is accurate; for younger clients the enhancement matters. **[G]** — acceptable MVP if the tool nudges users to their Service Canada estimate.
- **Tests:** estimator "average" ≈ published average new benefit; "max" = the annual max.

## 4.3 Separate spouse start ages [engine ok — **lever forces both spouses to one age** [C for advice]]

Three distinct statements, which v1.1 wrongly collapsed into one `[ok]`:

1. **The data model supports separate ages.** `PersonInput.cpp.age` is per person; `projection.ts` reads `p.cpp.age` inside a per-person loop. **[ok]**
2. **The current lever does *not* optimize them separately.** `levers.ts → leverOverride()` builds `o.mods = (people) => { for (const p of people) { if (cppAge != null) p.cpp.age = cppAge; … } }` — a **single** `cppAge` written to **every** person. The UI therefore cannot express, and the optimizer cannot discover, "A takes CPP at 60, B defers to 70." **[C for advice quality]**
3. **The production optimizer must search CPP-A and CPP-B independently.** With annual granularity each spouse has **11** admissible start ages (60…70), so the couple search space is **11 × 11 = 121 combinations** — trivially enumerable by full re-simulation (§9.5).

**Why asymmetry is usually right, not an edge case.** The optimum is frequently asymmetric because (a) CPP deferral is an inflation-indexed, longevity-hedged annuity that is worth most to the spouse with the **longer life expectancy**; (b) the **survivor's** combined-benefit ceiling (§4.4) means a large deferred pension in *both* hands is partly wasted on the first death; (c) the spouses usually have **different** own-CPP amounts, retirement dates and bridge income, so their low-income "melt windows" differ. Forcing one age destroys exactly the flexibility that makes CPP timing valuable.

**Tests:** a constructed couple where the joint optimum is asymmetric (e.g. A@60, B@70) must be found by the optimizer and must beat every symmetric pairing; a test asserting the search evaluates all 121 combinations (or a documented pruned subset with the pruning rule stated).

## 4.4 CPP survivor's pension [ok — this is a highlight]

- **Goal:** The survivor's CPP benefit on the first death.
- **Correct methodology (both engines implement it):** based on the **deceased's calculated retirement pension at 65** (not their reduced/enhanced actual amount):
  - survivor **65+** → **60%** of it;
  - survivor **45–64** → **flat-rate portion + 37.5%** of it;
  - survivor **35–44** → same, reduced 1/120 per month under 45;
  - under 35 (no child/disability) → none;
  - then capped at the **survivor maximum**, then at the **combined** survivor-plus-own maximum ($1,531.56/mo in 2026).
- **This is more correct than most consumer tools** and should be preserved verbatim. Verified 2026 amounts: flat-rate $238.17/mo, max survivor under-65 $803.54/mo, 65+ $904.59/mo, combined $1,531.56/mo, death benefit $2,500.
- **Subtle caveat [A]:** the "deceased's calculated pension at 65" is approximated by the **entered age-65 amount inflated** — correct given the input model. The combined-max interaction with the survivor's *own* enhanced/deferred pension is approximate.
- **Tests (already in the Lovable suite — keep):** 60% at 65+; flat+37.5% at 45–64; 1/120 reduction 35–44; zero under 35; combined-max cap binds for a survivor with a large own pension; $2,500 death benefit once.

## 4.5 CPP optimization methodology [replace the heuristic — §9]

- **Now:** two mechanisms exist and both are inadequate. The "find the best" grid sweep tests ages 60–70 but writes the winner to **both** spouses (`g('cppAge').value = b.x; if (couple) g('cppAgeB').value = b.x;` in the original; the same single-value `mods` in Lovable). The lever is the same. Neither can produce an asymmetric answer, and neither evaluates CPP jointly with OAS or with the withdrawal plan.
- **Correct objective:** lifetime after-tax household outcome (§9.0), evaluated by **full re-simulation**, searched **jointly** over `cppStart[A] × cppStart[B]` and interacting with OAS timing (§5.4), RRSP melt (§9.3) and the survivor benefit.
- **Tests:** deferral beats age-60 in the bridge-income fixture; the asymmetric-optimum fixture above; the chosen pair is stable under small return perturbations (or the instability is reported as low confidence, §10.1).

---

# 5. OAS (Old Age Security)

## 5.1 Eligibility & the residence proration [G]

- **Correct:** Full OAS needs **40 years of Canadian residence after 18**; otherwise it is prorated in 1/40ths (min 10 years to receive anything). The Lovable `estimateOasAt65(residenceYears)` models the 1/40 proration — a real improvement over the original.
- **Gap:** neither models the 10-year minimum threshold explicitly, nor non-resident/social-agreement cases. **[G]**
- **Tests:** 40 years → full; 20 years → half; <10 → none (add this guard).

## 5.2 Deferral & the 75+ increase [ok]

- **Deferral:** +0.6%/month past 65 to max +36% at 70 (`oasFactor`, correct, no early option before 65).
- **75+ bump:** +10% permanent increase at 75 — both engines apply `×1.10` at 75+. **[ok]**
- **Tests:** defer to 70 → +36%; automatic +10% at 75; no OAS before 65.

## 5.3 Clawback (recovery tax) [ok — see §1.12]

Individual, 15% over the threshold, capped at OAS received. The **planning value** is that TFSA withdrawals and income smoothing reduce it — the optimizer should exploit this (it's a key reason to melt RRSPs early or lean on the TFSA in spike years). Correct in both; make it a first-class optimization signal (§11).

## 5.4 Separate spouse OAS ages & optimization [same defect as CPP — [C for advice]]

Identical structure to §4.3, and the **same** loop is responsible: `if (oasAge != null) p.oas.age = oasAge;` inside `for (const p of people)`.

1. **Data model:** `PersonInput.oas.age` is per person. **[ok]**
2. **Lever:** forces both spouses to a single OAS age. **[C]**
3. **Production optimizer:** must search **OAS-A and OAS-B independently** — **6** admissible ages each (65…70) → **36** combinations, and then **jointly with CPP**, because both feed the same taxable-income stream that drives the clawback.

**Why OAS especially cannot be optimized standalone.** The OAS recovery tax is **individual** and depends on that spouse's total income — which is itself a function of their CPP start age, their RRIF minimums, and the withdrawal mix the plan chooses. Deferring OAS raises the benefit **and** shifts income between years, so the clawback-optimal answer only emerges from full simulation. A naive full joint enumeration is `121 (CPP) × 36 (OAS) = 4,356` re-simulations — still cheap (§9.5), but §9.3 prescribes a staged search with pruning rather than blind enumeration.

**Tests:** an asymmetric OAS optimum is discoverable; a high-income spouse's optimal OAS age differs from a low-income spouse's in the same household; deferring OAS reduces modelled clawback in the constructed fixture.

---

# 6. NON-REGISTERED ACCOUNTS

> **Rewritten for v1.2.** The current return model conflates *total return* with *taxable distributions* and switches taxation off entirely in loss years. Both are wrong, and the second is a real client-facing error.

## 6.1 Return decomposition [C — loss years produce zero taxable income]

- **The defect (confirmed):** `projection.ts` computes `growth = a.bal * rate` and then `if (a.type === "NONREG" && growth > 0) { … accrue interest and dividends … } else { /* loss years: no taxable yield */ a.bal += growth; }`. In any year with a negative **total** return, the account accrues **no interest and no dividend income at all**.
- **Why that is unsound:** interest and dividends are paid out of the *portfolio's cash flows*, not out of its price appreciation. A balanced portfolio in a −10% year still receives bond coupons and equity dividends; the −10% is the **net** of a positive yield and a larger negative **price** move. The current model gives the client a tax holiday exactly when markets fall, understating tax in bad years and (in a shock scenario, §7) understating the damage a downturn does to an after-tax plan. It also interacts badly with the market-shock scenario feature, which is *designed* to produce negative years.
- **Correct methodology — decompose the return, do not derive distributions from it:**

```
totalReturn[t]        = priceReturn[t] + interestYield + eligDivYield + nonEligDivYield + cgDistYield + rocYield
taxable this year     = interestYield            → 100% ordinary income
                      + eligDivYield             → gross-up 1.38, credit 15.0198% fed + prov
                      + nonEligDivYield          → gross-up 1.15, credit 9.0301% fed + prov
                      + cgDistYield × inclusion  → realized capital-gains distributions (T3/T5008)
not taxable this year = rocYield                 → return of capital: REDUCES ACB, taxed later as gain
                      + priceReturn              → unrealized until disposition
```
Yields are **non-negative rates applied to the account balance**, independent of the sign of `priceReturn`. `priceReturn` may be negative (and is what a market shock should move). Reinvested distributions **increase ACB** (they have already been taxed); ROC **decreases ACB**.

- **Inputs:** per-account yield vector `{interest, eligDiv, nonEligDiv, cgDist, roc}` plus an expected `priceReturn`, or (simpler, backward-compatible) keep today's single `ret` and a `mix`, but apply the mix to a **yield component that is floored at zero** while the price component absorbs the negative. State which convention is used; the first is preferable and testable.
- **Tests:** a −10% total-return year with a 2% interest yield still produces **taxable interest income**; a market shock reduces balance **and** still taxes distributions; ROC reduces ACB and produces no current income; the sum of components reconciles to the modelled total return.

## 6.2 Non-eligible dividends [G — unsupported]

Only **eligible** dividends exist in the model (`mix.div` → `eligDiv`). Clients holding CCPC shares or funds distributing non-eligible dividends are **under-taxed**. Correct 2026 treatment: gross-up **15%**, federal credit **9.0301%** of the grossed-up amount, provincial credits differ from eligible. Add `nonEligDiv` as a first-class component (§6.1) and default new plans to 100% eligible so existing results are unchanged. **[G]**, rising to **[C]** for business-owner clients.

## 6.3 ACB mechanics: floor, ROC and negative ACB [G]

- **Now:** ACB rises with reinvested interest/dividends and falls proportionally on withdrawal: `a.acb -= take - gain`. There is **no floor at zero** and **no ROC**.
- **Correct:** ROC distributions reduce ACB; if cumulative ROC drives ACB **below zero**, the negative amount is **immediately realized as a capital gain** and ACB resets to zero. Without ROC modelling this cannot occur today, but once ROC is added the floor rule is mandatory — otherwise the model produces negative ACB and, later, a phantom loss.
- **Also:** the proportional-gain realization model (`gain = withdrawal × (bal − acb)/bal`) remains an accepted planning approximation **[A]**; real dispositions use average cost per unit. Disclose.
- **Tests:** ROC reduces ACB dollar-for-dollar; ACB never goes negative; the excess is realized as a gain in the year it occurs; a full liquidation realizes exactly `bal − acb`.

## 6.4 Capital losses & carry-forwards [G]

Neither engine models **capital-loss carry-forwards**. A realized loss (a withdrawal or asset sale below ACB) currently produces a *negative taxable gain* contribution or is simply absent, rather than being carried forward to offset future gains (net capital losses carry back 3 years and forward indefinitely, deductible **only against capital gains**). **Required behaviour:** track a per-person `netCapitalLossCarryForward`; a realized loss adds to it; a realized gain is reduced by available carry-forward before the inclusion rate is applied; losses **never** offset ordinary income. **[G]** — material for shock scenarios and downsizing.
- **Tests:** a loss year followed by a gain year taxes the net, not the gross; a loss never reduces tax on interest/pension income; the carry-forward balance survives across years.

## 6.5 Joint accounts & attribution [A — 50/50 default; make the assumption explicit]

- **Now:** joint non-registered income splits **50/50** between spouses, and passes wholly to the survivor on the first death. Correct as a planning default and correct on survivorship.
- **The law:** income on a joint account is attributed **by the source of the contributed capital**, not by the account title. Where one spouse funded the account, CRA's attribution rules can tax that income back to the contributor; a genuine 50/50 split requires both to have contributed. Sophisticated cases (spousal loans at the prescribed rate, gifted capital) are out of MVP scope.
- **Required:** keep 50/50 as the default but expose an explicit **attribution split** per joint account (default 50/50), and disclose the assumption in the UI. **[A]** for MVP; the input makes the later fix non-breaking.
- **Tests:** joint income appears half on each return by default; a 70/30 attribution input is respected; after the first death 100% flows to the survivor; **(new)** joint attribution has **no** direct test today — add one.
# 7. RETIREMENT CASH FLOW

This is the yearly loop that ties everything together. Both engines share the same, well-ordered sequence (rollover → unlock → guaranteed income → growth → contributions → lumps → mandatory minimums → scheduled withdrawals → assets → liabilities → spending target → **solve discretionary draw**). The order is sound; the issues are in the solve objective and a few pieces.

## 7.1 After-tax spending requirement [ok; pre/post improvement in Lovable]

- **Goal:** The household's **after-tax** spending need, inflated.
- **Now:** A single `spendNeed` (today's $) inflated each year. Lovable adds `currentSpend` — a **separate pre-retirement spending level** used until everyone alive has retired — a real improvement (accumulation years rarely equal retirement spend). **[keep]**
- **Enhancement [G]:** real retirement spending is not flat — a "go-go / slow-go / no-go" decline (and a late-life care spike) is standard practice. Support an optional spending curve. Disclose the flat-real default.
- **Tests:** spend target inflates correctly; pre-retirement uses `currentSpend`; the switch happens at the last retirement date.

## 7.2 Inflation [ok] — one rate, applied to spending, benefits (indexed), brackets (should be, §1.13). Support a separate benefit-indexation vs price-inflation rate later. **[A]**

## 7.3 Guaranteed income [ok] — CPP, OAS, DB pension, bridge, other income assembled per person with correct timing (bridge from retirement to its end age; OAS/CPP at their start ages). Correct. **Note (Erratum 1):** the bridge is fully taxable ordinary income here and remains so; it is excluded from `pensionEligible` by default (§1.5 Erratum 1) — the timing and taxation logic in this section is unchanged.

## 7.4 Account withdrawals — mandatory then discretionary [ok mechanics; objective = §11]

- **Mandatory** RRIF/LIF minimums are forced (taxable) whether or not needed — correct, and a key reason to *melt* early.
- **Discretionary** draw is solved by **binary search** for the smallest gross withdrawal, taken in the strategy's account order, that nets the after-tax spending target. Household after-tax cash is monotonic in the gross draw, so the search converges — this is a clean, correct mechanism. **The limitation is the fixed account order** feeding it (§11).
- **Tests:** solved after-tax cash = spending target (within tolerance) whenever assets suffice; mandatory minimum still taken when spending is already met (creating surplus/taxable income).

## 7.5 Account sequencing [C-adjacent — the core design limitation]

- **Now:** `strategyOrder` returns one of four **lifetime-fixed** orderings (nonreg→reg→tfsa, reg→nonreg→tfsa, tfsa→nonreg→reg, prorata). "Auto" picks whichever single ordering scores best over the **whole plan**. **This is the central thing to replace** (§11): the optimal sequence is **year-specific** — e.g. melt RRSP in low-income years 60–64, switch to non-reg/TFSA once CPP/OAS/RRIF income arrives, use TFSA to shave clawback spikes. A single lifetime order cannot express this.
- **Tests:** a plan where year-varying withdrawal beats every fixed order (proves the limitation and, later, the fix).

## 7.6 Annual tax recalculation [ok] — tax is recomputed every year on that year's actual income, inside the solver. Correct and essential.

## 7.7 Shortfalls & surplus [ok mechanics; surplus handling is a gap]

- **Shortfall** = `max(0, spendTarget − afterTax)`, tracked per year with a `lifBound` flag distinguishing "locked-in maximum bit" from "money actually ran out." Good.
- **Surplus [G]:** when guaranteed income plus forced RRIF/LIF minimums **exceed** the spending need, the excess after-tax cash is **not reinvested** — it is counted in `afterTax` but added to no account, so it silently leaves the balance sheet. Over a long retirement with large forced minimums this **understates the estate**. **Fix:** sweep surplus after-tax cash to TFSA (to room — now enforceable per §2.6) then non-registered, adding to ACB.
- **Tests:** a forced-minimum surplus year raises TFSA/non-reg balances rather than vanishing; the sweep respects TFSA room; shortfall years remain flagged.

## 7.8 Estate value [C — and it **selects the withdrawal strategy**]

- **The defect:** `afterTaxEstate()` applies flat haircuts to ending balances — TFSA ×1.00, non-registered ×0.92, registered ×0.62 — instead of computing a terminal return (§1.15).
- **Why v1.2 escalates it.** In `engine.ts → runPlan()`, when `strategy === "auto"` the engine simulates all four fixed orderings and selects with:
  `if (!best || short < best.short || (short === best.short && est > best.est))` where `est = afterTaxEstate(P)`.
  **The crude haircut is therefore the tie-breaker that chooses the client's withdrawal strategy** whenever two orderings produce the same number of shortfall years — which is the *common* case for a well-funded plan (all four orderings fund every year, so `short` ties at 0 and the haircut decides). The inaccuracy is not confined to a displayed number; it **propagates into the recommended plan**.
- **Direction of the bias:** the flat 0.62 registered haircut is a fixed ~38% assumed terminal rate. For a large ending RRIF the true terminal rate is usually **higher** (collapsing it in one year drives income into top brackets), so the proxy **overvalues** ending registered balances and therefore **systematically favours orderings that leave registered money to the end** — exactly the orderings a real terminal-return calculation would penalise. The engine can thus recommend TFSA-first/registered-last when registered-first would leave the family better off after tax.
- **Fix:** implement the terminal return (§1.15) and use it — not a haircut — as the tie-break. Until then, the tie-break must be labelled `APPROXIMATE` in the UI wherever the auto-selected strategy is shown.
- **Tests:** a fixture where two orderings tie on shortfall years and the terminal-return calculation reverses the haircut's preferred ordering (proves the propagation); assert `runPlan` selects the ordering preferred by the *terminal-return* estate once implemented.

---

# 8. COUPLES

The couple *mechanics* are a genuine strength; the *tax-at-death*, *room* and *per-spouse optimization* pieces are the weaknesses. Rows changed in v1.2 are marked ▲.

| Aspect | Status | Notes |
|---|---|---|
| Separate income per spouse | **[ok]** | Own employment, CPP, OAS, DB, other income. |
| Separate accounts & owners | **[ok]** | A / B / JOINT. |
| Joint accounts | **[A]** ▲ | Non-reg joint = 50/50 income, wholly to survivor on death. Legal attribution follows contributed capital — expose an attribution split (§6.5). |
| Separate retirement dates | **[ok]** | Independent `retAge`; spending switches to the retirement level when the **last** working spouse retires. |
| Separate CPP/OAS **inputs** | **[ok]** | `PersonInput.cpp.age` / `.oas.age` are per person and the projection reads them per person. |
| Separate CPP/OAS **optimization** | **[C]** ▲ | `levers.ts → leverOverride()` writes one `cppAge`/`oasAge` to **every** person. Neither the UI nor the sweep can produce an asymmetric answer. Production optimizer must search **11×11 = 121** CPP pairs and **6×6 = 36** OAS pairs, jointly (§4.3, §5.4, §9.3). |
| Pension income splitting | **[C]** | Search capped at **25%** of eligible pension (double-50% bug) **and** counts plain RRSP withdrawals as eligible (§1.5). Gating to married/common-law is correct. |
| Contribution room across spouses | **[C]** ▲ | Room is **not enforced anywhere** (§2.6); the savings lever hardcodes `owner: "A"`, so couple savings all land on one spouse. |
| Death of first spouse | **[partial]** | Balances and joint accounts roll to the survivor; CPP survivor benefit computed; **terminal tax not computed** (§1.15). |
| Registered rollover | **[ok balances / C tax]** | Rollover of balances is correct; no terminal return on either death. |
| Survivor pensions | **[ok]** | CPP survivor (§4.4) + `survivorPct` of DB pension; OAS ends. |
| Taxation after first death | **[ok]** | Survivor files single; splitting stops; one OAS. |
| Spousal RRSP / attribution | **[G]** | Not modelled (§2.7); 3-year attribution rule absent. |

**Couple edge cases that must be tested:** first death before either retires; first death after RRIF conversion (survivor inherits a large RRIF → higher forced minimums, then a larger terminal tax); both deaths in the same year (rollover order matters); **"partners" (neither married nor common-law) → no splitting, no CPP survivor benefit, and no spousal rollover — all three must fire together**; an asymmetric CPP/OAS optimum (§4.3); couple savings allocated across **both** rooms (§2.6).
# 9. OPTIMIZATION ENGINE (the part to rebuild)

> The brief is explicit: *"The optimization engine should not merely choose between several predetermined lifetime withdrawal orders. It should be capable of changing the withdrawal mix from year to year when doing so improves the client's lifetime outcome."* This section specifies that engine. Everything above is the **simulator**; this is the **planner** that drives the simulator.

## 9.0 Objective function (decide this first)

Every optimization needs one scalar to maximize. Recommended default and the honest trade-offs:

- **Primary:** maximize **lifetime after-tax spending actually funded** (the plan meets the goal in every year) — i.e. **feasibility first**: no shortfall years.
- **Secondary (tie-break among feasible plans):** maximize **after-tax estate at plan end** computed with the **real terminal return** (§1.15), *not* the flat-haircut proxy — otherwise the optimizer games the proxy.
- **Alternative objective the user should be offered:** minimize **lifetime tax** — but note tax minimization ≠ wealth maximization (deferring tax past death can *raise* lifetime tax while *raising* the estate). Expose the objective as a client choice; never hardcode "lowest tax = best."
- **Guardrails:** the optimizer must respect the client's stated constraints (desired spending, bequest target, "don't work past 65", "no unlocking") as hard constraints, and only optimize inside them.

## 9.1 Why fixed lifetime orders fail

Consider a 60-year-old retiree, large RRSP, CPP/OAS deferred to 70, small non-reg, TFSA. The lifetime-optimal plan is roughly: **ages 60–69** draw heavily from the RRSP/RRIF to *fill the low brackets* while CPP/OAS are off and no other income exists (RRSP-meltdown / bracket-filling); **age 70+** CPP+OAS+RRIF-minimums arrive, so switch to **TFSA/non-reg** to avoid stacking income and triggering OAS clawback. **No single lifetime ordering expresses "reg-first then reg-last."** The current "auto" picks one and lives with it.

## 9.2 The dynamic decumulation model

Treat each projection **year** as a decision with a small set of control variables:

- `x_reg[t]` — taxable registered draw beyond the forced minimum (RRSP/RRIF/LIF, subject to LIF max)
- `x_nonreg[t]` — non-registered draw
- `x_tfsa[t]` — TFSA draw
- `convert[t]` — convert some/all RRSP→RRIF this year (unlocks pension credit/splitting, starts minimums)
- `unlock[t]` — one-time LIRA→RRSP unlock (per jurisdiction)
- plus the **once-per-plan** structural choices: `cppStart[A], cppStart[B], oasStart[A], oasStart[B], retAge[A], retAge[B]`.

Constraint each year: after-tax cash from `(guaranteed income + forced minimums + x_reg + x_nonreg + x_tfsa − tax)` = spending target (or as close as assets allow). Maximize the §9.0 objective over the whole horizon.

## 9.3 Recommended solution method (practical, not academic)

A full dynamic-programming/optimal-control solve is overkill and slow. A **tax-bracket-filling greedy with limited look-ahead**, wrapped in a coarse search over the structural choices, captures ~all the value:

1. **Outer loop (structural, small grid):** search `retAge`, and each spouse's `cppStart`/`oasStart` over their legal ranges, plus a few `convert`/`unlock` timing options. This is a modest grid (e.g. CPP 60–70 × OAS 65–70 × unlock{now, at conversion, never}) evaluated by full re-simulation. Prune dominated branches.
2. **Inner loop (annual sequencing, deterministic rule):** within each simulated year, instead of a fixed account order, choose the draw mix by a **bracket-filling rule**:
   - Always take forced minimums first.
   - If spending still needs funding, draw **registered income up to the top of a target marginal bracket** (e.g. fill to the top of the first/second bracket, or up to the OAS-clawback threshold), because that income is "cheap."
   - Fund any remaining need from **non-registered**, then **TFSA** (TFSA last preserves tax-free compounding and clawback headroom) — *unless* drawing registered would cross into clawback/high-bracket territory, in which case prefer TFSA/non-reg to **stay under the threshold**.
   - In **low-income years (e.g. 60–70 before CPP/OAS)** deliberately draw **extra** registered income to fill unused low brackets even beyond the spending need (a **melt**), sweeping the surplus into TFSA→non-reg. Bound the melt so it never *creates* an OAS clawback or pushes into a higher bracket than the client will face later.
3. **Look-ahead check:** the "how much to melt" decision needs a one-pass estimate of future forced-minimum income (post-71 RRIF minimums, CPP, OAS). Compute each person's projected 71+ taxable "income floor" once, and melt in the 60–70 window only to the extent it **levels** lifetime taxable income (income-smoothing objective).
4. **Verify by simulation, never by formula:** every candidate plan (structural grid point × the annual rule) is scored by a **full deterministic re-simulation** through the existing engine. The optimizer *chooses*; the simulator *scores*. This keeps the optimizer honest and testable.

## 9.4 The specific levers the optimizer must decide

| Lever | Decision | Signal it exploits |
|---|---|---|
| Best withdrawal mix (per year) | §9.2/9.3 | bracket filling, clawback avoidance |
| Withdraw registered early on purpose | melt in low-income years | unused low brackets before CPP/OAS |
| Tax-bracket filling | draw reg to top of a target bracket | flat marginal cost of "cheap" income |
| RRSP meltdown | multi-year melt 60–71 | levelling lifetime taxable income |
| RRSP→RRIF conversion timing | `convert[t]` | pension credit/splitting at 65; forced minimums |
| CPP timing (per spouse) | outer grid | deferral credit vs longevity vs survivor benefit |
| OAS timing (per spouse) | outer grid | +0.6%/mo, 75+ bump, clawback |
| Retirement age | outer grid | savings years vs decumulation years |
| Additional savings | pre-retirement allocation | RRSP-vs-TFSA-vs-nonreg by bracket |
| TFSA vs RRSP vs non-reg saving | by current vs expected retirement bracket | classic cross-over rule |
| Spending capacity | solve max sustainable spend | feasibility frontier |
| Downsizing | asset event → free equity to non-reg | one-time liquidity |
| Locked-in unlocking | `unlock[t]` per jurisdiction | frees LIF-max-trapped money |
| Combinations | the whole search | interactions dominate single levers |

## 9.5 Performance

Full re-simulation is cheap (a projection is microseconds-to-milliseconds of pure arithmetic). The outer grid is small (hundreds of points). Keep everything deterministic and synchronous; memoize the structural grid. This is well within a browser's budget — the original already runs dozens of re-simulations per interaction.

## 9.6 What to keep from today

The **binary-search "solve the draw that meets spending"** mechanism and the **grid sweeps** are correct building blocks — the new optimizer *reuses* them. The **pension-splitting search** is a good *idea* to reuse but only **after** its 0–50% range is fixed (§1.5 Bug B); until then it under-splits and would feed the optimizer wrong tax deltas. The one design being retired is "one fixed lifetime order for the whole plan."
---

## 9.7 Per-spouse independence in the structural search (v1.2 requirement)

The outer structural grid (§9.3 step 1) must treat **each spouse's benefit start ages as independent decision variables**. This is a hard requirement, not an optimization refinement, because the current implementation cannot express an asymmetric answer at all (§4.3, §5.4).

**Decision variables and search sizes (annual granularity):**

| Variable | Range | Values | Couple combinations |
|---|---|---|---|
| `cppStart[A]`, `cppStart[B]` | 60–70 | 11 each | **11 × 11 = 121** |
| `oasStart[A]`, `oasStart[B]` | 65–70 | 6 each | **6 × 6 = 36** |
| CPP × OAS jointly | — | — | 121 × 36 = **4,356** |
| `retAge[A]`, `retAge[B]` | client-bounded | ~5–8 each | multiplies further |
| `convert[t]` (RRSP→RRIF) | 60–71 | ≤12 | per person |
| `unlock` | {none, 50% @ earliest, balance @ 65 where permitted} | ≤3 | per locked-in account |

**Practical search strategy.** Blind enumeration of the full cross-product is unnecessary. Use a staged search, and state the pruning rule in the code and the UI:

1. **Stage 1 — coordinate descent from a sensible seed.** Start from the client's entered ages. Optimize `cppStart[A]` holding all else fixed, then `cppStart[B]`, then `oasStart[A]`, `oasStart[B]`, then repeat until no single-variable change improves the objective. Cheap, and finds most asymmetric optima.
2. **Stage 2 — full 121-point CPP sweep for couples.** Because CPP interacts with the survivor's combined-benefit ceiling (§4.4), coordinate descent can stop at a local optimum. Enumerate all 121 CPP pairs at the Stage-1 OAS/retirement choices. This is ~121 full re-simulations — milliseconds (§9.5).
3. **Stage 3 — 36-point OAS sweep** at the Stage-2 CPP optimum, then one confirming Stage-1 pass. Escalate to the full 4,356 cross-product only when Stages 2 and 3 disagree with Stage 1 (rare; log it when it happens).
4. **Every candidate is scored by full re-simulation** through `projection()` against the §9.0 objective. The optimizer never estimates a benefit analytically.

**Why the survivor benefit forces joint evaluation.** Deferring CPP to 70 for *both* spouses can be wasteful: on the first death the survivor's own pension plus the survivor's pension is capped at the **combined maximum** (§4.4), so a portion of the deceased's deferral premium is lost. The optimal pair therefore frequently defers the *longer-lived / lower-CPP* spouse and starts the other earlier — a solution the current single-age lever cannot represent.

**Required tests:** an asymmetric fixture where the joint optimum (e.g. A@62, B@70) strictly beats **every** symmetric pair; a fixture where Stage-1 coordinate descent alone finds a *worse* answer than the Stage-2 sweep (justifying the sweep); a property test asserting the optimizer never returns a plan whose registered contributions breach room (§2.6) or whose LIF draw breaches the jurisdictional maximum (§3.3).
# 10. RECOMMENDATION ENGINE (calculations → client-friendly advice)

The optimizer produces the *optimal plan*; the recommendation engine explains the **difference between the client's current plan and a better one**, in plain language, with numbers. Both codebases already have the seed of this (the original's "smart strategy cards," Lovable's `buildRecommendations` / `simulateLevers`), but recommendations must always come from **actual scenario re-simulation**, never a templated sentence.

## 10.1 Required shape of every recommendation

Each recommendation object:

```
{
  id,
  title,                // "Melt your RRSP between 61 and 64"
  reason,               // why, in one plain sentence
  action,               // the concrete change applied to the plan
  dollarImpact,         // lifetime after-tax $ (estate or spending), from re-simulation
  taxImpact,            // lifetime tax Δ, from re-simulation
  fundingImpact,        // change in plan-funded % / shortfall years
  tradeoff,             // what it costs (less liquidity, work longer, less to estate...)
  confidence,           // high/med/low + the assumptions it leans on
  yearsAffected,        // e.g. ages 61-64
  assumptions           // explicit list (returns, inflation, indexation, longevity)
}
```

**Non-negotiable rule:** `dollarImpact`, `taxImpact`, and `fundingImpact` are computed by running the **current plan** and the **plan-with-this-change** through the engine and differencing. The example in the brief —
> *"Withdraw ~$25,000/yr from your RRSP between 61–64. This fills a lower tax bracket before CPP/OAS/RRIF income begins and is projected to reduce lifetime tax by $XX,XXX."*
— is the right **shape**, but the "$25,000" and the "$XX,XXX" must be **solved for this client**, not assumed. For one client the bracket-fill number is $25k; for another it's $12k or $40k.

## 10.2 How the numbers get honest

- **Isolate then combine.** Report each lever's standalone impact *and* the combined impact of the recommended bundle (levers interact; the sum of standalones ≠ the bundle). Lovable's `simulateLevers` already isolates each lever and scores the combination — keep and extend this pattern.
- **Confidence & assumptions.** A recommendation that depends on the client living to 95, or on a 6.5% equity return, must say so. Tag sensitivity (e.g. "holds if you live past ~82").
- **Trade-offs are mandatory.** "Retire 2 years earlier" must state the estate/feasibility cost. "Spend more" must state that unspent money would otherwise be a bequest (a legitimate goal for some clients).
- **No misleading 'better' signals.** (Original bug, already noted and fixed once): do not show a rising **estate** number as "improvement" when the client spent less of their own money; report the change against the *chosen objective* (§9.0).

## 10.3 Recommendation catalogue (each = a plan diff, re-simulated)

Melt-the-RRSP (bracket fill in low-income years) · Delay/advance CPP (per spouse) · Delay OAS (per spouse) · Convert RRSP→RRIF at 65 for the pension credit/splitting · Unlock locked-in money (per jurisdiction) · Shift savings TFSA↔RRSP↔non-reg by bracket · Save $X more/month · Retire ±N years · Trim/expand spending to the sustainable frontier · Downsize the home at age X · Use the TFSA to shave OAS-clawback spikes · Order-of-death / survivor-income resilience check. Each returns the §10.1 object from real re-simulation.

---

---

# 11. FINDINGS SUMMARY

## 11.1 Critical errors — fix before the tool is used with a real client [C]

Ordered by client impact. Items marked ▲ are new or escalated in v1.2.

| # | Defect | Effect | §|
|---|---|---|---|
| 1 ▲ | **Contribution room is not enforced anywhere in the core engine** | Models and *recommends* legally impossible contributions (e.g. $50k/yr into a TFSA, forever); inflates estate and funded score; will be exploited by the optimizer | §2.6 |
| 2 | **Pension splitting capped at 25%** of eligible pension (double-50%) | Couples silently under-split → household tax overstated; splitting-dependent strategies under-valued | §1.5 B |
| 3 | **Pension-income eligibility wrong** — plain RRSP withdrawals treated as eligible | Wrong $2,000 credit; wrongly admitted to splitting; biases optimizer toward RRSP melts | §1.5 A |
| 4 ▲ | **Estate haircut selects the withdrawal strategy** | Not just a display error — the crude 0.62/0.92 proxy is the auto-strategy tie-break, systematically favouring registered-last orderings | §7.8, §1.15 |
| 5 | **No terminal return at death** | Headline estate figure materially wrong; understates the cost of dying with a large RRIF | §1.15 |
| 6 ▲ | **Non-registered loss years produce zero taxable distributions** | A −10% year yields no interest/dividend income; understates tax in bad years and in every shock scenario | §6.1 |
| 7 ▲ | **CPP and OAS levers force both spouses to one age** | Asymmetric optima — usually the right answer — are unreachable by the UI and the sweep | §4.3, §5.4 |
| 8 | **RRSP deduction & refund not modelled** | Accumulation-stage tax overstated; RRSP-vs-TFSA advice skewed | §1.10 |
| 9 | **Tax tables frozen at 2026** while income inflates | Lifetime tax systematically overstated over a 30-year plan | §1.13 |
| 10 ▲ | **Unknown pension jurisdiction silently defaults to Ontario** (`UNLOCK_RULES[j] ?? UNLOCK_RULES.ON`) | Applies Ontario unlocking law to jurisdictions that forbid it | §3.2 |
| 11 ▲ | **Manitoba: one-shot `_split` blocks the age-65 full unlock; 55+ transfer modelled as RRSP not PRRIF** | Denies a real client entitlement; understates forced taxable income 55→71 | §3.2-MB |
| 12 | **Non-Ontario LIF maximums are formula approximations** | The binding constraint itself is approximate for LIF-bound non-ON clients | §3.3 |
| 13 | **Surplus cash disappears** | Forced-minimum surpluses reinvested nowhere → estate understated | §7.7 |
| 14 | **Quebec unsupported** (throws) and would be wrong as a bracket swap (abatement + QPP) | Keep disabled until built properly | §1.2 |

## 11.2 Important modelling gaps [G]

Non-eligible dividends (§6.2) · return of capital and the ACB floor (§6.3) · capital-loss carry-forwards (§6.4) · joint-account attribution input (§6.5) · spousal RRSP & 3-year attribution (§2.7) · PA/PSPA/PAR beyond an optional PA input (§2.6) · RRIF younger-spouse minimum election (§2.2) · GIS for low-income retirees · CPP post-2019 enhancement for younger cohorts (§4.2) · OAS 10-year residence minimum and non-resident cases (§5.1) · spending curve, go-go/slow-go/no-go (§7.1) · special locked-in unlocks — hardship, small balance, non-residency, shortened life expectancy (§3.2) · missing jurisdictions SK/NL/PE/territories (§3.2) · Quebec under-55 prescribed-rate LIF maximum and temporary income (§3.2-QC) · horizon keyed to Person A rather than the last survivor (§0.7).

## 11.3 Acceptable MVP approximations [A] — each must be disclosed on screen

Annual time step (§0.3) · proportional-ACB gain realization (§6.3) · joint non-reg 50/50 default (§6.5) · net-income ≈ taxable-income for credits and clawback **until the RRSP deduction lands** (§1.11) · clawback applied in-year rather than on prior-year income (§1.12) · CPP/OAS entered as the age-65 entitlement then scaled (§0.6) · flat-real spending default (§7.1) · one inflation rate for prices and benefit indexation (§7.2) · generic annuity-formula LIF maximum outside Ontario **only while flagged APPROXIMATE** (§3.3).

## 11.4 Must be exact before public, unsupervised launch [L]

**National tax coverage — all 13 provinces/territories `VERIFIED` before public national launch, with unverified jurisdictions disabled or "coming soon" and never silently substituted (§14)** · Federal + ON/BC/AB tax including surtax and health premium · pension credit **and** splitting eligibility and range · eligible **and** non-eligible dividends · capital gains including ACB, ROC and the principal-residence exemption · OAS clawback on the correct net-income base · terminal return at death · RRIF/LIF minimums and the **Ontario** LIF maximum exactly, other jurisdictions only from published tables · CPP survivor including the combined maximum · **contribution-room enforcement** · jurisdictional unlocking for every jurisdiction actually offered. Anything not launch-exact must be **feature-flagged off** for the affected province/case — never silently approximated.

## 11.5 Recommended engine architecture

```
data/                       year- and jurisdiction-keyed rule records (§13), cited + status-flagged
  taxYears/2026.json …
  jurisdictions/ON.json, FED.json, MB.json, QC.json …
core/   (pure, deterministic, no I/O)
  tax.ts          computeTax, householdTax(0–50% split search)   [fix §1.5, 1.7, 1.10, 1.11, 1.13]
  benefits.ts     cpp/oas factors, survivor                       [ok]
  registered.ts   rrifMin, lifMax(tables), unlock rules           [fix §3.2, 3.3]
  room.ts         NEW — per-person TFSA/RRSP room ledgers         [§2.6]
  nonreg.ts       NEW — return decomposition, ACB, ROC, losses    [§6]
  terminal.ts     NEW — terminal return at death                  [§1.15]
  projection.ts   the yearly simulator (pure)                     [enforce room; surplus sweep]
optimizer/  (chooses; scores ONLY by calling core)
  objective.ts    §9.0 objective and hard constraints
  annualRule.ts   §9.3 bracket-filling per-year draw rule
  structural.ts   §9.7 staged per-spouse search
  recommend.ts    plan-diff → §10.1 recommendation objects
app/    React/Supabase — persistence, auth, scenarios, UI         [keep Lovable's]
```
Rules: `core` and `optimizer` stay pure and environment-agnostic. All money-affecting logic lives behind the test suite. The optimizer **never** computes tax itself.

## 11.6 Required automated test suite

Keep the existing 53 tests. Add, at minimum:

- **Pension splitting:** 50%-when-optimal (fails today); endpoint coverage (0% and 50% evaluated); a regression guard that a 25%-capped search is strictly worse. **Never accept a one-sided ceiling assertion alone** — that is what hid the bug.
- **Pension eligibility matrix:** {age <65 / ≥65} × {RRSP, RRIF, DB lifetime, bridge} → credit? split? Bridge is **excluded by default** at every age (Erratum 1) and included only when explicitly affirmed as an eligible RPP life-annuity payment.
- **Room enforcement (source-qualified, Erratum 2):** an **engine-generated** $50k TFSA request with blank `t₀` room allocates **$0** and cascades; a **client-asserted** `contrib` of $50k with blank room is **honoured and flagged** `unverifiedRoom`, not re-routed; against known room the excess is modelled under the over-contribution treatment; **plan-start year uses entered room verbatim with no annual-limit addition**, and blank `t₀` room becomes the statutory limit plus withdrawal restoration only at `t₀+1`; TFSA withdrawal restored only the **following** year; RRSP contribution room, deduction limit and undeducted carry tracked separately per the CRA identity; no own-plan RRSP contribution after year-71; couple savings use both ledgers; property test — no year's contributions exceed room.
- **Terminal return:** single dying at 90 with a large RRIF shows a terminal spike, not a flat 38%; couple first death ≈ no incremental tax (rollover), second death full inclusion; TFSA never taxed.
- **Estate tie-break:** a fixture where the terminal-return estate reverses the haircut's chosen ordering.
- **Non-registered:** a −10% total-return year still produces taxable interest/dividends; ROC reduces ACB; ACB never negative; loss carry-forward offsets a later gain but never ordinary income.
- **Per-spouse optimization:** an asymmetric CPP/OAS optimum is found and beats every symmetric pair.
- **Locked-in:** ON max matches FSRA at {55,65,75,85}; QC has a maximum at 54 and none at 55+; MB 50%@55 then the **balance** at 65 (two separate entitlements, sequentially reachable); unknown jurisdiction **throws** rather than defaulting to ON; unlock is jurisdiction-driven, not residence-driven.
- **Indexation:** flat-real income over 30 years → flat-real tax.
- **Determinism:** identical inputs → byte-identical output; golden regression figures change only with a documented methodology change.
---

# 12. PHASE 0 — IMPLEMENTATION CONTRACT

**What Phase 0 is.** The set of changes that must land **before** any optimizer work, any new UI, and any real client use. Every item is small-code / high-impact: it changes client-facing numbers without restructuring the app. Phase 0 is deliberately split into four independently shippable batches, each with its own tests and its own regression consequences.

**Rules that apply to all of Phase 0**

- **No application code is prescribed here** — this is a contract of *behaviour, types, tests and compatibility*, not an implementation.
- **Every batch is green before the next begins.** CI must run the full suite; the regression fixtures print their figures on every run.
- **Golden figures will move.** Where a batch intentionally changes a regression number, the developer records the **old value, the new value, and the one-line reason** in `TESTING.md`. A regression change with no recorded reason is a build failure.
- **Saved-plan compatibility is mandatory.** Plans are persisted as JSONB (`plans.draft`). Every new field is **optional with a safe default**, and a migration/normalizer maps old drafts forward on read. No user's saved plan may fail to load.
- **Disclosure travels with approximation.** Anything left approximate must carry a `status` flag surfaced in the UI (§13).

---

## Batch 0A — Pension tax correctness

**Objective.** Make the highest-value couple tax interaction correct: the split range and what qualifies for it.

| | |
|---|---|
| **Files / functions** | `core/tax.ts` → `householdTax()`, `tryDir()`, `computeTax()` (pension credit input). `core/projection.ts` → the `fixed[]` accumulator that builds `pensionEligible`, and the `P[]` per-person accumulators (`mandatoryTaxable`, `schedRegCash`). |
| **Type / interface changes** | `IncomeComponents`: keep `pensionEligible` but populate it from a new split of registered cash. In the projection's per-person accumulator add `rrifEligibleCash` (withdrawals from accounts in RRIF/LIF/PRRIF status, including mandatory minimums) and `rrspNonEligibleCash` (withdrawals from accounts still in RRSP/LIRA status). **Erratum 1:** `BridgeInput` gains `sourceClass?: "rpp" \| "rca" \| "employerSupplement" \| "other"` (default `"rpp"`) and `eligibleAffirmed?: boolean` (default **false**) — both optional, so **saved plans remain compatible** and existing bridges become non-eligible on load, which is the intended correction. No other `PlanInputs` change. |
| **Methodology** | (1) **Split range:** search the transfer over the **full 0% → 50% of eligible pension income**, both directions, always evaluating the endpoints. Either pass the un-halved eligible amount with `f ∈ [0, 0.50]`, or keep `maxT = 0.5 × eligible` with `f ∈ [0, 1.0]`. Use a fine step (≤2%) or a bounded 1-D solve; keep the lowest combined household tax. (2) **Eligibility — amended by Erratum 1:**<br>`pensionEligible = rppLifetimePension + (age >= 65 ? rrifEligibleCash : 0) + (bridgeEligibleAffirmed ? bridgeInc : 0)`<br>where `bridgeEligibleAffirmed` defaults to **false**. Plain RRSP withdrawals are **never** eligible, at any age. Under 65, only RPP **lifetime** pension qualifies (plus death-of-spouse cases) — so a RRIF minimum taken at 60 is **not** eligible, and **a bridge benefit is not eligible merely because it is paid from a pension plan** (CRA: bridging benefits are not lifetime retirement benefits). `bridgeInc` remains fully taxable ordinary income regardless. The same `pensionEligible` feeds both the $2,000 credit and the splitting search. |
| **Tests required** | **Hand-calculated:** a two-person fixture with $90,000 eligible pension vs $0 other income where the optimum is the full 50% — assert `splitAmt ≈ 45,000`, not `22,500`, and assert combined tax equals a hand-computed figure. **Endpoints:** 0% and 50% both evaluated. **Cap regression guard:** a 25%-capped search is strictly worse on that fixture. **Eligibility matrix:** 66-year-old with only RRSP withdrawals → no credit, no split; same person after RRIF conversion → both; 60-year-old with a RRIF minimum → not eligible; DB pension at 60 → eligible. **Bridge (Erratum 1):** a 60-year-old with an RPP lifetime pension **plus** a bridge has `pensionEligible` equal to the lifetime portion only — assert the bridge is excluded from both the credit and the split, and that it still appears in `ordinary` income and in household cash; setting `eligibleAffirmed = true` includes it; a bridge with `sourceClass = "rca"` is never eligible even when affirmed. **Never** accept a one-sided `splitAmt <= 50%` assertion as sufficient. |
| **Saved-plan compatibility** | No input-schema change. Fully backward compatible. |
| **Regression figures that change** | **Single-filer $276,326 → will change** (eligibility affects the pension credit on RRIF minimums at 65+). **Erratum 1 adds a second cause:** any fixture with a bridge benefit loses the credit/split on that amount, so **bridge fixtures move upward in tax**; the default single-filer fixture has no bridge, so Erratum 1 alone does not move it. **Couple fixtures → will change materially** (split range). A **new couple golden fixture must be added in this batch** — one does not exist today, which is why the 25% cap survived 53 passing tests. |

---

## Batch 0B — RRSP / TFSA accumulation correctness

**Objective.** Make contributions legal, deductible, and correctly attributed — the precondition for any savings advice or optimizer.

| | |
|---|---|
| **Files / functions** | New `core/room.ts` (per-person ledgers). `core/projection.ts` → contribution application (`a.contrib` loop, `goalSaves` loop, registered-destination lump sums, and the §7.7 surplus sweep). `core/tax.ts` → `computeTax()` net-income base. `optimizer/levers` → `leverOverride()` (remove the `owner: "A"` hardcode). `analysis.ts` / `levers.ts` → advice must consume the ledger rather than raw inputs. |
| **Type / interface changes** | `PersonInput`: add optional `earnedIncomeHistory?`, `pensionAdjustment?: number \| null` (default `null`; for a pension-plan member this is a **disclosed estimate**, never a silent 0), `tfsaWithdrawalsPriorYear?: number \| null`. **Erratum 2:** existing `rrspRoom` is defined as **current available contribution room** (`rrspContributionRoomOpen`), matching CRA's term and the field's label; add optional `rrspDeductionLimitOpen?: number \| null` and `rrspUndeductedContributions?: number \| null` (both `null` by default — the deduction limit is derived from the CRA identity when absent, and validated against it when present). Existing `tfsaRoom` → `tfsaRoomOpen[t₀]`, used **verbatim** in the plan-start year. New per-year output `roomLedger` on `ProjectionRow` (including `roomStatus` and `unverifiedRoom` flags) for display and testing. `GoalSave.owner` becomes required in optimizer-generated saves. |
| **Methodology** | Advance a **per-person, per-year ledger** before contributions. **Use the exact opening-year and steady-state formulas in §2.6 Erratum 2** — the plan-start year takes the client's entered room **verbatim** (no annual-limit or 18%-accrual addition, which would double-count), and the recursion begins the following January 1. Carry RRSP **contribution room**, **deduction limit** and **undeducted contributions** as three separate quantities bound by the CRA identity. **Clamp contributions by source (Erratum 2):** engine-generated contributions (`goalSaves`, optimizer savings, surplus sweeps, every recommendation) are capped at **known** room — unknown room means **zero** capacity; client-asserted `contrib` entries are honoured but flagged `unverifiedRoom`. Overflow cascades TFSA → RRSP → non-registered. `null` room means **zero for the plan-start year**, never unlimited and never the annual limit. No own-plan RRSP contribution after the year the owner turns 71 (**Erratum 3, Option A**: room still accrues and stays on the ledger, but is **not** redirected to a spouse; Batch 0B models only `contributor === owner`, and a disclosure fires where unused room coexists with a spouse aged ≤ 71). The $2,000 cushion is excluded from recommendable room and used only for penalty modelling; `reinvestRrspRefund` defaults **false**. Deduct claimed RRSP contributions from the contributor's `ordinary` income, and switch credit/clawback bases from taxable to **net income** (§1.11) in the same batch — they are one change, not two. |
| **Tests required** | **Erratum 2 opening-year suite:** `tfsaRoom = 25,000` on a 2026 plan → exactly $25,000 contributable in 2026 (**not** $32,000), and 2027 opens at `close(2026) + limit(2027) + withdrawals(2026)`; entered RRSP room is **not** augmented by 18% of prior-year earned income in `t₀` while the same earned income creates room in `t₀+1`; the CRA identity validates when all three RRSP inputs are supplied and the deduction limit is derived when absent; a contribution may exceed the same-year deduction with the difference persisting in `rrspUndeductedCarry`; unknown room yields **zero** engine-generated contributions in `t₀` while a client-asserted `contrib` survives with `unverifiedRoom`; a pension-plan member with unknown PA **and** unknown room has registered recommendations **withheld**; recommendable room excludes the $2,000 cushion; `reinvestRrspRefund` defaults false. **Enforcement suite (source-qualified per Erratum 2):** an **engine-generated** $50k TFSA request with blank `t₀` room allocates **$0** to the TFSA and cascades the remainder; a **client-asserted** `AccountInput.contrib = $50k` with blank room **remains at $50k** flagged `unverifiedRoom` and is **not** re-routed; the same asserted $50k against **known** room of $25k models the $25k excess under the over-contribution treatment; entered carry-forward is usable then capped; TFSA re-contribution in the withdrawal year refused, allowed the next year; no **own-plan** RRSP contribution in the year after 71, with room still accruing on the ledger and **no** auto-allocation to a younger spouse (Erratum 3, Option A) plus the spousal-opportunity disclosure; couple savings use **both** ledgers (no `owner: "A"` bias); cascade sums to the requested amount; RRSP contribution reduces that year's tax and TFSA does not; property test — **no year's contributions exceed room** across randomized plans. |
| **Saved-plan compatibility** | All new fields optional with safe defaults. A normalizer maps `tfsaRoom` → `tfsaRoomOpen[t₀]` and `rrspRoom` → `rrspContributionRoomOpen[t₀]`, both used verbatim in the plan-start year; `rrspDeductionLimitOpen` is derived from the CRA identity when absent. Old drafts load unchanged. **Two intended result changes:** (a) plans that entered room no longer receive a duplicated current-year accrual, so their first-year registered capacity **falls**; (b) plans that left room `null` now carry **zero** verifiable start-year room instead of a full annual limit, so engine-generated registered contributions in that year **stop**. Both are the correction, not a regression. |
| **Regression figures that change** | Any fixture with registered contributions changes. The single-filer regression fixture has **no contributions**, so it is **unaffected by room enforcement** but **is** affected by the net-income/deduction change if it has deductions (it does not — expect no change from 0B on that fixture). **Add an accumulation-stage golden fixture** (working client, contributions, room limits) in this batch — none exists today. |

---

## Batch 0C — Locked-in safety

**Objective.** Never state or model a locked-in entitlement that the governing jurisdiction does not grant, and never silently substitute one jurisdiction's law for another's.

| | |
|---|---|
| **Files / functions** | `core/registered.ts` → `UNLOCK_RULES`, `unlockRule()`, `lifMaxFactor()`. `core/projection.ts` → the unlock branch (the `_split` flag and the destination account it creates). `data/jurisdictions/*` (new). |
| **Type / interface changes** | `UnlockRule` gains: `partialPct`, `partialMinAge`, `fullUnlockAge?` (MB), `destinationType: "RRSP" \| "PRRIF"`, `requiresVehicle?: "RLIF" \| "ScheduleLIF"`, `transferWindowDays?`, `oneTime: boolean`, plus §13 metadata **carried per rule component, not per jurisdiction** (Erratum 4B) — each of `unlockEntitlement`, `destinationVehicle` and `lifMaximum` has its own `{source, verifiedDate, status}`. New `AccountType` member **`PRRIF`** (RRIF minimums, **no** maximum, pension-eligible at 65+). `WorkingAccount._split: boolean` → **`unlockedFraction: number`** so partial and later full unlocks are both representable. |
| **Methodology** | (1) **Remove the silent Ontario default** — `UNLOCK_RULES[j] ?? UNLOCK_RULES.ON` must become an explicit failure/`UNSUPPORTED` for unknown jurisdictions. (2) **Manitoba: keep `full65`** — it is correct (regulator-verified) — but make the age-55 50% and the age-65 balance unlock **two sequential entitlements**: replace the one-shot boolean with a cumulative unlocked fraction re-evaluated each year against the age-appropriate maximum. (3) **Manitoba's destination is a PRRIF**, not an RRSP — so RRIF minimums begin immediately. **Saskatchewan is `UNSUPPORTED` in 0C** (Erratum 4): build the `PRRIF` type for MB, implement **no** SK behaviour, and refuse SK at input. (4) **Federal** rule record carries the RLIF requirement, the 60-day window, the 50% cap and its one-time/no-carry-forward nature. (5) **Quebec**: keep the age gate; no text, table, comment or test may imply "no maximum at any age"; the under-55 maximum stays `APPROXIMATE` pending the prescribed-rate formula. (6) **Status is component-level (Erratum 4B):** `unlockEntitlement`, `destinationVehicle` and `lifMaximum` each carry their own `VERIFIED` / `APPROXIMATE` / `UNSUPPORTED`. Gating happens **at the point of use**: a calculation touching only `VERIFIED` components runs clean; one touching an `APPROXIMATE` component is flagged on that specific number; one touching an `UNSUPPORTED` component is **withheld** — the whole jurisdiction is refused only when the component the calculation needs is itself `UNSUPPORTED`. A derived `recordStatus` (the worst component status) is exposed for list/selector display. |
| **Tests required** | Unknown jurisdiction **throws** (does not become Ontario); MB unlocks 50% at 55 **and then the balance at 65** in the same projection; **MB** unlocked money lands in a **PRRIF** and forces RRIF minimums before 71; **SK is `UNSUPPORTED`** — an account with `juris = "SK"` is refused with results withheld and does **not** default to Ontario, to Manitoba, or to any PRRIF behaviour; QC applies a maximum at 54 and none at 55+; ON maximum matches the FSRA table at {55,65,75,85}; unlock follows **pension jurisdiction, not residence** (existing test, keep); every rule record has non-empty `source`, `verifiedDate`, `status`. |
| **Saved-plan compatibility** | `AccountInput.juris` unchanged. Saved accounts whose `juris` is now `UNSUPPORTED` must load and display a clear "this jurisdiction is not yet supported — results withheld" state rather than throwing in the UI. `_split` → `unlockedFraction` needs a read-time migration (`true → 1.0 × previous pct`, `false/absent → 0`). |
| **Regression figures that change** | Only fixtures containing locked-in accounts. The single-filer regression fixture **does** hold a LIF, so its figure **may move** once MB/PRRIF and the destination changes land — verify and re-baseline if so. Ontario-only fixtures should be unchanged; if an ON fixture moves, that is a bug in this batch. |

---

## Batch 0D — Projection integrity

**Objective.** Remove the remaining small-code errors that distort every projection.

| | |
|---|---|
| **Files / functions** | `core/taxYears.ts` → year lookup and indexation. `core/projection.ts` → the non-registered growth branch, the surplus handling at the end of the yearly loop. `core/nonreg.ts` (new) for return decomposition. `core/engine.ts` → `runPlan()` tie-break and `afterTaxEstate()` labelling. |
| **Type / interface changes** | `TaxYear` gains `indexationRate` and a `derivedFrom?: number` marker for years generated by indexation rather than published. Account return input gains an optional yield vector `{interest, eligDiv, nonEligDiv, cgDist, roc}`; the existing `mix` remains supported for compatibility. `ProjectionRow` gains `surplusSwept` and `distributionsTaxable` for testability. |
| **Methodology** | (1) **Indexation:** for years beyond the last published table, index brackets, BPA, age amount, pension amount and the OAS threshold by `indexationRate` (default = inflation, overridable); published years remain exact. (2) **Non-registered distributions:** decompose the return per §6.1 — yields are non-negative rates applied to the balance and accrue **regardless of the sign of the price return**; delete the `growth > 0` gate. Reinvested distributions raise ACB; ROC lowers it with a floor at zero (excess realized as a gain). (3) **Surplus sweep:** after-tax cash exceeding the spending target is contributed to TFSA (to room, per 0B) then non-registered, adding to ACB. (4) **Estate tie-break:** until the terminal return exists (Phase 1), label the auto-strategy selection `APPROXIMATE` wherever it is displayed; the tie-break moves to the terminal-return estate in Phase 1. |
| **Tests required** | Flat-real income over 30 years → flat-real tax (indexation); a −10% total-return year **still** produces taxable interest and dividends (fails today); a market-shock scenario taxes distributions during the shock; ROC reduces ACB and never drives it negative; a forced-minimum surplus year **raises** TFSA/non-reg balances and respects room; the auto-strategy display carries the approximate flag. |
| **Saved-plan compatibility** | Yield vector optional — plans using `mix` behave as before except that loss-year distributions now accrue. No migration required. |
| **Regression figures that change** | **All of them.** Indexation lowers lifetime tax on every multi-decade fixture; the loss-year fix raises tax in any fixture with negative years; the surplus sweep raises ending balances. The single-filer $276,326 **will move** in this batch and must be re-baselined with the reason recorded. |

---

## Phase 0 exit criteria

1. All four batches merged, full suite green, no `[C]` item from §11.1 items 1–3, 6–11, 13 outstanding (items 4, 5, 12, 14 are Phase 1).
2. Golden fixtures exist for **single filer, couple, accumulation-stage, and locked-in** clients, each with a recorded baseline and reason-for-change history.
3. Every rule record carries `source`, `verifiedDate`, `status` (§13); nothing `UNSUPPORTED` is reachable from the UI without a withheld-results state.
4. Every remaining `[A]` approximation is surfaced in the UI where its number is displayed.

---

# 12A. Phase 1 and beyond (sequenced, after Phase 0)

**Phase U — Product depth & scenario UX (current, in progress).** Development is temporarily focused on restoring product depth and scenario experience: the **Strategies workspace**, the **What If workspace**, **scenario comparison**, **charts**, and the **year-by-year ledger**.

> **Engine freeze during Phase U.** **No major financial-engine methodology changes are to be introduced during this UX work.** Mixing methodology changes into a UX phase makes it impossible to attribute a moved number to either cause, and every Phase 0 batch deliberately moves golden figures (§12). Phase U should therefore be additive at the presentation layer and may consume existing engine outputs, but must not alter `core/` calculations.
>
> Two things Phase U *should* do, because they cost little and prevent rework:
> 1. **Build the UX against the v1.2 output contract**, including fields Phase 0 will populate (`roomLedger`, `surplusSwept`, `distributionsTaxable`, per-spouse benefit ages) — so the workspaces do not need re-plumbing afterwards.
> 2. **Render approximation and jurisdiction status** (§13.2, §14.2) wherever numbers appear: `APPROXIMATE` flags, the auto-strategy tie-break caveat (§7.8), and the "coming soon" state for unverified jurisdictions. These are presentation concerns and belong in this phase.
>
> **On resumption**, the financial-correctness roadmap continues with **v1.2 as the methodology baseline**, beginning at Phase 0 Batch 0A.


**Phase 1 — Death, estate, and the tie-break it drives.** Implement `core/terminal.ts`: a real terminal T1 at each death (full registered FMV inclusion net of spousal rollover; deemed disposition of non-registered capital property; TFSA at par), apply the spousal rollover on the first death, and **replace the estate haircut as the auto-strategy tie-break**. Resolves §11.1 items 4 and 5. Expect every estate figure and some auto-strategy selections to change.

**Phase 2 — Rule/jurisdiction data layer.** Move every constant out of code into cited, year-keyed records (§13). Add published LIF maximum tables per jurisdiction (retiring the annuity approximation), the remaining unlocking jurisdictions (SK, NL, PE, territories), and the Quebec under-55 prescribed-rate formula. Resolves §11.1 item 12 and much of §11.2. Turns future law changes into data edits.

**Phase 3 — The dynamic optimizer (§9).** Annual bracket-filling rule + staged per-spouse structural search (§9.7) + explicit objective and hard constraints. **Depends on Phase 0** (an optimizer without room enforcement or correct splitting will optimize against the bugs) **and on Phase 1** (it must score against a real estate figure).

**Phase 4 — Recommendation engine (§10).** Plan-diff objects with re-simulated dollar/tax/funding impacts, trade-offs, confidence and years-affected. Depends on Phase 3.

**Phase 5 — Remaining coverage, by client value.** Non-eligible dividends and ROC/loss carry-forwards if not already taken in 0D; per-account joint attribution; spousal RRSP and attribution; RRIF younger-spouse election; spending curves; GIS; CPP enhancement for younger cohorts.

**Phase 6 — National tax coverage (pre-launch gate, §14).** Add the remaining **ten** provinces/territories (SK, MB, NB, NS, PE, NL, YT, NT, NU + QC) as verified, source-backed rules records. This sits **after Phase 2** by design: once the rules layer exists, each jurisdiction is a **data** task with a verification pass, not a code change. Run in parallel with the locked-in jurisdiction backfill (SK, NL, PE, territories — §14.5), which is a separate axis. **Quebec/QPP is its own project** (abatement + QPP + QC credits), never a bracket swap. **Public national launch is gated on this phase**; until a jurisdiction is `VERIFIED` it stays disabled or "coming soon" (§14.2).
---

# 13. SOURCE STANDARD AND RULES-DATA RECORDS

## 13.1 Source hierarchy (mandatory)

For any tax, pension, CPP/OAS or locked-in **legal** rule, sources are used in this order, and the highest available tier must be the one cited:

1. **Canadian government / regulator primary sources** — CRA, Department of Finance, ESDC/Service Canada, OSFI, FSRA, Retraite Québec, provincial pension commissions and superintendents, and the governing statutes/regulations themselves.
2. **Regulator-published tables and bulletins** (e.g. FSRA LIF maximum tables, Manitoba Policy Bulletin #1, OSFI unlocking guidance, ESDC quarterly benefit tables).
3. **Professional secondary sources** (major accounting firms, taxtips.ca, established industry publications) — permitted **only** to locate or corroborate a primary source, **never** as the cited authority for a rule that ships.

A value with no tier-1 or tier-2 citation may not carry `status: VERIFIED`.

## 13.2 Required rules-data record shape

Every rule and constant in `data/` carries this metadata. Records without complete metadata fail CI.

```
RuleRecord {
  jurisdiction   "FED" | "ON" | "BC" | "AB" | "MB" | "QC" | …     // taxing province OR pension jurisdiction — state which
  domain         "tax" | "benefit" | "registered" | "lockedIn"
  key            e.g. "lif.maxTable", "unlock.partialPct", "oas.clawbackThreshold"
  effective      { fromYear | fromDate, toYear | toDate | null }   // null = current
  value          number | table | structured rule
  source         { title, publisher, url, tier: 1 | 2 | 3 }
  verifiedDate   ISO date the value was last checked against `source`
  status         "VERIFIED" | "APPROXIMATE" | "UNSUPPORTED"
                 // COMPONENT-LEVEL (Erratum 4B): status attaches to THIS record, i.e. to
                 // one rule component (unlockEntitlement | destinationVehicle | lifMaximum |
                 // brackets | bpa | …), never to a whole jurisdiction. A jurisdiction's
                 // derived recordStatus = worst component status, for display/selector use.
                 // Gating is per component AT THE POINT OF USE — see §13.2a.
  notes          procedural detail a client would need to act (windows, forms, consent)
}
```

**Status semantics — these drive UI behaviour, not just documentation:**

- **VERIFIED** — checked against a tier-1/2 source on `verifiedDate`. Displayed normally.
- **APPROXIMATE** — the mechanism is modelled but the value or formula is not the published one (e.g. non-Ontario LIF maximums, Quebec's under-55 maximum). **Must be visibly flagged wherever the resulting number is displayed.**
- **UNSUPPORTED** — not modelled. The engine must **refuse** and the UI must withhold results for the affected client, rather than substituting another jurisdiction's rule.

**§13.2a Component-level status and point-of-use gating (Erratum 4B ruling).** Status is held **per rule component (Option B)**, not per jurisdiction. Quebec is the proof case: its **55+ no-maximum** rule and its **LIF→RRSP transfer prohibition** are `VERIFIED`, while its **under-55 prescribed-rate maximum** is `APPROXIMATE`. A whole-record status would force a false choice — mark QC `VERIFIED` and overstate the approximate part, or mark it `APPROXIMATE` and needlessly flag a verified rule. Component status avoids both.

Gating rules:
- A calculation that reads **only `VERIFIED`** components runs and displays clean. *(QC LIF at 56 → no maximum, unflagged.)*
- A calculation that reads an **`APPROXIMATE`** component flags **that number**, not the client's whole plan. *(QC LIF at 54 → maximum shown with the approximate marker.)*
- A calculation that reads an **`UNSUPPORTED`** component is **withheld**, and only that calculation. *(SK unlocking → refused; the client's tax and projection are unaffected.)*
- `recordStatus` = the **worst** status among a jurisdiction's components, used for selector/list display only — never as the gate for an individual calculation.
- **Exception, unchanged:** for **tax** jurisdictions the §14.2 selectability gate still requires **every component needed to compute tax** to be `VERIFIED` before the province becomes selectable — a partially-verified bracket table is not a shippable tax calculation.

**Staleness rule.** Any record whose `verifiedDate` precedes the current tax year triggers a build **warning**; any `status: VERIFIED` record older than two tax years is a build **failure**. This prevents last year's brackets shipping silently.

## 13.3 Verification status of this specification's own claims

Sources consulted directly while producing v1.0–v1.2 (tier 1/2 unless noted):

| Rule | Source | Verified |
|---|---|---|
| Capital gains inclusion 50% for 2026 (66.67% proposal cancelled 21 Mar 2025) | Department of Finance Canada; corroborated by Wolters Kluwer, Prospyr (tier 3) | Aug 2026 |
| Pension income amount (line 31400) and splitting eligibility — RRIF qualifies at 65+, plain RRSP withdrawals do not, RPP lifetime pension qualifies at any age | CRA, line 31400 | Aug 2026 |
| Federal locked-in unlocking — RLIF required, up to 50%, within 60 days, one-time, no carry-forward, age 55; small balance ≤50% YMPE ($37,300 for 2026); hardship scale to 75% YMPE ($55,950); non-residency ≥2 years; shortened life expectancy | OSFI unlocking guidance | Aug 2026 |
| Manitoba — once-in-a-lifetime 50% at 55 to a **prescribed RRIF** (30-day window for multi-plan transfers); **full balance unlockable at 65+**, no percentage or YMPE limit, in force 1 Oct 2021 (Bill 8); small balance <40% YMPE; hardship, shortened life expectancy, non-residency ≥2 years | Manitoba Pension Commission Policy Bulletin #1 / Government of Manitoba pension FAQ; corroborated by Investment Executive (tier 3) | Aug 2026 |
| Quebec LIF — **no maximum at 55+** effective 1 Jan 2025; **under 55 a prescribed-rate maximum and temporary-income provisions remain**; age determined at application date; LIF→RRSP/RRIF transfers prohibited at any age | Retraite Québec | Aug 2026 |
| TFSA available contribution room = current-year dollar limit **+** unused room from previous years **+** withdrawals made the **previous** year **−** contributions already made this year; the dollar limit is added **January 1**; a withdrawal is regained as new room on **January 1 of the following year** | CRA, Calculate your TFSA contribution room | Aug 2026 |
| RRSP **`Deduction Limit = Unused (undeducted) Contributions + Available Contribution Room`**, therefore `Available Contribution Room = Deduction Limit − Unused Contributions` (per the Notice of Assessment / RRSP Deduction Limit Statement) | CRA NOA relationship, via PWL Capital summary (tier 3 restating the CRA statement) | Aug 2026 |
| Bridging benefits are **not** lifetime retirement benefits — *"Bridging benefits, by definition, are not lifetime retirement benefits"*; bridging = benefits payable for a temporary period ending no later than a date known when payments start | CRA, Registered Pension Plans Glossary | Aug 2026 |
| Eligible pension income for the pension income amount / splitting describes the RPP entry as **"RPP lifetime retirement benefits"** (T4A box 016) at both age bands, with **no** mention of bridging benefits; conditional bridge eligibility noted in professional guidance (tier 3, Sun Life) | CRA, line 31400 eligible pension income tables | Aug 2026 |
| 2026 CPP/OAS amounts and CPP survivor rules (60% at 65+; flat-rate + 37.5% at 45–64; 1/120 reduction 35–44; survivor and combined maximums; $2,500 death benefit) | ESDC quarterly benefit tables (carried in both codebases; re-checked in v1.0) | Aug 2026 |

**Everything else is CONST-UNVERIFIED for the purposes of this document** — including all 2026 bracket thresholds, BPA/age/pension amounts, the OAS clawback threshold, RRIF minimum table digits, the FSRA LIF maximum table digits, and the TFSA/RRSP dollar limits. The *mechanisms* are verified; the *numbers* are inherited from the codebases' own comments. Reconciling each to a tier-1/2 source with a `verifiedDate` is Phase 0/Phase 2 work and a launch blocker (§11.4).

---

# 14. NATIONAL TAX COVERAGE — PRE-LAUNCH REQUIREMENT

**Product intent.** The finished application is a **Canadian national** financial-planning product. Three-province coverage is correct for the current stage but is **not** a launchable national footprint. This section states the requirement, the gating rule, and what each jurisdiction's rules record must contain.

## 14.1 Required coverage before public national launch

Verified income-tax support is required for all **13** provinces and territories:

| | Jurisdiction | Tax table today | Selectable today | Notes |
|---|---|---|---|---|
| 1 | **BC** British Columbia | ✅ implemented | ✅ | Verify constants to tier-1/2 sources (§13.3) |
| 2 | **AB** Alberta | ✅ implemented | ✅ | Verify constants |
| 3 | **ON** Ontario | ✅ implemented | ✅ | Includes surtax + health premium; verify constants |
| 4 | **SK** Saskatchewan | ❌ | ❌ | — |
| 5 | **MB** Manitoba | ❌ | ❌ | — |
| 6 | **QC** Quebec | ❌ | ❌ | **Dedicated workstream — §14.4** |
| 7 | **NB** New Brunswick | ❌ | ❌ | — |
| 8 | **NS** Nova Scotia | ❌ | ❌ | Historically non-indexed brackets — confirm current status |
| 9 | **PE** Prince Edward Island | ❌ | ❌ | — |
| 10 | **NL** Newfoundland & Labrador | ❌ | ❌ | Surtax applies — confirm current status |
| 11 | **YT** Yukon | ❌ | ❌ | Territorial; follows federal BPA structure — confirm |
| 12 | **NT** Northwest Territories | ❌ | ❌ | Territorial |
| 13 | **NU** Nunavut | ❌ | ❌ | Territorial |

**Status: 3 of 13 implemented.** Ten jurisdictions remain, one of which (Quebec) is a project rather than a table.

## 14.2 The gating rule — verified before selectable

**A jurisdiction becomes selectable for live calculations only once its applicable rules record carries `status: "VERIFIED"` (§13.2).** Until then it must **either**:

- **remain disabled** in the selector, **or**
- appear as **"Coming soon — calculations not yet supported"**, visibly distinct and non-selectable for a live plan.

**Explicitly prohibited:**

- **Do not expose unsupported provinces in the selector** to appear national. A province that is selectable but wrong is worse than one that is absent — the client cannot tell.
- **The engine must never silently fall back to Ontario, to CUSTOM, or to any other province.** This applies to (a) the tax province, where `getProvince()` must continue to fail loudly rather than substitute, and (b) the **pension jurisdiction**, where the current `UNLOCK_RULES[j] ?? UNLOCK_RULES.ON` fallback is a live defect (§11.1 item 10, Batch 0C).
- **CUSTOM is not a coverage strategy.** It exists for modelling and testing and must stay excluded from the client-facing selector (as it correctly is today). Never route an unsupported province to CUSTOM.

**Implementation note.** The existing derivation `provinceKeys(YEAR).filter(k => k !== "CUSTOM")` is the right shape; extend the predicate to `.filter(k => k !== "CUSTOM" && ruleStatus(k, YEAR) === "VERIFIED")`, and render `APPROXIMATE`/`UNSUPPORTED` jurisdictions as the disabled "coming soon" state. Saved plans referencing a not-yet-verified province must **load** and display a withheld-results state, never throw in the UI (same rule as Batch 0C for pension jurisdictions).

## 14.3 Required contents of each tax-jurisdiction rules record

Each province/territory needs a **year-specific, source-backed** record. Beyond the §13.2 envelope (`jurisdiction`, `effective`, `source`, `verifiedDate`, `status`), each must carry at minimum:

| Field | Notes |
|---|---|
| **Brackets / rates** | Full bracket table for the tax year |
| **Basic personal amount** | Including any phase-out where the province applies one |
| **Age amount** | Amount **and** its income threshold and reduction rate |
| **Pension income amount** | Provincial equivalent of the federal $2,000 |
| **Eligible dividend tax credit** | As a fraction of the grossed-up dividend |
| **Non-eligible dividend tax credit** | Required **when §6.2 is implemented**; the field should exist from the outset so records are not re-cut later |
| **Surtaxes** | Thresholds and rates (ON, NL; confirm others) — levied on **provincial tax**, not on income |
| **Health premiums / levies** | Where applicable (ON health premium; confirm any others) — levied on taxable income |
| **Indexation rules** | Provincial/territorial indexation factor and **which** amounts it applies to; some jurisdictions do not index some amounts. Feeds §1.13 |
| **Effective year** | Per §13.2 `effective.fromYear` / `toYear` |
| **Authoritative source** | Tier 1/2 per §13.1 |
| **Verification date & status** | `verifiedDate`, `status` — drives selectability per §14.2 |

**Sequencing note.** Adding a jurisdiction is a **data** task once the Phase 2 rules layer exists (§12A). Doing it before then means editing code, which is why §12A places national coverage after Phase 2 rather than treating it as ten independent code changes.

## 14.4 Quebec remains a dedicated workstream — not a bracket table

Unchanged from §1.2 and reaffirmed here because national coverage makes it tempting to treat Quebec as "one more province." It is not. Quebec requires, at minimum:

- the **federal Quebec abatement (16.5%)** applied to federal tax;
- **QPP** in place of CPP throughout the benefits layer (§4) — separate amounts, contribution rules, and survivor provisions;
- Quebec's own **credit structure**, which does not map one-to-one onto the federal/provincial pattern used by the other twelve;
- a **separate provincial return** conceptually, which affects how net income and credits are presented.

Shipping Quebec as a bracket swap would be a **[C]** error affecting roughly a quarter of the national market. It gets its own project, its own fixtures, and its own verification pass. Until it is `VERIFIED`, Quebec shows the "coming soon" state.

## 14.5 Locked-in coverage is a separate axis (do not conflate)

Per **§0.9**, national *tax* coverage and national *pension-jurisdiction* coverage are two different completion criteria and progress independently:

- **Tax residence:** the 13 jurisdictions in §14.1.
- **Pension jurisdiction:** ON, FED, AB, MB, NS, NB, BC, QC are encoded today; **SK, NL, PE and the territories are absent entirely** (§3.2), and several encoded ones are unverified headline percentages.

A client may be tax-resident in a jurisdiction the tool supports while holding locked-in money from one it does not — or the reverse. **Both** must be independently gated, and neither may substitute for the other. National launch requires both axes complete, or the affected clients explicitly out of scope with results withheld.
---

# Appendix A — Second-pass verification of `[ok]` items (carried from v1.1, updated)

**Why this exists.** v1.0 marked many items `[ok]`; an independent review then found a `[C]` bug (§1.5 Bug B) hiding behind a *passing test*. v1.2 added four more confirmed defects in areas previously read as sound. The lesson is structural: **`[ok]` must always state how it was verified.**

**Verification levels.** **LVC** — logically verified from code (the code does what it says; says nothing about whether the rule or constant is right). **EXT** — verified against an authoritative external source, sub-graded **EXT-session** (re-pulled during this audit, see §13.3) or **EXT-rule** (well-established statutory mechanism, not re-pulled). **TEST** — an automated test exercises it; **corroboration only, never proof of methodology.** **CONST-UNVERIFIED** — mechanism sound, 2026 dollar value not re-checked.

**Status changes across v1.1 → v1.2:**

| Item | v1.1 | v1.2 | Reason |
|---|---|---|---|
| §2.6 Contribution room | `[G]` "Person-A-only, no dynamics" | **[C]** | Room is not enforced **anywhere** in the core engine; recommendations can be legally impossible. |
| §4.3 / §5.4 Separate CPP/OAS ages | `[ok]` | **[ok] inputs / [C] optimization** | The lever writes one age to every person; asymmetric optima unreachable. |
| §6.1 Non-registered distributions | `[ok]` (as part of §6.2) | **[C]** | Interest/dividends accrue only when total return is positive. |
| §7.8 / §1.15 Estate haircut | `[C]` (display accuracy) | **[C] escalated** | The haircut is the **auto-strategy tie-break**, so it changes the recommended plan. |
| §3.2-MB Manitoba `full65` | `[ok]` headline | **[ok] headline confirmed; [C] implementation** | Regulator confirms 100% at 65 is correct; the defects are the one-shot `_split` and the RRSP-vs-PRRIF destination. |
| §3.2-QC Quebec `noMax55` | `[ok]` | **[ok] confirmed, hardened** | Age gate is correct; wording/tests must never imply "no maximum at any age." |
| §3.2-FED Federal 50%@55 | `[ok]` | **[ok] arithmetic / [G] procedure** | RLIF requirement, 60-day window and one-time nature were missing. |
| §3.2 Unknown jurisdiction | not assessed | **[C]** | `?? UNLOCK_RULES.ON` silently applies Ontario law. |
| §7.4 Draw solver | `[ok]` | **[ok, monotonicity caveat]** (unchanged from v1.1) | Monotonicity of after-tax cash in `G` is assumed, not proven, near clawback/bracket edges. Add a sweep property test. |

**Items that remain `[ok]` at the mechanism level** (LVC + EXT-rule, mostly CONST-UNVERIFIED, several TEST-covered): federal/provincial bracket mechanics, BPA phase-out, age amount, eligible dividend gross-up/credit, capital gains inclusion (**EXT-session**), interest treatment, OAS clawback mechanics, average/per-person marginal rates, RRSP/RRIF/TFSA/LIRA containers, RRIF minimums, Ontario LIF maximum, conversion defaults, CPP early/late factors, CPP survivor formula, OAS deferral and the 75+ increase, pension-jurisdiction-follows-the-money, guaranteed-income assembly, annual tax recalculation, and the couple mechanics not listed as changed above.

**Two systemic caveats still apply to every `[ok]`:** (1) **CONST-UNVERIFIED is pervasive** — mechanisms are right, the 2026 numbers are inherited (§13.3); (2) several `[ok]` items have **no direct test at all** — capital-gains realization, ACB, joint 50/50 attribution, and draw-solver monotonicity rest on code-reading alone and are first in line for new tests (§11.6).

---

# Appendix B — Closing note on process

Three audit rounds produced this document. Round 1 (v1.0) built the methodology baseline. Round 2 (v1.1) was triggered by an external review that found a real `[C]` bug behind a passing test. Round 3 (v1.2) reconciled a targeted Lovable audit: **seven findings confirmed, one rejected on primary-source evidence** (Manitoba), and two *new* defects surfaced in the course of checking it (the one-shot `_split` flag, and the RRSP-vs-PRRIF destination) that neither audit had identified.

The pattern worth carrying into development: **every claim was checked in the code or against a regulator, and one was wrong in each direction** — v1.0 wrongly praised the splitting search; the Lovable audit wrongly condemned Manitoba's `full65`. Neither error would have been caught by agreement. Assertions about financial rules must be verified, whoever makes them — including this document, whose own CONST-UNVERIFIED values (§13.3) remain to be reconciled.

**Per the engagement instruction, no further audit round is recommended.** The open items are implementation work, sequenced in §12. A new audit is warranted only if a genuinely new material calculation error is discovered.