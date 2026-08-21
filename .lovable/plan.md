# AI Collaboration Architecture (review only — no code changes)

Goal: let Claude and OpenAI models explain, review, and stress-test plan outputs
without ever becoming part of the deterministic Canadian tax/retirement
calculation.

## Core principle: one-way evidence flow

```text
PlanDraft ──> planning engine (server) ──> PlanResult / PlanOutput
                                             │
                                    evidence packet (JSON, versioned)
                                             │
                          ┌──────────────────┴──────────────────┐
                     Claude reviewer                     OpenAI reviewer
                          └──────────────────┬──────────────────┘
                                      adjudication pass
                                             │
                                narrative + flags (advisory only)
```

Models receive numbers; they never produce them. No model output is ever fed
back into `runPlan()`, a `ScenarioPatch`, or a saved draft. Anything a model
suggests becomes at most a proposed opportunity the user must apply through the
existing scenario machinery, which then re-runs the deterministic engine.

## Layering (fits the existing rules)

Existing: `taxYears -> tax/benefits/registered -> projection -> engine -> server fns -> UI`.

New layer sits strictly to the right of `engine`, alongside `summary`/`analysis`:

`engine -> summary/analysis -> ai/evidence -> ai/providers -> ai server fns -> UI`

The AI layer imports from planning; planning never imports from AI.

## Files and endpoints to add later

Evidence contract (pure, testable, no network):
- `src/lib/planning/ai-evidence.ts` — `buildEvidencePacket(plan, analysis, scenarios)`
  producing a versioned, redacted JSON object: `{ schemaVersion, taxYear,
  province, householdShape, ages, balancesByType, projectionSummary,
  keyYears[], scenarioDeltas[], opportunities[], disclosures[] }`.
- `src/lib/planning/ai-evidence.test.ts` — snapshot + redaction tests (no names,
  no DOB, no account numbers, no email).

Review contract (model-agnostic):
- `src/lib/ai/review-schema.ts` — Zod schema for the response every model must
  return: `{ summary, findings[{id, severity, area, claim, evidenceRef,
  confidence}], questions[], suggestedScenarios[{label, patchHint}] }`.
  Kept flat and bound-free (limits stated in the prompt, clamped in code).
- `src/lib/ai/prompts.server.ts` — system prompts per role (explainer, reviewer,
  adjudicator).

Providers (server-only):
- `src/lib/ai/gateway.server.ts` — Lovable AI Gateway provider helper
  (`https://ai.gateway.lovable.dev/v1`, `Lovable-API-Key` header). Covers OpenAI
  models today with no key work from you.
- `src/lib/ai/anthropic.server.ts` — direct Anthropic client, used only if you
  supply `ANTHROPIC_API_KEY`. Same review schema.
- `src/lib/ai/review.server.ts` — orchestrator: run reviewers in parallel,
  normalize, then optional adjudication pass that receives both reviews plus the
  same evidence packet and returns agreements/conflicts.

Server functions (auth-gated, called from the plan page):
- `src/lib/ai.functions.ts`
  - `explainPlan` — plain-language narrative for one plan.
  - `reviewPlan` — dual review + adjudication, returns structured findings.
  - `explainScenario` — diff narrative between baseline and a saved scenario.
  All use `.middleware([requireSupabaseAuth])` and `requireOwnedPlan` before
  touching data. No public `/api/` route is needed; nothing external calls this.

Persistence (optional, one migration):
- `plan_ai_reviews` — `id, plan_id, user_id, model_role, provider, model_id,
  evidence_hash, review jsonb, created_at`, RLS via the existing `owns_plan`
  helper, plus GRANTs to `authenticated`/`service_role`. Stores reviews, never
  recalculated numbers.

UI:
- `src/components/plan/PlanAiReview.tsx` — a tab next to Strategies/Opportunities
  showing narrative, findings with severity, and conflicts between reviewers.
  Every finding is labelled advisory and links to the deterministic number it
  cites. Any "test this" button routes into the existing scenario flow.

## Two distinct AI surfaces (don't conflate them)

1. **Build-time collaboration (you + Claude/ChatGPT + Lovable).** An external
   Claude or ChatGPT client can connect to this project over MCP and read/act on
   project context while building. That is a developer tool: it never runs for
   your end users, and the app cannot call those MCP tools. If you want it, it
   is a separate small piece of work (an MCP server exposing read-only project
   tools, OAuth-protected because this app has per-user financial data).
2. **Runtime AI in the product.** The app calls models server-side through the
   layer above. This is what your subscribers see.

## Security, privacy, compliance (PIPEDA-relevant)

- Never send identity: strip names, DOB (send ages only), email, and any free-
  text account names from the evidence packet. Redaction is enforced in
  `ai-evidence.ts` and tested.
- All model calls server-side; no key ever reaches `VITE_*` or the browser.
- Cross-border processing: OpenAI/Anthropic process outside Canada. Add an
  explicit consent + disclosure before first AI use, a per-user opt-out, and a
  note in your privacy policy. Consider storing the consent flag on `profiles`.
- Log evidence hashes, not evidence. Do not log prompts containing plan data.
- Rate-limit per user; treat gateway `402`/`403` as terminal and surface them.
- Label every AI output as informational, not financial advice; keep the
  deterministic disclosures as the authoritative text.
- Reviews are cached against `evidence_hash` so a re-read doesn't re-send data.

## Phases

**Phase A — no keys, no network (possible immediately).**
Evidence packet + review Zod schema + redaction tests + a fixture-driven
"offline reviewer" that renders the UI from a canned review. Proves the contract
and the UI without any model call.

**Phase B — OpenAI via Lovable AI Gateway (possible immediately).**
`gateway.server.ts` + `explainPlan` + `reviewPlan` single-reviewer. Uses the
managed `LOVABLE_API_KEY`; no key work from you. Includes the consent gate.

**Phase C — second reviewer + adjudication (needs `ANTHROPIC_API_KEY`).**
Requires you to add an Anthropic key in Project Settings → Secrets. Adds
parallel review and the conflict/adjudication pass.

**Phase D — persistence + history.**
`plan_ai_reviews` migration, cached reviews, review history per plan.

**Phase E — optional MCP for build-time collaboration.**
OAuth-protected MCP server so an external Claude client shares project context.
Separate from the product runtime.

## Non-negotiables carried forward

- Engine stays frozen behind its golden anchors; no AI change may alter
  `$278,614` / `$554,616` / `$2,254,682`.
- Statutory numbers stay only in `taxYears.ts`.
- Monthly-unit convention unchanged; the evidence packet states units explicitly
  so models cannot misread annual vs monthly.
