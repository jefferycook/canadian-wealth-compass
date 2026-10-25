# CPP-5 investigation notes (read-only; no engine change)

Status: **investigation only**. `src/lib/planning/benefits.ts` is unchanged and
CPP-5 stays OPEN. Methodology changes need independent review (Codex / Jeff);
nothing here is a reference answer. Source of the legal summary:
`docs/ENGINE-CORRECTNESS-BACKLOG.md` (CPP-5 entry). The statutory text
(CPP s.46, s.58(2)) has **not** been re-verified by this note.

## Current behaviour (characterised from code)

`cppSurvivorBenefit` ends with
`b = min(b, max(0, cppCombinedMax * infFac - survOwnCpp))`, where `survOwnCpp`
is the survivor's own pension *after* the early/late `cppFactor`.
Backlog says the Act uses the survivor's own pension **unadjusted for claiming
age** (s.46(3)-(6) disregarded).

## Illustration with 2026 repo constants (arithmetic only)

Survivor 65+, deceased 65-age amount $12,000 (60% = $7,200 < survivor max
$10,855.08), survivor's own pension from the max $18,091.80 base:

| Survivor CPP start | cppFactor | Own pension used by engine | Engine survivor benefit |
|---|---|---|---|
| 60 | 0.640 | 11,578.75 | 6,799.97 |
| 65 | 1.000 | 18,091.80 | 286.92 |
| 70 | 1.420 | 25,690.36 | 0.00 |

Combined max used: $18,378.72 (1,531.56 x 12).

If the Act's shortcut-equivalent used the unadjusted $18,091.80 for all three
rows, the engine's early-starter row would be overstated (~$6.8k vs ~$0.29k)
and the deferrer row understated (0 vs ~$0.29k), matching the backlog's stated
direction of error. The true answer needs the component-by-component A-B
formula (base vs enhanced portions), which this note does **not** implement.

## Proposed next steps (need reviewer authorisation)

1. Independent derivation of s.58(2) component formulas and the 25%-of-MPEA
   base cap, with fixtures for early starter / deferrer / 65-crossing, written
   by a party other than the implementer.
2. Only then implement; do not alter golden 274,815 without stage attribution.
