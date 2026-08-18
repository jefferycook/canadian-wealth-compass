# Feature-parity audit: Claude prototype vs. current app

No code changed. The uploaded file is the shipping build of the same prototype audited earlier
(3,594 lines; identical to the readable copy apart from the inlined Chart.js and font). Status
codes: **KEPT** (fully preserved), **ENGINE-ONLY** (in the engine, not reachable in the UI),
**PARTIAL**, **MISSING**, **DIFFERENT**, **SUSPECT** (present but possibly incorrect).

## Household / client data

| Claude feature | Status | Where in current code | Lost / changed | Action |
|---|---|---|---|---|
| Single vs couple | KEPT | `types.ts` `PlanType`; wizard "Who does this plan cover?" | — | KEEP |
| Married | KEPT | `PlanType: "married"` | — | KEEP |
| Common-law | KEPT | `PlanType: "commonlaw"` | — | KEEP |
| Non-married partners (no splitting, no rollover, no survivor CPP) | KEPT | `PlanType: "partners"`; `tax.householdTax(canSplit)`; `projection.ts` | — | KEEP |
| Separate ages | DIFFERENT (better) | `PersonDraft.dob` + `ageFromDob` | Age replaced by date of birth | KEEP |
| Separate retirement ages | KEPT | per-person `retAge` | — | KEEP |
| Employment income | KEPT | per-person `employ` | Prototype had no salary growth either | IMPROVE later |
| Death ages / survivorship | KEPT | `deathAge` field in wizard; survivor logic in `projection.ts` | — | KEEP |
| Pension survivor % | KEPT | `survivorPct` (Spending step) | Placement is odd — belongs with the pension | IMPROVE |
| Gender | ENGINE-ONLY | `PersonInput.gender` | No input; unused downstream | KEEP (or drop) |

## Accounts

| Claude feature | Status | Where | Lost / changed | Action |
|---|---|---|---|---|
| RRSP / RRIF / TFSA / non-registered / LIRA / LIF / DCPP | KEPT | `AccountType`, wizard type select | — | KEEP |
| Joint ownership | PARTIAL | `owner` field exists incl. JOINT | Joint non-registered income is not split 50/50 the way the prototype's joint card assumed | RESTORE/verify |
| Account-specific returns | DIFFERENT (better) | preset dropdown + custom rate | Prototype derived return from the equity mix only | KEEP |
| Equity / fixed-income mix per account | MISSING (by your instruction) | `AccountInput.eq` still in the model | Removed from the UI at your request; the Investments "overall mix" chart depends on it | DECIDE |
| Contribution amounts | KEPT | "Annual contribution" | — | KEEP |
| Contribution end ages | ENGINE-ONLY | `contribEnd` (hard-coded 0 in wizard) | No input — contributions never stop unless the engine defaults | RESTORE |
| Scheduled withdrawals (`wd`, `wdStart`, `wdEnd`) | ENGINE-ONLY | `AccountInput.wd/wdStart/wdEnd`, set to 0 | Whole feature unreachable | RESTORE |
| Conversion ages (RRSP→RRIF, LIRA→LIF) | ENGINE-ONLY | `conv` hard-coded 0 | Auto-conversion still happens at 71; a chosen earlier age cannot be entered | RESTORE |
| Pension jurisdiction | ENGINE-ONLY | `juris` hard-coded "ON" | An Alberta LIRA is modelled with Ontario rules | RESTORE (correctness) |
| Unlock % on conversion | KEPT | "Unlock on conversion" | — | KEEP |
| Adjusted cost base | KEPT | "Adjusted cost base" | — | KEEP |
| Non-registered income mix (interest / dividend / capital gain split) | ENGINE-ONLY | `mix {int, div, cg}` hard-coded 30/30/40 | Directly changes tax; not editable | RESTORE |

## Income

| Claude feature | Status | Where | Lost / changed | Action |
|---|---|---|---|---|
| Employment | KEPT | Income step | — | KEEP |
| CPP amount + start age | KEPT | Income step; `benefits.ts` | Plus an estimator the prototype lacked | KEEP |
| OAS amount + start age | KEPT | same | — | KEEP |
| DB pension amount + start age | KEPT | Income step | — | KEEP |
| Bridge benefit + end age | PARTIAL | `BridgeInput` in model; "Bridge benefit (per year)" in wizard | Bridge **end age** not exposed | RESTORE |
| Other taxable income | KEPT | Other income step | — | KEEP |
| Other non-taxable income | KEPT | taxable toggle | — | KEEP |
| Ownership of other income | KEPT | "Whose income is it?" | — | KEEP |
| Future lump sums | KEPT | lump-sum list with destination account | — | KEEP |
| Indexing toggle per stream | KEPT | `indexed` | — | KEEP |

## Planning

| Claude feature | Status | Where | Lost / changed | Action |
|---|---|---|---|---|
| Annual after-tax spending target | KEPT | Spending step | — | KEEP |
| Current (pre-retirement) spending | DIFFERENT (better) | monthly field | Monthly only, by your instruction | KEEP |
| Major future expenses | KEPT | expense list (what / age / amount) | — | KEEP |
| Hard assets | KEPT + IMPROVED | purchase price, sale cost, future purchase and sale dates | Prototype had no ACB or sale costs | KEEP |
| Home downsizing (partial sale at an age) | MISSING (removed at your request) | `assetMod` override still supported | Downsize strategy card has nothing to drive | DECIDE |
| Liabilities | KEPT + IMPROVED | rate, amortization, monthly payment | Prototype took an annual payment | KEEP |
| Estate goal | MISSING | — | `goalEstate` had no port | RESTORE |
| Retirement income goal | DIFFERENT | `goalProgress()` + sustainable-spend metric | Prototype's `goalIncome`/`goalAcct` inputs are gone | IMPROVE |

## Projection engine

Year-by-year projection, inflation, growth, withdrawals, taxes, RRIF minimums, LIF minimums and
maximums, survivorship, spousal rollover at death, OAS clawback, non-registered ACB tracking,
capital gains, dividend gross-up and credit, and optimized pension splitting are all **KEPT** and
covered by 53 tests including the $276,326 invariant (`projection.ts`, `tax.ts`, `registered.ts`,
`benefits.ts`, `engine.test.ts`).

Two caveats:

- **SUSPECT — LIF maximums outside Ontario.** `registered.ts` line 100 states its own fallback is an
  annuity-formula approximation. Same limitation as the prototype; not a regression, but it
  contradicts the landing copy.
- **PARTIAL — province coverage.** `taxYears.ts` carries ON, BC, AB, CUSTOM only, as did the
  prototype. The landing page claims full provincial coverage.

## Strategy / optimization

| Claude feature | Status | Where | Lost / changed | Action |
|---|---|---|---|---|
| Withdrawal-order testing | KEPT | `engine.runPlan` auto-solver; `compareStrategies` | Table shown, but no "why this won" narrative | IMPROVE |
| Save more | PARTIAL | lever slider | No solved amount, no room-aware TFSA→RRSP→non-reg cascade (`buildAlloc`), no room cap | RESTORE |
| Spend less | PARTIAL | lever slider | No solved trim | RESTORE |
| Spend more (headroom ceiling) | MISSING | — | `buildDynCards` solved the extra spend the plan can carry | RESTORE |
| Retire earlier | MISSING | levers only defer | Prototype solved the earliest supportable age | RESTORE |
| Retire later | PARTIAL | lever slider | No solved smallest deferral | RESTORE |
| CPP timing | PARTIAL | slider | Prototype tested every age 60–70 and named the best | RESTORE |
| OAS timing | PARTIAL | slider | Prototype tested 65–70 and named the best | RESTORE |
| RRSP→RRIF conversion strategy | ENGINE-ONLY | `acctMod` override | No card | RESTORE |
| Locked-in unlocking strategy | ENGINE-ONLY | `unlockAll` override; `unlockRec` never computed | Prototype quantified short years, tax and estate impact | RESTORE |
| Downsizing strategy | ENGINE-ONLY | `assetMod` override | Prototype tested every downsize age | DECIDE with the input above |
| Combining strategies | MISSING | `isolate()` in `levers.ts` scores each lever alone | No combined attribution, no cumulative applied-strategy stack | REWRITE |
| Solve for the smallest change that fully funds the plan | MISSING | — | `solveFullFix` (savings, spending, balanced combo) not ported | RESTORE |
| Apply a strategy to the plan | MISSING | — | Every prototype card had `apply()` | RESTORE |
| Sweep analysis charting every option | MISSING | — | `runSweep` | RESTORE (P3) |
| Market shock scenario | ENGINE-ONLY | `ProjectionOverride.shocks` | No UI | RESTORE |

## Output / user experience

| Claude tab | Status | Where | Lost / changed | Action |
|---|---|---|---|---|
| Retirement dashboard | KEPT | `PlanResults.tsx` | — | KEEP |
| Cash-flow analysis | PARTIAL | `levers.cashflowView` | No sources-of-income-by-year view; `PlanOutput` doesn't carry per-year income components | RESTORE |
| Tax planning tab | MISSING | — | Bracket position, tax-by-year chart, tax opportunities all gone; `summarize()` drops per-year `splitAmt`, `oasClaw`, `margRate` | RESTORE |
| Net worth | KEPT | `netWorthView` + tab | — | KEEP |
| Investment analysis | MISSING | — | Mix chart, per-account view, available-investments-over-time, deposits | RESTORE (needs the mix input decision) |
| Insurance analysis | MISSING | — | Needs analysis (income replacement + debts + final expenses − liquid assets) and coverage inputs | RESTORE |
| Estate analysis | PARTIAL | `afterTaxEstate()` single number | No settle-at-age input, no estate-at-any-age chart, no probate, no "keep more in the family" tips | RESTORE |
| Scenarios / What if | PARTIAL | `PlanLevers.tsx` | No base-vs-scenario comparison KPIs or overlay chart; no shock | RESTORE |
| Strategies | PARTIAL | strategy table | No mixer, no apply, no stack | REWRITE |
| Recommendations | PARTIAL | 8 static if-branches in `analysis.buildRecommendations` | No solved values, no sliders, no measured impact, no apply | REWRITE |
| Insights (triaged flags) | MISSING | — | `renderFlags` grouped into Needs attention / Worth watching / Working well with "See fixes →" deep links | RESTORE |
| Year-by-year detail table | MISSING | — | `PlanOutput.chart` has 11 fields; the prototype's Details table had income, tax, splitting, clawback, LIF binding | RESTORE |
| Summary / printable report | MISSING | — | Print/PDF summary page | RESTORE |
| Plain-language explanations | PARTIAL | some hints | The prototype's narrative voice throughout is largely gone | IMPROVE |
| Advisor / lead generation | MISSING | — | Booking card, email plan, prep checklist | DECIDE (positioning) |
| Plan assistant | MISSING | — | Rule-based Q&A over the plan | RESTORE (as an AI assistant) |

## A. Lost and should be restored

Solved recommendations and the complete-fix solver; the room-aware savings cascade; combining
strategies with a cumulative applied-strategy stack; apply-to-plan; triaged insights; the Tax,
Investments, Insurance, Estate, Details and Summary sections; scenario-vs-base comparison; the plan
assistant; contribution end age, conversion age, jurisdiction, scheduled withdrawals, non-registered
income mix and bridge end age as inputs; the estate goal.

## B. In the engine, needs UI

`contribEnd`, `conv`, `juris`, `wd/wdStart/wdEnd`, `mix{int,div,cg}`, `eq`, bridge end,
`ProjectionOverride.shocks`, `unlockAll`, `acctMod`, `assetMod`, and the per-year fields
`projection.ts` already produces (`splitAmt`, `oasClaw`, `margRate`, `lifBound`, income components)
that `summarize()` currently discards.

## C. Do not copy Claude's implementation as-is

- Card `apply()` wrote into DOM inputs — must become a persisted, replayable strategy stack.
- Solvers ran unbudgeted projection sweeps; server-side they need a run budget and caching.
- Funded % is a compressed metric (it adds up to +49 for estate). Keep the sustainable-spend
  bisection as the headline and use funded % only as a secondary badge.
- Estate math (62% / 92% / 100% haircuts) is a rule of thumb; replace with a real terminal return.
- Insurance needs analysis was crude; rebuild with the survivor projection the engine already runs.
- The prototype's advisor tab was a static form; if kept, it should be a real lead flow or dropped.
- Rule-based assistant should become a real AI assistant over the plan's own numbers.

## D. Lovable architecture to retain

Server-side engine (`plans.functions.ts`) keeping tax rules off the client; pure typed modules with
a 53-test suite and the $276,326 invariant; statutory constants isolated in `taxYears.ts`; the
null-based `PlanDraft` with no pre-filled personal values; date of birth; per-account return presets;
`sustainableSpend()`; accounts, RLS persistence, the wizard, Recharts, and the CPP/OAS estimator and
mortgage math the prototype never had.

## E. Proposed migration plan (not to be implemented yet)

1. **Widen the output contract.** Extend `PlanOutput` with the per-year detail `projection.ts`
   already computes (income components, tax detail, splitting, clawback, marginal rate, LIF binding,
   deposits). Everything below depends on this; nothing in the engine changes.
2. **Re-expose the dormant inputs.** Advanced sections in the wizard for contribution end age,
   conversion age, jurisdiction, scheduled withdrawals, non-registered income mix, bridge end.
   Jurisdiction is a correctness fix, not a nicety.
3. **Solver layer.** New `src/lib/planning/solver.ts`: shared bisection, room-aware allocation, and
   `solveFullFix` (savings / spending / balanced combo), with a server-side run budget and caching.
4. **Recommendations as solved, adjustable cards.** Each card carries a solved value, slider bounds,
   an override builder and a measured impact. Combined scoring with marginal attribution replaces
   `isolate()`.
5. **Apply-to-plan and the strategy stack.** An ordered list of applied strategies stored on the
   plan and replayed over the base draft, each with before/after numbers, individually removable.
6. **Restore the analysis sections** as route-level tabs: Tax, Investments, Insurance, Estate,
   Details, Summary/print, and triaged Insights with deep links into their fixes.
7. **Scenario compare.** Base vs. scenario KPIs and overlay chart, including market shocks; persisted
   as named scenarios alongside the plan.
8. **Plan assistant** over the widened output, using the platform AI gateway.
9. **Engine depth beyond Claude.** Remaining provinces and territories (Quebec on its own QPP path),
   published LIF maximum tables, real terminal-year estate tax, salary growth, and joint-account
   income attribution.
10. **Claims and copy.** Align the landing page with what ships at each stage; generate a real "why
    this drawdown order won" explanation.

Sequencing note: steps 1–2 unlock everything else and carry the correctness fixes, so they should
land first even though steps 4–6 are the visible product.
