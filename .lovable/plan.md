# Audit: recommendation system today vs. the Claude-derived original

No code was changed. Everything below is cited to the current source or to the uploaded v3.9 file.

## 1. How recommendations are generated today

`buildRecommendations()` in `src/lib/planning/analysis.ts` (line 210) is a flat list of hard-coded
if-branches over one already-computed projection:

- funded/shortfall status
- winning strategy vs. current, if the estate delta exceeds $5,000
- OAS clawback over $500 across the plan
- CPP deferral hint
- unused TFSA room
- any year with a marginal rate over 43%
- debt cost vs. fixed-income return

Each produces static prose. There is no number solved for, no slider attached, no "apply to plan"
button, and no measurement of how much a given recommendation moves the plan. `PlanInsights.tsx`
renders them as read-only cards.

## 2. Scenario / optimization logic today

`src/lib/planning/levers.ts` re-runs the full projection under slider settings
(`leverOverride`, line 94) and scores each run with `sustainableSpend()` — a bisection for the
highest spending the plan can carry (line 125). That is a genuinely good metric.

But `simulateLevers()` (line 290) calls `isolate()` (line 270), which zeroes every lever except one.
So each lever is measured **alone against the base**. Nothing measures interaction, nothing measures
the marginal contribution of a lever *given* the others, and no lever's value is solved — the user
must hunt for it by dragging. Recommendations (analysis.ts) and levers (levers.ts) are separate code
paths that never reference each other: a recommendation cannot open its own slider, and a slider
never knows which recommendation it fulfils.

## 3. What the earlier Claude-derived system had and this does not

Evidence from the uploaded v3.9 source:

| Capability | Original | Today |
|---|---|---|
| **Solved recommended values** | `buildDynCards` bisects (`solve()`) for the smallest saving, the smallest spending trim, the smallest deferral that *fully funds* the plan | No solving; sliders start at zero |
| **Complete-fix solver** | `solveFullFix()` returns "Save $X/mo — fixes it completely", "Set spending to $Y", plus a **balanced combo** solved jointly | Absent |
| **Room-aware savings cascade** | `buildAlloc()` routes extra savings TFSA → RRSP → non-registered against real room and caps the slider at total room | `recommendSavingsAccount()` names one account; no cascade, no room ceiling on the slider |
| **Exhaustive sweeps** | CPP tested at every age 60–70 and OAS 65–70, best kept; `runSweep()` charts plan strength across every option | Sliders only; no sweep, no "best age" answer |
| **Bidirectional framing** | "Spend more in retirement" (solves the headroom ceiling) and "retire earlier" — with `coverBadge`, which reads *still covered* rather than showing a falling funded % as failure | Levers only improve; no headroom question |
| **Home downsize / LIRA unlock cards** | Downsize tested at every age; `unlockRec` computed and surfaced with its effect on short years, tax and estate | `unlockAll`, `assetMod`, `acctMod`, `shocks` all exist in `ProjectionOverride` (types.ts 395–418) but **nothing in the UI uses them** |
| **Apply to plan** | Every card had `apply()` writing back into the plan | No path from a recommendation to a saved change |
| **Cumulative strategy stack** | Applied strategies tracked in sequence with before/after funded % | Absent |
| **Triage of problems** | `renderFlags()` groups findings into Needs attention / Worth watching / What's working, each with a "See fixes →" deep link into the fix modal | One undifferentiated list |
| **Scenario compare vs. base** | `runScenario()` compares a scenario to the base plan on money-lasts-to, estate, lifetime tax, shortfall years and ending net worth, with an overlay chart — including a **market-shock** input | No base-vs-scenario compare, no shock UI, and no scenario functions in `src/lib/plans.functions.ts` |

## 4. Lovable changes that are genuinely better — keep these

- **Server-side engine.** `runProjection` / `analyzePlan` / `simulatePlan` in `plans.functions.ts`
  keep tax rules off the client. The original shipped everything to the browser.
- **Pure typed modules with a test suite.** 53 tests, the $276,326 invariant preserved.
- **Rules isolated in `taxYears.ts`.** The original had constants scattered through UI code.
- **No pre-filled personal numbers** (`PlanDraft`, null-based) and **date of birth instead of age**.
- **Per-account return presets** and the blended-return view.
- **Accounts, RLS persistence, wizard flow, Recharts** — all real product gains.
- **`sustainableSpend()` bisection** is a cleaner headline metric than the original's funded %.

## 5. Claims stronger than the engine

- `src/routes/index.tsx` line 13: "full federal and **provincial** tax". `taxYears.ts` carries
  ON, BC, AB and CUSTOM only. Ten jurisdictions are missing; Quebec would also need QPP.
- Line 35: "LIF maximums with provincial unlocking rules". `registered.ts` line 100 states in its
  own comment that non-Ontario maximums fall back to an annuity-formula approximation.
- Line 39: "shows you which it picked **and why**". The strategies tab shows a comparison table;
  no rationale is generated.

## 6. Architecture and correctness risks in the recommendation layer

- **Thresholds are magic numbers** inside `buildRecommendations` ($5,000 estate delta, $500
  clawback, 43% marginal). Per the project's own layering rule these belong beside the rules, not
  in the analysis layer.
- **Isolated levers mislead.** Two levers that each add "+3%" do not add to +6%; the UI implies they
  do because nothing computes the combined attribution.
- **Recommendation text asserts outcomes it never measured** (e.g. the TFSA-room and debt items
  quote no re-run delta).
- **Dead override surface.** `unlockAll`, `shocks`, `acctMod`, `assetMod` are typed and supported by
  the projection but unreachable from the product — silent capability rot.
- **Cost.** Every solved recommendation is N projection runs. The original ran client-side for free;
  here each run is server time, so solvers need a shared run budget and caching.

## 7. Prioritized reconstruction plan

**P1 — Make recommendations solved and actionable.** Add `src/lib/planning/solver.ts` with a shared
bisection (`solveSmallest`) and a room-aware cascade (`allocateSavings`, TFSA → RRSP → non-reg,
capped by entered room plus annual accrual). Recast each recommendation as a *card* carrying: a
solved recommended value, slider bounds, an override builder, and the measured impact of that value.
`buildRecommendations` becomes card assembly, not prose.

**P2 — One combined scenario, honestly attributed.** Replace `isolate()` scoring with marginal
attribution: score the full combined setting, then measure each lever's contribution as the drop
when it alone is removed. Show the combined result as the headline.

**P3 — Complete-fix solver + problem triage.** Port `solveFullFix`: smallest saving, smallest
spending level, and the balanced combo. Group findings into Needs attention / Worth watching /
Working well, each linking to its fix.

**P4 — Apply to plan, with a strategy stack.** Persist applied strategies as an ordered list on the
plan (each with before/after funded %), replayed over the base draft so any step can be removed.
This is where the existing `plan_scenarios` idea earns its keep.

**P5 — Sweeps and base-vs-scenario compare.** CPP 60–70 and OAS 65–70 sweeps returning the best age
plus a curve; a scenario compare card (money lasts to, estate, lifetime tax, shortfall years, net
worth) with an overlay chart. Add the market-shock input, which the engine already supports.

**P6 — Unlock the dormant levers.** Surface LIRA unlocking (`unlockAll`), home downsizing
(`assetMod`) and RRSP→RRIF-at-65 (`acctMod`) as cards.

**P7 — Truth in claims.** Either soften the landing copy to the provinces actually covered, or ship
the remaining brackets and published LIF tables. Generate a one-line "why this order won" from the
strategy comparison so the "and why" claim becomes true.

Cross-cutting: move thresholds into the rules layer, budget and cache solver runs server-side, and
extend the test suite so each solver has a fixture asserting the value it returns actually fixes the
plan.
