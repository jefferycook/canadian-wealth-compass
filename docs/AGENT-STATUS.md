# Agent status — shared coordination note

Maintained by whichever agent finds an issue. Purpose: ChatGPT, Claude and Lovable
can all see current blockers without Jeff relaying them. Update the entry until it is
resolved, then move it to **Resolved**.

**Last updated:** 2026-08-21 · by Claude (via Lovable MCP)

---

## OPEN — Erratum 5: transferee's pension credit (Batch 0A)

**Affected batch:** 0A (already approved) — with a knock-on effect on 0C's regression expectations.

**Status:** Fix specified and approved by Jeff. **Not yet applied.** Paused to avoid two agents writing to the same engine files at once.

**What was found.** During the Batch 0A audit, `householdTax()` in `src/lib/planning/tax.ts` does `ti.pensionEligible += T`, so a spouse *receiving* split pension income earns the $2,000 pension income amount regardless of their own age.

Verified against CRA (pension income splitting / Form T1032, checked 2026-08-21):

> "The pension that qualifies for the pension income amount for the transferring spouse or common-law partner **does not necessarily qualify** for the pension income amount for the receiving spouse or common-law partner because eligibility can depend on age."

CRA confirms RRIF/RRSP-annuity income qualifies for the **receiving** spouse only when that spouse is 65+ (or receives it due to a spouse's death); RPP lifetime retirement benefits qualify at any age.

This is a **defect in the canonical specification**, not in the implementation — a single scalar `pensionEligible` cannot express the receiving spouse's independent age test, and Lovable built exactly what the spec said. The split itself remains valid; only the transferee's line 31400 claim was wrong.

**What is being corrected.** Erratum 5 splits `pensionEligible` into two typed streams:

- `pensionEligibleAnyAge` — RPP lifetime pension + a bridge affirmed as `RPP_LIFETIME`; credit-eligible at any age for pensioner and transferee.
- `pensionEligible65Plus` — RRIF/LIF/PRRIF cash; credit-eligible for a **transferee** only at 65+.

Credit base becomes `anyAge + (age >= 65 ? p65 : 0)`. The transferor's splittable pool is unchanged at 50% of both streams; a transfer is drawn **proportionally** from the two streams (T1032 elects a single amount from one pool, so the any-age portion cannot be cherry-picked).

**Impact other agents must know about.**

- The **couple golden anchor `554616` WILL move upward** when Erratum 5 lands. In `coupleGoldenFixturePlan` person B is 64 in year one and currently claims a credit they are not entitled to.
- The Batch 0C plan pins `554616` as a must-not-move value and instructs Lovable to stop and report if it shifts. **That instruction is correct for 0C's own changes** — 0C must not move it. But the figure is scheduled to change for an unrelated, approved reason. Do not treat the post-Erratum-5 movement as a 0C regression.
- The single-filer anchor `278614` and the accumulation anchor `2254682` are **not** affected by Erratum 5 (no transfer path for a single filer; the accumulation fixture's split composition is unaffected by the transferee age test only where both spouses are under 65 — verify at implementation).

**Sequencing.** Awaiting Jeff's decision between: (a) let 0C finish, then land Erratum 5 and re-pin the couple anchor once; (b) pause 0C and land Erratum 5 first; (c) route Erratum 5 through whichever agent is driving 0C. Option (a) is Claude's recommendation — one clearly attributable anchor movement.

---

## OPEN — Coordination: concurrent instruction of Lovable

**Status:** Advisory, no action blocked.

At 2026-08-21 05:21–05:23 Batch 0C was planned and instructed by one agent while another was mid-audit on Batch 0A. A Claude instruction sent in the same window timed out and did not land, which happened to prevent a concurrent write to `tax.ts` and `projection.ts`.

**Suggested working rule:** one agent instructs Lovable at a time; the others read, audit, and record findings here. The same failure mode produced an earlier issue where the repo's canonical spec was one erratum behind what an agent was working from.

---

## Resolved

*(none yet)*
