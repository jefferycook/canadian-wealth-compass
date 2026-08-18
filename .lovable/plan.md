# Stabilization A/B + Product Parity — diagnosis and plan

No code has been changed for this item. Batch 0.1 (pension splitting) stays as is; Batch 0.2 is not started.

## 1. Root cause of the "money runs out at age 33" result

The underlying projection is **correct**. The depletion flag on top of it is **wrong**.

`src/lib/planning/projection.ts` (last lines of the yearly loop) writes:

```ts
depleted: totalPortfolio <= 1,
```

That is the only definition of depletion in the whole system. It says nothing about
whether the household actually failed to fund its spending — it says only "the sum of
investment account balances is (near) zero this year".

`src/lib/planning/engine.ts`:

```ts
export function depletionAge(P) { return P.rows.find(r => r.depleted)?.age ?? null; }
```

returns the **first** such year, so an empty portfolio in year one is reported as
"money runs out at your current age".

### Reproduction

I ran the engine directly on an age-33 accumulator (retire at 60, $110k employment,
$48k current spending, positive surplus):

| variant | depletion age | shortfall years |
|---|---|---|
| with two accounts holding balances | 94 | 2 |
| same plan, **no investment account balances** | **33** | 0 |

Year-by-year for the failing variant, ages 33–38:

| age | employment | spend target | tax | after-tax cash | contributions | withdrawals | portfolio | shortfall | depleted |
|---|---|---|---|---|---|---|---|---|---|
| 33 | 110,000 | 48,000 | 24,721 | 85,278 | 0 | 0 | 0 | 0 | **true** |
| 34 | 112,309 | 49,007 | 25,524 | 86,785 | 0 | 0 | 0 | 0 | true |
| 35 | 114,668 | 50,037 | 26,419 | 88,249 | 0 | 0 | 0 | 0 | true |
| 36 | 117,076 | 51,087 | 27,333 | 89,742 | 0 | 0 | 0 | 0 | true |
| 37 | 119,535 | 52,160 | 28,400 | 91,134 | 0 | 0 | 0 | 0 | true |
| 38 | 122,045 | 53,256 | 29,490 | 92,554 | 0 | 0 | 0 | 0 | true |

Note the shortfall column: **zero**. Employment income fully covers spending. The ledger
is right; the flag is wrong. Every ruled-out hypothesis from your list was checked:
age/DOB, retirement age, `currentSpend` vs `spendNeed`, employment income inclusion,
double-counted contributions, contributions reducing balances, the solver running during
accumulation (it correctly solves G = 0), and the chart. None of them misbehaves.

So the trigger is any plan whose **total investment balance is ~0 in the first year** —
which is exactly what happens when a client has entered household, income and spending
but has not yet entered account balances, or holds only accounts they are about to start
funding. The plan is then reported as failed from day one.

### Blast radius (why this poisons the whole app)

`depletionAge` is consumed by:

- `src/lib/planning/analysis.ts` — `goalProgress().onTrack`, `compareStrategies`, `buildRecommendations`
- `src/lib/planning/levers.ts` — `isFunded()` (line 118), `scorePlan`, the sustainable-spend bisection, every lever result
- `src/components/plan/PlanResults.tsx:53` — the "Plan lasts until" KPI
- `src/components/plan/PlanInsights.tsx:197` — the "Money runs out" column

so one bad flag turns every strategy, score and recommendation into "not on track".

### Secondary defects found while tracing (not the cause, logged for later)

1. Contributions increase balances but are **never subtracted from available cash**
   (`projection.ts` step 5) — saving is currently free. Belongs with Batch 0.4/0.5.
2. Surplus after-tax cash is **discarded**, not reinvested — already scheduled as Batch 0.5.
   Combined with (1), accumulation-year balances are driven only by explicit `contrib`
   fields, which is why an empty-account plan stays flat at zero forever.

## 2. Proposed fix (Stabilization A)

Small, isolated, no methodology change:

1. **`projection.ts`** — redefine the flag as a funding failure, not a zero balance:
   `depleted = shortfall > 1 && totalPortfolio <= 1`. Also record `hadPortfolio`
   (whether the household has ever held investable assets) on the result.
2. **`engine.ts` `depletionAge()`** — return the first depleted year **only after** the
   portfolio has been non-zero at some point; otherwise `null`. A plan that never had
   investments cannot "run out".
3. **`summary.ts`** — carry a distinct `noInvestableAssets` signal so the UI can say
   "no investment accounts entered yet" instead of "your money runs out".
4. **UI** (`PlanResults`, `PlanInsights`) — render that state as an intake prompt, not a
   failure.

No change to tax, withdrawal, growth or estate logic. Batch 0.1 untouched.

## 3. Regression tests (Stabilization B)

New fixture `accumulatorFixturePlan()` in `fixtures.ts`: age 33, retire at 60,
employment through 59, spending below after-tax employment income, positive annual
savings, existing investment assets. Assertions:

- No shortfall year between ages 33 and 59.
- Total financial assets rise every year from 33 to 59.
- `depletionAge` is null, and `depleted` is false in every accumulation year.
- Empty-portfolio variant (no accounts): `depletionAge` is null and no year is flagged
  depleted while shortfall is zero.
- Single-account-empties variant: one account hits zero while others hold balances —
  household is not reported depleted.
- Existing $276,326 single-filer regression and the Batch 0.1 splitting tests unchanged.

## 4. Product parity plan (Claude capability on the Lovable architecture)

Engine stays as is; this is presentation and scenario plumbing over the ledger that
`PlanOutput.years` already carries.

**P1 — Full Plan information architecture.** Convert the plan route into a workspace with
sections: Overview, Retirement, Cash Flow, Tax Planning, Strategies, Recommendations,
What If, Net Worth, Investments, Estate, Plan Summary, Plan Details, Insights. Insurance
deferred until the engine supports it.

**P2 — Year-by-year details table.** Expandable ledger straight off `PlanYearDetail`:
income sources, withdrawals by account, tax, splitting, clawback, spending, contributions,
closing balances, per-year explanation of the result.

**P3 — Charts, all fed by real projection data.** Total financial assets, balances by
account/type, retirement income by source, employment vs retirement income, spending vs
after-tax cash flow, taxable income, income tax, OAS recovery tax, net worth, assets and
liabilities, estate projection, annual surplus/shortfall.

**P4 — Interactive scenario tests (not "advice").** Each supported lever (CPP age, OAS
age, retirement age, spending, savings, withdrawal strategy) gets Preview → current vs
proposed on lifetime tax, sustainable spending, estate, funding, balances and years
affected, then Apply to scenario / Compare with baseline / Undo. Every preview re-runs the
real engine server-side; no cosmetic adjustment. No new financial recommendations are
invented while the optimizer is paused.

**P5 — Scenario persistence.** Named scenarios (Baseline, Retire at 58, CPP at 70, spend
+$10k, downsize at 70, alternate withdrawal order) stored against the plan and replayed
through `runPlan` with overrides, with side-by-side comparison.

**P6 — Resume Phase 0.2** and the remaining financial-correctness batches.

Sequencing: Stabilization A → B → P1 → P2 → P3 → P4 → P5 → Phase 0.2.
