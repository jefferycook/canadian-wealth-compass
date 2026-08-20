# Strategies, Recommendations and What If — workspace redesign (revised)

No change to financial-engine methodology. Every displayed impact comes from a real
`runPlan()` re-run through one shared execution path. React never computes a financial delta
from scratch — it only subtracts two engine-produced metric objects for display.

## Canonical execution path

```text
Baseline PlanDraft + ScenarioPatch
  -> applyPatch (draft-level edits: spending, returns, inflation, one-time expense,
                 property sale age, strategy, verified unlocking)
  -> normalizeDraft (units + statutory fallbacks)
  -> PlanInputs + ProjectionOverride (retAdj, goalSaves, CPP/OAS mods, return adjustment)
  -> runPlan()
  -> summarize() + metrics + chart series + year ledger
```
`src/lib/planning/scenario.ts` owns `ScenarioPatch`, `scenarioInputs`, `scenarioOverride`,
`runScenario`, `runStrategyComparison`, `runScenarioSet`. Strategies, Recommendations and
What If all call it — there is no second path.

### ScenarioPatch (serializable, stored in `plan_scenarios.overrides` in Batch 2)
retirement deferral years · CPP age · OAS age · retirement spending $/mo · current spending $/mo ·
extra saving $/mo + destination account · withdrawal strategy · equity return · fixed-income return ·
investment-return adjustment · inflation · one-time future expense {age, amount} ·
property sale age for an existing asset · verified locked-in unlocking %.

## 1. Strategies workspace

```text
[ Current strategy card ]
   Label: "Current Auto selection" when the engine picked it
   "Selected from the currently supported withdrawal strategies using the engine's
    current scoring rule: fewest years of unfunded spending, then largest after-tax estate."
   Stats: lifetime tax · estate after income tax · funding (funded / N short years, first
          shortfall age) · sustainable retirement spending $/month
[ Comparison cards ] Non-registered first · Registered first · TFSA first · Pro-rata · Auto
   each from its own re-run: lifetime tax · estate · sustainable $/month · shortfall years ·
   ending assets, with delta chips vs the current run
   [Preview] [Compare with current]
[ Preview panel ] CURRENT | PREVIEWED metric table + portfolio-over-time overlay chart
   [Apply to scenario]   (Baseline is never touched here)
   expandable year-by-year ledger for the previewed run
```
No card is called optimal. Ranking language stays comparative ("lowest lifetime tax among the
supported orders"), and the Auto rule is stated wherever Auto appears.

## 2. Recommendations page

Framed as **Planning opportunities to test**, not ranked advice.

```text
[ Plan status strip ] funded to age · sustainable $/month · lifetime tax · estate
[ Opportunity cards, grouped by theme — not sorted by dollar impact ]
   Title  [badge: Quantified opportunity | Informational]
   Why this may help · Exact proposed change · Trade-offs
   [ Preview this change ] -> runScenario with that single patch
        CURRENT PLAN | PROPOSED PLAN table: lifetime tax · sustainable $/mo · estate ·
        funding (shortfall years, first shortfall age)
        [Apply to scenario]  [Undo]
```
Deltas are shown per objective and explicitly not aggregated into a score; the page states that
tax, estate, spending capacity and timing are different objectives and the largest number is not
automatically the best choice. Items with no supported engine lever stay informational with no
dollar figure.

Locked-in unlocking appears as an actionable, previewable opportunity **only** when the governing
pension-jurisdiction rule is marked VERIFIED in the rules layer; otherwise it is informational only.

## 3. What If workspace

```text
[ Scenario bar ] Baseline • Working scenario   [Reset]      (save/rename/delete = Batch 2)
[ Controls ] Timing (retirement deferral, CPP age, OAS age) · Spending (retirement $/mo,
   current $/mo, one-time future expense) · Saving (extra $/mo + account) ·
   Assumptions (equity return, fixed return, investment-return adjustment, inflation) ·
   Strategy · Property (sale age for an existing asset)
[ Results ] Metric strip vs Baseline with Δ chips:
   spending funded to age · sustainable retirement spending $/month · portfolio at retirement ·
   lifetime tax · estate after income tax · first shortfall age · ending assets
   Chart: Baseline vs What If total portfolio over time
   "Isolated effect of each change" table — each change re-run on its own; the page states these
   are separate re-runs and do NOT add up
   "Combined scenario impact" — one full run containing every selected change
   Expandable year-by-year ledger for the scenario run
```

### Investment return / fee drag
The engine has no separate gross-return and fee input, so the control is labelled
**Investment-return adjustment (percentage points)** and is never described as a fee calculation.
If an explicit fee input is added later, it will be defined as `netReturn = grossReturn - feeDrag`
with the fee assumption shown separately.

## 4. Units on every new page
Monthly, always suffixed `/month`: current spending, retirement spending, savings, CPP, OAS,
pensions, retirement spending capacity, surplus/shortfall. Employment income stays `/year`.
Balances, estate values, ending assets and lifetime tax are lump sums with no suffix.
All conversion goes through `src/lib/planning/units.ts`.

## 5. Baseline safety
Previews and What If never mutate the saved plan. `[Apply to scenario]` writes only to the working
`ScenarioPatch`. A separate `[Make this my baseline]`, behind a confirmation dialog, is the only
action that rewrites the saved draft — delivered in Batch 2 with scenario persistence.

## Implementation sequence

**UX Batch 1 (this pass)**
- `src/lib/planning/scenario.ts` — ScenarioPatch + single execution path
- server fns: `runScenario`, `compareStrategies`, `simulateScenario` (baseline / combined / isolated)
- Plan workspace navigation across Projection · Net worth · Goal · Strategies · Recommendations · What If
- Redesigned Strategies workspace, redesigned What If workspace, baseline vs scenario comparison,
  real projection charts, expandable year-by-year ledger
- Recommendations layout rework, framed as planning opportunities
- STOP for review

**UX Batch 2**
- `plan_scenarios` persistence of ScenarioPatch: create, save/update, rename, delete, reset,
  compare multiple saved scenarios, explicit "Make this my baseline" with confirmation
- STOP for review

Then Phase 0.2 financial correctness, before any optimizer-backed recommendation ranking.
