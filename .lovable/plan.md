# Strategies, Recommendations and What If — workspace redesign

No change to the calculation engine. Every number on these three pages comes from a real
`runPlan()` / `projection()` re-run executed server-side; React only lays out results.

## 1. Strategies page

```text
[ Current strategy ]  Registered first · engine-selected (Auto)
  Why: fewest shortfall years, then highest after-tax estate
  4 stat cards: Lifetime tax | Estate after tax | Funding (funded / N short yrs, first shortfall age)
                Sustainable retirement spending $/mo
[ Comparison grid — 5 cards: Non-registered first, Registered first, TFSA first, Pro-rata, Auto ]
  each card: lifetime tax · estate after tax · sustainable $/mo · shortfall years · ending assets
             delta chips vs current (green/red), "Preview" / "Compare" buttons
[ Preview drawer ]  CURRENT | PREVIEWED  side-by-side metric table + portfolio-over-time chart
                    [Apply to plan]  [Save as scenario]  [Close]
[ Expandable ] year-by-year table for the previewed strategy
```
Wording rule: cards are ranked and labelled "lowest lifetime tax in this comparison" /
"largest estate in this comparison" — never "optimal" unless Auto's own selection rule picked it,
in which case we state the rule that chose it.

## 2. Recommendations page

```text
[ Header ] Plan status card: funded to age, sustainable $/mo, lifetime tax, estate
[ List of recommendation cards, sorted by measured impact ]
  Title  [badge: Measured impact | Planning opportunity]
  Why this may help (1-2 lines)
  Proposed change: exact, e.g. "Start CPP at 70 instead of 65"
  [ Preview this change ]  -> runs the engine with that single override
     -> expands to CURRENT PLAN | PROPOSED PLAN table:
        lifetime tax Δ · sustainable monthly spending Δ · estate Δ · funding Δ (shortfall years / first age)
        Trade-offs: plain-English line generated from the same run (e.g. lower estate, later income)
     -> [Apply to plan] [Undo] [Save as scenario] [Compare with other previews]
```
Recommendations that map to a supported override become previewable and get measured numbers.
Ones with no engine lever (e.g. "TFSA room unused" where there's no contribution override to model)
keep a **Planning opportunity — not yet quantified** badge and no fake dollar figure.

Recommendation → override mapping (all already supported):
- Delay retirement → `retAdj`
- Reduce retirement spending → `spendAdj`
- Reduce current spending → `currentSpendAdj`
- Save more monthly → `goalSaves`
- CPP / OAS start age → `mods`
- Switch withdrawal order → `strategy`
- Unlock LIRA → `unlockAll`
- Fee reduction → `retDelta`

## 3. What If page (scenario workspace)

```text
[ Scenario bar ]  Baseline • Scenario A • Scenario B   [+ New] [Rename] [Reset] [Save]
[ Controls column ]  sliders/selects, grouped & collapsible:
   Timing: retirement age offset, CPP age, OAS age
   Spending: retirement $/mo, current $/mo, one-time future expense (age + amount)
   Saving: extra $/mo + destination account
   Markets: equity return, fixed return, inflation, fee drag
   Strategy: withdrawal order
   Property: future sale/downsize where the plan already has an asset
[ Results column ]
   Metric strip vs Baseline (Δ chips): spending funded to age · sustainable $/mo ·
     portfolio at retirement · lifetime tax · estate after tax · first shortfall age
   Chart: Baseline vs What If total portfolio over time (two lines, shaded gap)
   Chart: total assets / net worth over time
   Table: per-lever contribution (which lever moved the needle, from isolated re-runs)
[ Saved scenarios table ] compare 2+ saved scenarios side by side on the same metrics
```
Debounced (~400ms) re-run on change; results show a "recalculating" state, never stale-labelled numbers.

## Engine calls behind each interaction

| Interaction | Server function | Engine call |
|---|---|---|
| Strategy grid | extend `analyzePlan` / new `compareStrategiesDetailed` | `runPlan({...inputs, strategy})` per strategy + `scorePlan` for sustainable spend |
| Strategy preview | new `previewOverride` | `runPlan(inputs, {strategy})` + `summarize` + `netWorthView` |
| Recommendation preview | same `previewOverride` | `runPlan(inputs, override)` + `scorePlan(inputs, levers)` |
| What If recompute | extend `simulatePlan` | `runPlan(inputs, leverOverride(levers))`, `scorePlan`, per-lever `isolate()` re-runs |
| Baseline vs What If chart | same call | `netWorthView()` series for both runs |

New shared server fn `previewOverride({ draft, override })` returns
`{ summary, score, netWorth series, shortfall info }` for one run — used by both
Strategies and Recommendations so no comparison math ever happens in React.

Engine additions needed (mechanical, no methodology change):
- `LeverSettings` gains: `strategy`, `eqRetDelta`/`fiRetDelta`, `inflationOverride`,
  `oneTimeExpense {age, amt}`, `unlockAll`, `feeDrag`. These map to existing
  `ProjectionOverride` fields (`strategy`, `retDelta`, `unlockAll`) plus draft-level
  edits for inflation/returns/one-time expense (already modelled by `expenses[]`).
- `compareStrategies` gains `sustainableMonthly` and `endingAssets` per row.

## Scenario persistence

Already exists: `plan_scenarios` table (`plan_id`, `user_id`, `name`, `overrides jsonb`) with RLS
and grants. **Nothing in the app writes or reads it yet.**

To wire up: `listScenarios`, `createScenario`, `renameScenario`, `updateScenario`, `deleteScenario`
server functions in a new `src/lib/scenarios.functions.ts`; `overrides` stores the
`LeverSettings` object (serialisable — no function fields), so a saved scenario replays
by feeding it back through `simulatePlan`.

## Restorable from the Claude prototype (no methodology change)

- Strategy comparison table with per-strategy lifetime tax / estate / depletion age
- Side-by-side baseline vs scenario metric panel
- Portfolio-over-time overlay chart for two runs
- Per-lever attribution ("delaying retirement 2 yrs did most of the work")
- One-time future expense stress test
- Fee-drag and market-shock what-ifs (`retDelta`, `shocks` already in `ProjectionOverride`)
- Year-by-year ledger expandable under any previewed run

## Out of scope for this pass
Engine formulas, tax tables, wizard inputs, and the projection/net-worth tabs stay as they are.
