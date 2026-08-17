# Canadian Retirement & Tax Planner — Review and Build Plan

## Review of the existing work

**What Claude built is genuinely good, and the valuable part is not the app — it's the engine.**

A ~3,500-line self-contained HTML file with a full Canadian retirement, tax and estate
projection engine, verified 2026 federal and provincial constants, CPP/OAS rules,
spousal vs. common-law vs. non-spousal partner handling, income splitting, spousal
rollovers, and survivor benefits. That domain logic represents most of the real work
and it should be preserved, not rewritten from scratch.

**What does not survive contact with a subscription product:**

| Issue | Why it blocks you |
|---|---|
| No accounts, no server, no database | Clients cannot keep a plan as a working document. This is your stated core requirement. |
| Everything runs in the browser from one file | You cannot open a client's plan to support them. There is nothing to open. |
| Tax constants are baked into the file | Every 2027 indexation change means re-shipping the whole app instead of updating a table. |
| One golden-number regression test ($276,326) | Right instinct, wrong coverage. A single assertion over a 3,500-line engine will pass while a provincial bracket is silently wrong. |
| Calculation, UI and state are interleaved | Cannot be unit-tested, cannot be reused for scenarios, cannot be audited. |
| No versioning, no scenarios, no audit trail | You asked for base plan + what-if branches and support edit access. Neither is expressible today. |

**Recommendation: port, don't rebuild, and don't refine in place.** Lift the calculation
engine out into tested TypeScript modules essentially verbatim — same formulas, same
constants, same results — then build a real application around it. Refining the single
HTML file cannot get you to logins, saved plans, scenarios, or advisor support access.

## What I need from you

The `retirement-planner.html` file did not come through with the context document, and
the document itself was truncated on my side. Upload the HTML file and I will work from
the actual source rather than the summary.

## Build plan

### Phase 1 — Port the engine, with a real test suite

- Extract the calculation logic into `src/lib/planning/` as typed modules: tax
  (federal + provincial brackets, credits, OAS clawback), CPP/OAS timing and survivor
  rules, registered account mechanics (RRSP/RRIF minimums, TFSA room, non-registered
  ACB), income splitting, estate and terminal-return treatment.
- Move every 2026 constant into a single dated `taxYear` table so future years are a
  data change, not a code change.
- Port the $276,326 default-plan check as the first test, then expand: per-province
  bracket tests, OAS clawback thresholds, CPP timing, each of the four relationship
  statuses, and edge cases (death year one, zero income, max income).
- No behaviour changes in this phase. The engine must reproduce today's numbers exactly.

### Phase 2 — Accounts and persistence (Lovable Cloud)

- Email/password sign-in for clients; plans persist server-side, not in the browser.
- Data model: `households` -> `plans` (the base plan) -> `scenarios` (what-if branches
  that store only their deltas from the base) -> `plan_inputs` versioned over time.
- Row-level security so a client sees only their own household.
- Results are computed from stored inputs rather than saved, so a tax-table correction
  updates every plan automatically.

### Phase 3 — Client experience

- Guided intake wizard reusing the existing step flow, including the single
  "Who's in this plan?" question with the four relationship statuses.
- Living plan dashboard: net worth, cash flow, lifetime tax, estate value, year-by-year
  projection table and charts.
- Scenario compare: base plan side by side with branches (retire at 60 vs 65, sell the
  house, delay CPP to 70), with the tax and estate deltas surfaced.
- Return-and-update flow so the plan behaves as a working document, with dated snapshots.

### Phase 4 — Advisor console

- Separate `user_roles` table with an `advisor` role — never a flag on the client profile.
- Client list, search, and the ability to open any household's plan.
- Full view and edit access as you asked, with an audit trail: every advisor change
  records who, when, which field, old value and new value. Clients can see that an
  advisor made a change.

### Later — subscriptions

Deferred as you requested. The data model will separate household from entitlement now
so adding CAD recurring billing later is additive rather than a migration.

## Technical notes

- TanStack Start with server functions; the tax engine runs server-side so the logic is
  not shipped to the browser and results cannot be tampered with client-side.
- Lovable Cloud provides the database, auth and row-level security with no external accounts.
- Engine modules are pure functions with no I/O, which is what makes the regression suite
  possible.
- Compliance items to confirm before launch: PIPEDA handling of client financial data,
  data residency, and whether output needs a "projection, not advice" disclaimer given
  your registration.
