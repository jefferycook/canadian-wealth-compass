# Phase 0 independent exact-SHA audit

> Green CI is evidence; it does not replace an independent semantic audit. Never authorize a branch name, UI rollup, `mergeable_state`, or mutable PR view.

## Current and planned enforcement

**CURRENTLY ACTIVE:** Ruleset A, ID `22812673`, “Phase 0 main protection”. It targets only `main`, has no bypass, requires merge-commit PRs and the strict source-bound `phase0-gate` Check Run from Gate App ID `4876044`, and blocks deletion and non-fast-forward updates.

The disposable backend source-binding replica test **PASSED**. The UI/status-rollup presentation was ambiguous, but backend enforcement was correct. Legacy `phase0-gate` commit statuses remain poison/rejection signals and are never authority; Case-B automatic quarantine does not apply merely because one exists.

**PLANNED / REQUIRED AFTER THIS PR MERGES:** create exactly one active Ruleset B named “Phase 0 main update restriction”, targeting only `refs/heads/main`, containing only Restrict updates, with exactly one bypass actor: CWC Phase0 Merger App ID `4915565`, mode “For pull requests only”. Do not claim Ruleset B exists before rollout. The trusted merge workflow locates a unique applied matching Ruleset B and records its actual ID and configuration hash; zero or multiple matches fail closed.

This infrastructure PR is the **last PR intended to be manually merged by the owner**. After it lands and Ruleset B is created, the owner performs an independent audit and dispatches the trusted merge workflow; there is no automatic merge.

## Authority separation

- CWC Phase0 Trust Gate (`4876044`) writes only Checks. Its token cannot merge or write commit statuses.
- CWC Phase0 Merger (`4915565`) receives only repository Contents read/write and performs one exact-SHA merge mutation. It cannot write Checks or statuses.
- Read-only `GITHUB_TOKEN` performs preparatory P1–P11 reads. The Gate token is minted conditionally only for P7 duplicate terminalization or an infrastructure P9 mutation. The Merger token is minted only after P1–P13 and is used for exactly one `PUT /pulls/{pr}/merge` request.
- Candidate-controlled code receives neither App private key. Never print or inspect either key.
- A single repository-wide `phase0-trust` concurrency group serializes verifier evaluation and owner-dispatched merge runs, with `cancel-in-progress: false`; Gate mutation cannot race P9–P14 and two merge runs cannot race `main`.

## Gate state and provenance

Record exactly one Gate-App Check Run named `phase0-gate` for the exact candidate SHA, using `filter=all` and pagination. Defensive filtering must match name, SHA, and App ID.

| State  | Provenance token | GitHub result     | Meaning                          |
| ------ | ---------------- | ----------------- | -------------------------------- |
| V-SAFE | `v:...:safe`     | completed/failure | reversible verifier staging      |
| V-FAIL | `v:...:failure`  | completed/failure | verifier failure                 |
| V-SUCC | `v:...:success`  | completed/success | ordinary exact-SHA authorization |
| A-WAIT | `a:...:awaiting` | completed/failure | infrastructure audit required    |
| M-SAFE | `m:...:safe`     | completed/failure | reversible manual staging        |
| M-SUCC | `m:...:success`  | completed/success | manual exact-SHA authorization   |
| Q      | `p0g:v1:q:<sha>` | completed/failure | terminal burned SHA              |

Canonical v2 grammar is:

```text
p0g:v2:v:<sha>:<success|failure|safe>:<wfId>:<runId>:<attempt>:<pr>:<base>
p0g:v2:a:<sha>:awaiting:<wfId>:<runId>:<attempt>:<pr>:<base>
p0g:v2:m:<sha>:<success|safe>:<dispatchRunId>:<dispatchAttempt>:jefferycook:<pr>:<base>:<verifierRunId>:<verifierAttempt>
```

Require exact byte-for-byte reserialization, lowercase 40-hex SHAs, positive canonical decimal integers, completed status, valid `completed_at`, exact token/conclusion mapping, and at most 255 bytes. Old v1 v/m provenance is invalid. Canonical v1 Q requires the exact Gate name, candidate head SHA, Gate App ID, `completed` status, `failure` conclusion, valid `completed_at`, and exact `p0g:v1:q:<sha>` external ID; only that complete state is terminal forever. A Q-shaped external ID with success or malformed completion evidence is noncanonical and follows U3.

Q has no outgoing transition. Before every Check Run update, re-fetch the exact ID and enforce I-Q against canonical Q only. Duplicate authoritative records attempt to terminalize every non-Q duplicate under T-1 even if an earlier update fails; canonical-Q IDs receive zero writes, while Q-shaped noncanonical records follow duplicate terminalization. Unresolved duplicate mutation failures are reported as an `AggregateError` containing the underlying failures and naming every unresolved Check Run ID. T-1 through T-6 are terminalization rules, not ordinary kind transitions. Delta 4 superseded the former T-7 verifier-on-manual-success situation under T-6. Malformed success, contradictory authorizing evidence, stale verifier evidence after success, and verifier arrival on manual authorization use their applicable T-rule. Malformed non-success rejects without mutation unless another explicit T-rule applies.

Apply the frozen transition precedence exactly: U1 duplicates; U2 Q; U3 noncanonical state; U4-Y manual input with ordinary classification; U4-X manual input against verifier kind; byte-identical no-op; U4 staging of existing success as SAFE with its previous provenance; U5 source normalization; T-6 classification/kind compatibility; T-4 identity/order mismatch; T-5 same-attempt conclusion contradiction; then the KC/state-table transition. T-6 precedes T-4, which precedes T-5.

If a required SAFE or terminal-Q Check Run mutation is uncertain, re-fetch that exact ID. If the intended non-authorizing state is already proved, throw a proved-recovery `AggregateError` and reject the current evaluation; this recovery path never returns normally. If the exact pre-write state remains, perform one bounded same-ID fail-closed recovery mutation and re-fetch it, then throw the same proved-recovery error if the intended state is proved. Authorization cannot continue until a later valid retry. If neither the intended nor restored non-authorizing state can be proved, fail with an `AggregateError` explicitly stating that non-authorizing Gate state could not be proven. Never blindly retry the evaluation or a merge PUT.

V-SAFE persistently means its recorded verifier attempt concluded success. The same ordinary successful attempt re-stages V-SAFE and recovers to V-SUCC. A same-attempt failure contradicts that persisted fact and terminalizes under T-5; only a strictly newer valid attempt may advance V-SAFE to V-FAIL. Incoming manual provenance with ordinary re-derived classification is U4-Y and rejects without mutation against every non-Q state.

The only non-terminal kind changes are KC-1 `V-FAIL → A-WAIT` for a newer successful attempt of the same verifier run; KC-2 `A-WAIT → V-FAIL` for a newer failed attempt of that run; and KC-3 `A-WAIT → M-SAFE → M-SUCC` on the same Check Run ID after owner exact-SHA authorization. U4-X rejects a manual source against every verifier-kind state (`V-FAIL`, `V-SAFE`, or `V-SUCC`) with zero writes.

## Candidate identity and clean-room evidence

- Repository: `________________`
- PR number: `________________`
- Audited base SHA: `________________`
- Audited head SHA: `________________`
- Audited tree SHA: `________________`
- Verifier workflow/run/attempt: `________________`
- Gate Check Run ID/provenance/completed_at: `________________`
- Classification, including old and new rename paths: `ordinary / infrastructure`

In a fresh clone, record:

```console
git fetch origin <BASE_SHA> <HEAD_SHA>
git switch --detach <HEAD_SHA>
git rev-list --parents -n 1 HEAD
git rev-parse HEAD^{tree}
git merge-base <BASE_SHA> HEAD
git rev-list --left-right --count <BASE_SHA>...HEAD
git rev-list --count <BASE_SHA>..HEAD
git diff --name-status --find-renames <BASE_SHA>..<HEAD_SHA>
git diff --numstat <BASE_SHA>..<HEAD_SHA>
git log --oneline <BASE_SHA>..<HEAD_SHA>
```

The candidate must be a one-parent child of live `main`, exactly one ahead and zero behind, with merge base equal to live `main`. The associated PR is re-fetched in full and must still be open, non-draft, unmerged, based on literal `main` and live main SHA, from the same repository, and headed by the verifier SHA. Require `0 < changed_files <= 3000`, enumerate all PR files, and require the enumeration count to match exactly. Infrastructure includes `.github/**`, `scripts/audit/**`, freeze tests/fixtures, this template, lock/package/toolchain/environment files, Vite/Vitest/TypeScript configuration, and repository-root code/config files. Unknown statuses fail closed.

## Dispatch and merge procedure

The owner `jefferycook` dispatches on `main` with all five exact inputs:

```text
pr_number
audited_base_sha
audited_head_sha
audited_tree_sha
approval_phrase = EXACT-SHA-AUDIT-PASS
```

P1–P14 revalidate dispatch identity; trusted checkout and helper revision; live main; complete live PR identity; one-parent/one-ahead graph; `tree(audited_head_sha) == audited_tree_sha`; classification; exactly one canonical Gate; provenance and the exact successful verifier workflow ID/path/run/attempt with no later attempt; legacy-status and wrong-App poison; exact live Rulesets A and B; and an immediate double-read of main, PR head/base, candidate tree, Gate, and trusted revision. Infrastructure requires A-WAIT (or a contract-valid M-SAFE/M-SUCC retry) before KC-3. If any remaining pre-P14 validation fails after M-SUCC is established, the exact Gate ID is re-fetched and terminalized to Q so it is non-authorizing. The manual path never creates a missing Gate. Ordinary candidates require V-SUCC.

Only after P1–P13 pass may P14 mint the Merger token. Submit exactly one request with `sha = audited_head_sha`, `merge_method = merge`, title `Merge pull request #<pr> (Phase 0 audited head <head>)`, and this exact message:

```text
base <base>
head <head>
gate <checkRunId> <external_id>
dispatch <run_id>/<run_attempt>
```

Squash, rebase, blind retry, and automatic merge are forbidden. A definitive `merged:false` or known HTTP rejection fails the dispatch and requires a fresh owner dispatch. Only a genuinely indeterminate timeout/network send result enters recovery; re-read main and the PR, continue only if the exact audited merge is proved, and never issue a second PUT.

## Post-merge invariants

Record merge commit M and independently run `scripts/audit/verify-merge.mjs`. Require:

1. M is the exact response or unambiguously recovered merge commit.
2. M has exactly two parents: audited base first and audited head second; its tree equals `audited_tree_sha` and the audited head tree; its author login is exactly `cwc-phase0-merger[bot]`; and its committer login is exactly `web-flow`. The Merger bot identity was independently verified from GitHub's authoritative Bot user object for the App.
3. Two fresh reads of `heads/main`, five seconds apart, equal M.
4. The PR is closed/merged with `merge_commit_sha == M`.
5. Gate ID, provenance, success result, and `completed_at` are unchanged since authorization.
6. Query the recent `main` rule-suite window (`time_period=hour` where supported). Endpoint unavailability is recorded and nonfatal by itself. If available, bounded reads must find the exact suite for M with result `pass` or `bypass`, actor `cwc-phase0-merger[bot]`, and retained per-rule detail; no exact suite, wrong actor, or wrong result fails.
7. The summary records PR, base, head, audited tree, merge SHA/tree, Gate ID/provenance/completed_at, dispatch run/attempt, Ruleset A/B IDs and configuration hashes, and the rule-suite ID/result/actor/detail or explicit endpoint-unavailable evidence.

```console
node scripts/audit/verify-merge.mjs --merge <M> --base <BASE_SHA> --head <HEAD_SHA> --live-main origin/main
git rev-list --parents -n 1 <M>
git merge-base --is-ancestor <HEAD_SHA> <M>
git rev-parse <M>^{tree}
git rev-parse <HEAD_SHA>^{tree}
git rev-list --count <BASE_SHA>..<M>
```

## Emergency Ruleset B recovery

If the trusted merger is unavailable or Ruleset B drifts, stop merging. Do not add a broad bypass or relax Ruleset A. The owner must independently audit the live configuration, restore the exact normative Ruleset B/App installation, verify its unique match, and begin again with a new dispatch. Any emergency removal or alteration of Ruleset B is an owner-controlled GitHub-settings operation with separately preserved evidence; it is never performed by candidate code or this workflow.

## Permanent test record

Record complete output for the integrity test, freeze suite, P0-4, P0-2, P0-GATE, full Vitest (excluding audit scripts), TypeScript, production build, formatting verification, and `git diff --check`. Confirm no test uses `mergeable_state`, `statusCheckRollup`, or UI text as authority.

- Verdict: `PASS / FAIL`
- Blocking findings: `________________`
- Residual risks: `________________`
- Exact-SHA recommendation: `________________`
