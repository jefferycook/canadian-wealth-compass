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
| (e) | adjustment to survivor's retirement pension under s.55(7) or 55.2(9) after a division of unadjusted pensionable earnings | none | two distinct legal triggers, see "Event (e) detail" below; event month vs payment timing unresolved |

Open questions (not resolved here):
1. Reg. 62 does not say how the s.58(3) product is rounded (see PR #58 notes).
2. Whether several events in one year produce several rebasing runs, and in what order.
3. Whether cessation of a pension is an event; the fetched text lists none.

## Event (e) detail (owner-side verbatim read, current to 2026-09-30; not read by this author)

Source: owner's coordination comment on issue #39 (2026-10-30), which reports a direct read of
s.55 (https://laws-lois.justice.gc.ca/eng/acts/C-8/section-55.html) and
s.55.2 (https://laws-lois.justice.gc.ca/eng/acts/C-8/section-55.2.html). Second-party, unverified by me.

| Branch | Division type | Adjusted benefit effective |
|---|---|---|
| s.55(7) | older provision, qualifying former-spouse divisions | month after receipt of the division application |
| s.55.2(9) | division under s.55.1 | month after the division takes place; benefits newly created by the division are not payable for the division month or earlier |

Do not model both as one "month after division" rule. Still unresolved: what "adjustment" means for the
s.58(3) factor, and how the s.58(3) event month relates to these payment dates. Ss.58(3.1)/(3.4) refer back to events (a)-(e).
Events (a)-(d) predicates have not been re-checked against s.58(3) text by this author.

Next safe step: obtain verbatim s.58(3), (3.1), (3.4) and s.55(7)/55.2(9) text from the owner or a direct read, then design fixtures per event.

## Events (a)-(d) and the ratio: direct s.58(3) read (2026-10-31, this author)

Source: Justice Laws s.58 (https://laws-lois.justice.gc.ca/eng/acts/C-8/section-58.html), fetched in
segments of 125 characters or fewer; the fetch reported no paraphrase. Consolidation date was not shown on the
fetched text, so the "current to 2026-09-30" date in the owner's note is not re-confirmed here.

Statutory triggers (this read agrees with the owner's cross-check on #39):
- (a) survivor's pension became payable by reason of a disability that began after the contributor's death.
- (b) survivor reached 65, not having reached that age at the contributor's death.
- (c) survivor's pension, or survivor's retirement pension, under the Act or a provincial plan commenced to be payable, whichever is the later.
- (d) survivor's pension became payable under the Act in circumstances other than (a), (b) or (c).
- (e) adjustment to the survivor's retirement pension under s.55(7) or 55.2(9) following a division of unadjusted pensionable earnings.

Closing words, shared by s.58(3), (3.1) and (3.4): the portion is multiplied "for months commencing with the month in which"
an event occurs, "by the ratio that the Pension Index for the year that includes that month bears to the Pension Index for
the year in which the contributor died." So the event ratio is PI(year of the month) / PI(year of death), a ratio to the
death year, not a year-over-year chain. How this interacts with the s.45(2) annual chain in PR #58 is unresolved.
Ss.58(3.1) and (3.4) use "paragraphs 3(a) to (e)" and different base amounts, from (3.2) and (3.5).

Still unresolved (trigger text is settled; timing is not): the month in which each event "occurs" for (a), (c) and (d)
(payment-start rules in ss.67 and 72 unread), the whole-month convention in (b), the meaning of "whichever is the later" in
(c) across provincial plans, and rounding of the product. Nothing here is an approved expected value.

## Commencement rules: s.72 (survivor) and s.67 (retirement) vs the s.58(3) event month (2026-10-31, this author)

Status: DRAFT research note. No engine change, no expected values, no payable dollars.
Sources: Justice Laws s.72 (https://laws-lois.justice.gc.ca/eng/acts/C-8/section-72.html) and s.67
(https://laws-lois.justice.gc.ca/eng/acts/C-8/section-67.html), both shown as current to 2026-09-30, last amended 2024-12-17.
The fetch tool reported s.72 as an exact quotation in segments; s.67 was part quotation, part paraphrase (marked below).
Second-party verbatim check still required for every row.

### s.72 survivor's pension: first payable month (subject to s.62, if payment is approved)
| Branch | Start month | Applies when |
|---|---|---|
| 72(a)(i) | month after the month the contributor died | survivor was 35+ or had dependent children at the death |
| 72(a)(ii) | month after the month the survivor became disabled (not yet 65) | survivor not within (a)(i) |
| 72(a)(iii) | month after the month the survivor reached 65 | survivor not within (a)(i) or (ii) |
| 72(b) | month after the month the contributor died | s.44(1)(d)(ii) applies |
| limit | not earlier than the twelfth month before the month after the application was received | all branches |

### s.67(3.1) retirement pension commencing on or after 2012-01-01: latest of
(a) month the applicant reached 60 (quoted); (b) under 65 at application: month after receipt (paraphrase);
(c) 65+ at application: eleventh month before receipt, not before the month of 65 (paraphrase); (d) month chosen in the application (quoted).
Earlier commencements fall under s.67(1), (2), (3), (3.2), (4), which were only paraphrased and are not modelled.

### Mapping to s.58(3) events (candidate predicates, not settled)
| Event | Candidate "month in which it occurs" | Why not settled |
|---|---|---|
| (a) disability after death | s.72(a)(ii) start month, or the month of onset | s.72 says "month following"; s.58(3) says "month in which" the pension becomes payable. Unclear whether the event month is the first paid month or the month before it |
| (b) survivor reaches 65 | month of the 65th birthday | s.72(a)(iii) pays from the month after; the s.58(3)(b) event is the reaching of 65, a different month |
| (c) later of survivor or own retirement pension commencing | the later of the s.72 start and the s.67 start (CPP) or the provincial-plan start | provincial commencement is outside CPP s.67; s.67 branch depends on application history; "commenced to be payable" vs first paid month not distinguished |
| (d) residual | s.72(a)(i) or (b) start month, i.e. the month after the death | which cases are "other than (a)-(c)" is inferred from (a)-(c), not read from text |
| (e) | see "Event (e) detail" | unchanged |

Open items added by this read:
1. s.58(9) "qualified" month, s.44 and s.62 were not read here; do not equate it with the s.72 first paid month.
2. The 12-month retroactivity limit can move the first paid month later than the s.72 branch month; a fixture timeline needs an application-date field.
3. Month-ordering for (c) needs a monthly timeline type (contributor death, birth dates, disability onset, application dates), not annual granularity.
4. No fixture here claims a payable amount. A later executable selector test should only encode predicates once a second party confirms the month convention.

## s.44(1)(d), s.58(9) and s.62: qualification month and payment timing (direct read, 2026-10-31)

Status: DRAFT research note. No engine change, no expected values, no payable dollars.
Sources: Justice Laws HTML downloaded directly (not via a summarising tool) for
s.44 (https://laws-lois.justice.gc.ca/eng/acts/C-8/section-44.html),
s.58 (https://laws-lois.justice.gc.ca/eng/acts/C-8/section-58.html) and
s.62 (https://laws-lois.justice.gc.ca/eng/acts/C-8/section-62.html).
Each page states "Act current to 2026-09-30 and last amended on 2024-12-17". Wording below is quoted from that text;
a second-party check is still wanted before any of it drives a fixture.

### s.44(1)(d) survivor's pension eligibility (quoted)
- (i) "before 2019, to the survivor of a deceased contributor who has made base contributions for not less than the minimum
  qualifying period, if the survivor (A) has reached 65 years of age, or (B) ... not ... 65 ... (I) had at the time of the
  death ... reached 35 years of age, (II) was at the time of the death ... a survivor with dependent children, or (III) is disabled"
- (ii) "after 2018, to the survivor of a deceased contributor who has made base contributions for not less than the minimum
  qualifying period" (no age, dependants or disability condition).

Not settled by the text: whether "before 2019" / "after 2018" is keyed to the death, to the month of entitlement, or to the
application. s.72(a) vs 72(b) turns on which of (d)(i)/(d)(ii) applies, so a fixture needs this answered first.

### s.58(9) "first qualified" month (quoted)
"For the purposes of this section, a survivor first becomes qualified to receive a survivor's pension in the month following
the month in which the survivor first met the criteria of subsection 44(1) in relation to that pension."

Consequences (derived, not stated in the Act):
- It supplies the year used in the s.58(1)/(2) caps ("the later of the year in which the survivor first became qualified ...
  and the year in which the survivor's retirement pension commenced to be payable"). A death in December gives a qualification
  month in January of the next year, so the cap year can differ from the death year.
- Under (d)(ii) the criteria are met in the death month, so the qualification month is the month after death. That coincides
  with the s.72(b) start month, but s.72's 12-month application limit does not apply to s.58(9). The two can differ.
- Under (d)(i)(B) the criteria may be met at 35, at the death, or at disability, so the qualification month is a function of the
  survivor's history, not only the death date.

### s.62 payment timing (quoted)
- s.62(1): payment is made "at such time during the month as the Minister directs, except that, where payment of a benefit is
  approved after the end of the month for which the first payment of the benefit is payable under this Part, monthly payments
  ... shall be made for months commencing with the month following the month in which payment of the benefit is approved and
  payments ... for months preceding that month ... shall be paid in one sum during that month."
- s.62(2): where a benefit is payable commencing with a month, "the benefit shall be deemed to have become payable at the
  beginning of that month."

So s.62 governs when money is paid, not which months are payable. Late approval creates a lump sum for earlier months and does
not move the entitlement month. s.62(2) says a benefit is payable from the beginning of its commencement month, which bears on
"the month in which" wording in s.58(3), but it does not by itself fix which month an event "occurs" in.

### Timeline fields a future selector would need (no code written)
contributor death month; survivor birth month; disability onset month (if any); survivor pension application month; own retirement
pension commencement month (CPP or provincial plan, with plan name); date criteria of s.44(1)(d) first met; s.55(7)/55.2(9)
adjustment month. Each event month remains convention-dependent until the questions above have a second-party answer.

### Still unresolved
1. Keying of "before 2019" / "after 2018" in s.44(1)(d).
2. Whether the s.58(3) "month in which" an event occurs is the entitlement month, the month before the first paid month, or the
   triggering month (see s.72 "month following").
3. Provincial-plan commencement for event (c). 4. Rounding of the s.58(3) product and Reg. 62(3). 5. No Service Canada fixture.
