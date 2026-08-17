# Canadian Retirement & Tax Planner — Review and Build Plan

## The review

I read the actual source (3,545 lines, ~125 functions). Here is the honest verdict.

### What Claude got right — and it's the expensive part

The domain engine is real work and it is good. Verified in the file:

- **Correct statutory mechanics.** RRIF minimum factors from the Income Tax Act, the
  published FSRA Ontario LIF-maximum table, CPP adjustment at -0.6%/mo early and
  +0.7%/mo deferred, OAS at +0.6%/mo with the 75+ boost, LIRA/LIF unlocking rules by
  pension jurisdiction.
- **A genuinely sophisticated CPP survivor calculation** — 60% at 65+, flat-rate plus
  37.5% under 65, the 1/120-per-month reduction between 35 and 45, capped at the
  published survivor maximum and again at the combined ceiling. Most planning tools
  get this wrong or skip it.
- **Federal BPA phase-out, age amount phase-out, dividend gross-up and credit, Ontario
  surtax and health premium** — the details that separate a real tax engine from a
  bracket calculator.
- **Household-level income-splitting optimization** rather than naive 50/50.
- Sourced, dated, commented constants. Whoever maintains this can audit it.

**The critical structural finding: the math is portable.** Lines 1284–1730 contain
`bracketTax`, `computeTax`, `householdTax` and `projection`, and across that entire
range there is exactly **one** DOM reference. The tax core is already effectively pure
functions. Meanwhile the file as a whole has 111 `getElementById` calls — all of them
in the UI, input-reading and rendering layers. The valuable part comes out cleanly.

### What blocks it from being a subscription product

| Finding | Evidence in the file | Consequence |
|---|---|---|
| **Zero persistence** | `localStorage` appears **0 times** | Closing the tab destroys the plan. This alone makes "clients keep it as a working document" impossible today. |
| No accounts, no server | Single static HTML | You cannot open a client's plan for support. There is nothing stored to open. |
| **Only 3 provinces** | `TAX` contains `ON`, `BC`, `AB`, `CUSTOM` | You asked for full federal + provincial. Seven provinces and three territories are missing; a Quebec client cannot use it at all (and Quebec needs QPP, not CPP). |
| BC/AB LIF maximums are approximated | Annuity-formula fallback; the file's own disclaimer admits it | Fine for illustration, not for a paid product. |
| One golden-number test | `$276,326` invariant via Playwright | Right instinct, wrong coverage. A single assertion over a 3,545-line engine will pass while a provincial bracket is silently wrong. |
| No scenarios, versioning or audit trail | Strategy stack is in-memory, wiped on reload | You asked for base plan + branches and advisor edit access. Neither is expressible. |
| Input state lives in the DOM | 111 `getElementById`; `readPeople`/`readAccounts` scrape the form | Inputs cannot be saved, diffed, versioned or unit-tested until this is inverted. |

### Recommendation

**Port the engine, rebuild everything around it.** Refining the HTML file cannot reach
logins, saved plans, scenarios, or support access — those require a server and a
database the current architecture has no room for. But rewriting the tax logic from
scratch would throw away the most valuable and hardest-to-verify asset you have.

So: lift the math out essentially verbatim, wrap it in a real test suite, and build a
proper application around it.

## Build plan

### Phase 1 — Port the engine and prove it unchanged

- Extract to typed modules in `src/lib/planning/`: `tax.ts` (brackets, credits,
  surtax, health premium, OAS clawback), `benefits.ts` (CPP/OAS timing, survivor,
  death benefit), `registered.ts` (RRIF minimums, LIF min/max, unlocking, TFSA/RRSP
  room), `projection.ts` (the year-by-year engine), `estate.ts`.
- **Invert the DOM dependency**: `projection()` takes a typed `PlanInputs` object
  instead of reading the form. This is the one real refactor and it unlocks
  persistence, scenarios and testing all at once.
- Move constants into a dated `taxYear` table keyed by year, so 2027 indexation is a
  data edit, not a code change.
- **Port the $276,326 invariant as test #1**, then expand: per-province brackets, OAS
  clawback thresholds, CPP at 60/65/70, all four relationship statuses, survivor cases
  at ages 34/40/50/66, RRIF minimums at 71/85/95, and edge cases (death in year one,
  zero income, income above the top bracket).
- No behaviour changes. The engine must reproduce today's numbers exactly.

### Phase 2 — Complete the Canadian coverage (you asked for depth 5)

- Add the remaining provinces and territories: MB, SK, QC, NB, NS, PE, NL, YT, NT, NU.
- Quebec as its own path: QPP instead of CPP, Quebec abatement, separate provincial
  return treatment.
- Replace the BC/AB LIF approximation with published maximum tables per jurisdiction.
- Each province lands with its own bracket and credit tests before it goes live.

### Phase 3 — Accounts and persistence (Lovable Cloud)

- Client sign-in; plans stored server-side.
- Model: `households` -> `plans` (the base) -> `scenarios` (branches storing only their
  deltas from the base) -> `plan_revisions` (dated snapshots).
- Row-level security so a client reaches only their own household.
- **Store inputs, compute results on demand** — so a tax-table correction silently
  fixes every existing plan instead of leaving stale numbers on file.

### Phase 4 — Client experience

- Guided intake wizard, carrying over the existing step flow and the single
  "Who's in this plan?" question with the four relationship statuses.
- Living dashboard: net worth, cash flow, lifetime tax, estate value, year-by-year
  ledger, charts.
- Scenario compare: base vs. branch side by side (retire at 60 vs 65, delay CPP to 70,
  sell the house), with tax and estate deltas surfaced.
- Keep the strategy analyzer and the fix/solver flows — port them onto stored scenarios
  so applied strategies survive a reload.
- CSV and print/PDF export, as today.

### Phase 5 — Advisor console

- Separate `user_roles` table with an `advisor` role. Never a flag on the client profile.
- Client list, search, open any household's plan.
- Full view and edit as you asked, with an audit trail: who, when, which field, old
  value, new value. Visible to the client.

### Later — subscriptions

Deferred per your answer. Household and entitlement will be separate tables from day
one so CAD recurring billing is additive rather than a migration.

## Technical notes

- TanStack Start with server functions; the tax engine runs server-side, so the logic
  is not shipped to the browser and results cannot be tampered with client-side.
- Lovable Cloud supplies database, auth and row-level security — no external accounts.
- Engine modules stay pure with no I/O; that is what makes the regression suite possible.
- Charts move from Chart.js to Recharts, which is already the React-native fit here.
- Before launch, confirm: PIPEDA handling of client financial data, data residency, and
  that the existing "illustration only, not advice" disclaimer matches your registration.

## Open question for later

The current design assumes an advisor drives the tool with a client in the room. A
self-serve subscriber has no one to interpret the output. Phase 4 should decide how much
guidance the app gives on its own — I'll raise this again when we get there rather than
block the port on it.
