# PROPOSED amendment — CPP survivor age rule after 2018 (NOT APPLIED)

> **Status: PROPOSAL for owner approval.** This file does **not** change
> `docs/CANONICAL-ENGINE-SPECIFICATION-v1.2-FINAL.md`. The canonical
> specification's normative text stays as it is until the owner explicitly
> approves and applies an amendment. Prepared for issue #78; accompanies the
> draft engine change in the same pull request.

## 1. Scope

Covers **only**:

- removal of the under-35 zero; and
- removal of the 35–44 1/120-per-month survivor age taper

for CPP survivor's pensions **payable after December 2018**, with the pre-2019
rule kept for historical payable dates.

Out of scope: the combined retirement/survivor calculation (s.58(2)),
the s.46(3)–(6) disregard, rebasing, rounding, indexing, any golden or
`VERIFIED` change. Absolute payable amounts are not certified.

## 2. Statutory basis

Primary text: Justice Laws, *Canada Pension Plan* (R.S.C. 1985, c. C-8),
consolidation current to 2026-10-19, last amended 2024-12-17. Read
2026-11-13:

- https://laws-lois.justice.gc.ca/eng/acts/C-8/section-44.html
- https://laws-lois.justice.gc.ca/eng/acts/C-8/section-58.html

| Provision | Applies to | Rule (paraphrased) |
|---|---|---|
| s.44(1)(d)(i) | survivor's pension paid **before 2019** | An under-65 survivor qualifies only if they (I) were 35+ at the contributor's death, (II) had dependent children at that time, or (III) are disabled. |
| s.44(1)(d)(ii) | survivor's pension paid **after 2018** | Paid to the survivor of a contributor who met the minimum qualifying period. **There is no age condition.** |
| s.58(1)(a) | any month **before January 2019**, survivor under 65, no retirement pension | Flat rate + 37.5%, reduced by 1/120 for each month the survivor was under 45 at the contributor's death. The reduction does not apply if the survivor had dependent children or is disabled, and it is re-applied when that status ends. |
| s.58(1)(a.1) | any month **after December 2018**, survivor under 65, no retirement pension | Flat rate + 37.5%. **There is no age reduction.** |
| s.58(1)(b) | survivor 65+, no retirement pension | 60%. This row is unchanged. |

The boundary falls on a calendar-year edge (December 2018 / January 2019), so
an annual model can represent it exactly.

## 3. Proposed text for §4.4 (replaces the four survivor-age bullets)

Current text (lines 711–714):

> - survivor **65+** → **60%** of it;
> - survivor **45–64** → **flat-rate portion + 37.5%** of it;
> - survivor **35–44** → same, reduced 1/120 per month under 45;
> - under 35 (no child/disability) → none;

Proposed text:

> - survivor **65+** → **60%** of it (s.58(1)(b));
> - survivor **under 65**, payable **after December 2018** → **flat-rate
>   portion + 37.5%** of it. Age alone has no exclusion and no reduction
>   (s.44(1)(d)(ii), s.58(1)(a.1)). Every year of the engine's 2026-forward
>   projection falls under this rule;
> - **historical rule, payable before January 2019 only** (s.44(1)(d)(i),
>   s.58(1)(a)), with no dependent children and no disability: under 35 →
>   none; 35–44 → reduced 1/120 per month under 45. The engine keeps this
>   rule behind `CPP_SURVIVOR_LEGACY_AGE_RULE_LAST_YEAR = 2018` and an explicit
>   `payableYear`. Known legacy approximation: the statute measures age at the
>   contributor's death, but the engine uses the survivor's age in the payable
>   year;

Proposed replacement for the **Tests** bullet (line 718):

> - **Tests:** 60% at 65+; flat + 37.5% for every under-65 age at a post-2018
>   payable year (ages 20–64); 1/120 reduction 35–44 and zero under 35 **only
>   for a payable year ≤ 2018**; a full projection in which a survivor under
>   35 receives the untapered pension; combined-max cap binds for a survivor
>   with a large own pension; $2,500 death benefit once.

Proposed replacement for the source-table row (line 1267, rule column only):

> 2026 CPP/OAS amounts and CPP survivor rules (60% at 65+; flat-rate + 37.5%
> under 65 for post-2018 payable months, s.44(1)(d)(ii)/s.58(1)(a.1); pre-2019
> 1/120 reduction 35–44 and under-35 exclusion retained for historical
> payable years only; survivor and combined maximums; $2,500 death benefit)

The phrase "should be preserved verbatim" (line 716) would then apply to the
amended rule set.

## 4. Engine and test mapping (same PR)

- `src/lib/planning/benefits.ts`: `cppSurvivorBenefit(..., ty, payableYear = ty.year)`
  applies the age rule only when `payableYear <= 2018`.
- `src/lib/planning/projection.ts`: passes the projection calendar year `yr`
  as `payableYear`.
- `benefits.test.ts` / `engine.test.ts`: post-2018 invariants, plus pre-2019
  boundary tests at payable year 2018 and 2019.
- `cpp-survivor-post2018.contract.test.ts`: #73's RED contract, now GREEN.
- `cpp-survivor-young-couple.projection.test.ts`: full 2026-forward projection
  with a survivor aged 32 at the payable date.

## 5. Open points for the reviewer

1. Eligibility still assumes the deceased met the minimum qualifying period
   whenever the plan type is married/common-law (unchanged behaviour).
2. The pre-2019 branch uses current age instead of age at death and ignores
   dependent children and disability. It cannot be reached from a 2026-forward
   projection and is not proposed as `VERIFIED`.
3. Other documents still describe the old rule (`docs/AGENT-STATUS.md`,
   `docs/IMPLEMENTATION-CHANGELOG.md`). Updating them is left for the owner's
   decision on this amendment.
