# CPP-5: s.58(3) event-rebasing coverage matrix (research only, not approved)

Status: DRAFT research note. No engine change, no expected values, nothing wired into production.
Source read 2026-10-31: CPP Act s.58 (Justice Laws, https://laws-lois.justice.gc.ca/eng/acts/C-8/section-58.html).
The fetch tool quotes in segments and may paraphrase, so every row needs a verbatim second-party check.

Reading: the factor applied to the deceased contributor's retirement-pension portion for months
commencing with the month in which one of the events below occurs. Ss.58(3.1) and 58(3.4) reuse
the same five events (per the fetched text).

| Event | s.58(3) wording (fragment) | Workbench handling today | Gap |
|---|---|---|---|
| (a) | survivor's pension payable by reason of a disability that began after the death | none; fails closed | trigger date, month convention, payment timing (ss.67, 72) unread |
| (b) | survivor reached 65, not having been 65 at the death | `cpp5-experimental.ts` ~L150 notes "has reached 65" vs whole month; fails closed | whole-month convention unverified |
| (c) | survivor's or retirement pension (this Act or provincial plan) commenced, whichever is later | none | "whichever is later" ordering across plans unmodelled |
| (d) | survivor's pension payable under this Act in circumstances other than (a)-(c) | none | residual-case boundaries unverified |
| (e) | adjustment to survivor's retirement pension under s.55(7) or 55.2(9) after a division of unadjusted pensionable earnings | none | s.55 provisions unread |

Open questions (not resolved here):
1. Reg. 62 does not say how the s.58(3) product is rounded (see PR #58 notes).
2. Whether several events in one year produce several rebasing runs, and in what order.
3. Whether cessation of a pension is an event; the fetched text lists none.

Next safe step: obtain verbatim s.58(3), (3.1), (3.4) and s.55(7)/55.2(9) text from the owner or a direct read, then design fixtures per event.
