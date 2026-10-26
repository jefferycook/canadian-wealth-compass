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

## Statutory component mapping (added 2026-10-25; first-hand read, still unreviewed)

Source: Justice Laws, *Canada Pension Plan* (R.S.C. 1985, c. C-8), ss.45, 46 and 58,
"Act current to 2026-09-30, last amended 2024-12-17", fetched directly. This is a
reading of the text, not legal advice and **not an approved reference answer**. Not
read: s.57(2) (deceased's portion), s.48.1/48.2/51 (additional earnings), the
definition of "Maximum Pensionable Earnings Average", and the Pension Index
regulations. Those remain open.

### s.58(2)(c): survivor 65+, born after 1932, own pension commenced after 1997

Survivor pension = (i) + (ii) + (iii), each computed on its own component:

| Part | Deceased portion `C` (60% applied) | Survivor own portion used in `B` | Cap |
|---|---|---|---|
| (i) base | 60% of s.58(3) portion (s.57(2) amount x Pension Index ratio) | s.46(1)(a) 25% of average monthly pensionable earnings, **ignoring s.46(3)-(6)**, indexed under s.45(2) | lesser of `A-B` and (25% of 1/12 of survivor's MPE Average for the later of year-qualified / year-pension-started, indexed under s.45(2)) **minus the survivor's own base portion** |
| (ii) first additional | 60% of s.58(3.1) portion = 8.33% of first additional monthly pensionable earnings (s.58(3.2)); x index ratio since death; if a retirement pension was payable in the death month, also x ratio from the year it started | s.46(1)(b) portion, ignoring s.46(3.1)-(6), indexed | none |
| (iii) second additional | 60% of s.58(3.4) portion = 33.33% of second additional monthly pensionable earnings (s.58(3.5)); same index treatment | s.46(1)(c) portion, ignoring s.46(3.1)-(6), indexed | none |

For each part: `A = 60% x deceased portion`, `B = min(40% x A, 40% x survivor's own portion)`,
part = `A - B` (base part further limited by the cap above).

### Other age categories (not mapped further here)

- s.58(2)(a), survivor under 65, pension commencing after 1997: same shape with **37.5%**
  in place of 60%, plus a flat-rate benefit (s.58(1.1)) or post-retirement disability benefit
  (greater of the two).
- s.58(2)(b), under 65, pension commencing before 1998: 37.5% with a 25%-of-three-year-average-YMPE cap.
- Survivors born before 1933 or with pensions commencing before 1998 fall in other branches.

### Consequences for `cppSurvivorBenefit` (hypotheses to test, not conclusions)

1. **Own pension basis.** The statute uses the survivor's own portions *before* the
   early/late factor (s.46(3)-(6) disregarded). The engine's `survOwnCpp` is after `cppFactor`.
2. **Cap structure.** The engine applies one cap, `combinedMax - survOwnCpp`, to the whole
   survivor amount. In (c) only the base part is capped (against 25% of MPEA/12 less own base
   portion); enhancement parts (ii) and (iii) are uncapped.
3. **Component separation.** The engine appears to treat the deceased's pension as one
   figure. The Act needs base / first additional / second additional separately, with
   different percentages (25%, 8.33%, 33.33% of the respective earnings measures).
4. **s.46(5) interaction (new).** When a survivor's pension is reduced under s.58(2), the
   downward early-claim factor in s.46(3)/(3.1)/(4) applies only to the survivor's own
   basic retirement amount *less* the reduction (scaled by Pension Index ratios), not the whole.
   This bears directly on how an early claimer's combined payment should be modelled and
   is not mentioned in the backlog.
5. **Reduction rule is 40%-of-smaller, not "min with combined max".** `B` is a 40% haircut
   on the smaller of A and the survivor's own portion; this is a different shape from
   `min(60% x deceased, max - own)`.

### Synthetic arithmetic check of the part (i) shape (not a fixture)

Invented monthly figures, no engine constants: deceased base portion 600 -> `A = 360`;
survivor own base portion 500 -> `B = min(144, 200) = 144`; `A - B = 216`; with an invented
cap value of 700 (25% MPEA/12), cap room = 700 - 500 = 200; part (i) = min(216, 200) = **200**.
Illustrates that the cap can bind while enhancement parts are unaffected.

### Draft synthetic fixtures, s.58(2)(c) shape (UNREVIEWED; invented monthly figures)

All inputs are invented round numbers, **not** 2026 constants or real contributor data.
Indexation ratios are set to 1 to isolate the formula shape. Per part:
`A = 0.60 x deceased portion`, `B = min(0.40 x A, 0.40 x survivor own portion)`, part = `A - B`;
base part further limited to `cap - survivor own base portion` (floor 0).
Survivor own portions are the unadjusted s.46(1) portions (s.46(3)-(6) disregarded).

| ID | Deceased base / 1st add / 2nd add | Survivor own base / 1st add / 2nd add | Invented base cap | Part (i) | Part (ii) | Part (iii) | Total |
|---|---|---|---|---|---|---|---|
| F1 | 600 / 0 / 0 | 500 / 0 / 0 | 700 | min(360-144, 700-500) = min(216, 200) = 200 | 0 | 0 | 200 |
| F2 | 600 / 0 / 0 | 100 / 0 / 0 | 700 | B = min(144, 40) = 40; 360-40 = 320; cap room 600; = 320 | 0 | 0 | 320 |
| F3 | 600 / 100 / 50 | 500 / 40 / 20 | 700 | 200 | A=60, B=min(24,16)=16 -> 44 | A=30, B=min(12,8)=8 -> 22 | 266 |
| F4 | 600 / 100 / 50 | 750 / 0 / 0 | 700 | cap room = max(0, 700-750) = 0 -> 0 | A=60, B=0 -> 60 | A=30, B=0 -> 30 | 90 |

Checks: F3 and F4 show enhancement parts are not limited by the base cap. F4 shows the
base part floors at zero when the own base portion already exceeds the cap.
F1-F4 do not cover: under-65 (37.5%, flat-rate), s.46(5) early-claim interaction, Pension
Index ratios other than 1, contribution-year phase-in (s.51(1.1)), or the age-65 trigger
timing in s.58(3)(a)-(e). Each needs its own fixture after a second-party reading.

Whether the base cap term is "cap minus own base portion" exactly as tabulated depends on the
paraphrased s.58(2)(c)(i) text and **must be confirmed against the official wording** before F1,
F2 and F4 are treated as expected values.

### Next steps

1. Read s.57(2), ss.48.1/48.2/51, the "Maximum Pensionable Earnings Average" definition and
   Pension Index rules; finish the component mapping.
2. Derive component-separated synthetic fixtures (claim at 60 / 65 / 70, under-65 turning 65).
3. A second party checks the fixtures before any are called expected values.
4. No engine change and no golden movement without explicit owner authorization.
