# Phase 0 exact-SHA audit template

> Green CI is evidence; it does not replace the independent semantic audit.

Record every value rather than relying on a branch name or mutable pull-request view.

## A. Candidate identity

- Repository: `________________`
- Pull request: `________________`
- Exact candidate head SHA: `________________`
- Exact base SHA: `________________`
- Reviewed tree SHA: `________________`
- Expected relationship: exactly one candidate commit whose sole parent is the recorded base.

## B. Fresh-clone identity

In a fresh clone, fetch the exact objects and detach at the exact head. Record output proving HEAD, its sole parent, and merge base equal the recorded values, with the candidate zero commits behind and exactly one ahead.

```console
git fetch origin <BASE_SHA> <HEAD_SHA>
git switch --detach <HEAD_SHA>
git rev-parse HEAD
git rev-list --parents -n 1 HEAD
git merge-base <BASE_SHA> HEAD
git rev-list --left-right --count <BASE_SHA>...HEAD
git rev-list --count <BASE_SHA>..HEAD
```

## C. Reviewed boundary

Record all changed files, additions/deletions, the one-commit boundary, and the absence of hidden commits or unexpected files.

```console
git diff --name-status --find-renames <BASE_SHA>..<HEAD_SHA>
git diff --stat <BASE_SHA>..<HEAD_SHA>
git diff --numstat <BASE_SHA>..<HEAD_SHA>
git log --oneline <BASE_SHA>..<HEAD_SHA>
git status --short
```

## D. Infrastructure classification

Any added, modified, removed, copied, changed, or renamed path matching any item below is an infrastructure/freeze-definition change:

- `.github/**`
- `scripts/audit/**`
- `src/lib/planning/phase0-freeze.test.ts`
- `src/lib/planning/phase0-freeze.fixtures.ts`, if it exists
- `docs/audit/exact-sha-audit-template.md`
- `bun.lock`
- `bunfig.toml`
- `package.json`
- `.node-version`
- `.npmrc`
- `.env`
- `.env.*`
- `vite.config.*`
- `vitest.config.*`
- `vitest.workspace.*`
- `vitest.*.{ts,js,mjs,cjs,mts,cts}`
- `tsconfig*.json`

Also classify any other repository-root `.json`, `.toml`, `.yml`, `.yaml`, `.ts`, `.js`, `.mjs`, `.cjs`, `.mts`, or `.cts` file when added, removed, or modified. This deliberately includes future configuration files that can change what “the suite passed” means.

Use the GitHub files API and inspect both `filename` and `previous_filename` for every status. Adds, modifications, removals, copies, and renames all count. A deletion remains classified. Treat an unknown future status as infrastructure. Any infrastructure-classified change requires a full clean-room audit plus manual exact-SHA `phase0-gate` approval.

## E. Trusted helper execution

Run `scripts/audit/**` from the audited base checkout, never blindly from the candidate checkout. Record the helper output and the equivalent raw Git evidence; helper output is never sole evidence.

```console
node scripts/audit/make-review-bundle.mjs --base <BASE_SHA> --out <OUTSIDE_REPO>
GIT_INDEX_FILE=<TEMP_INDEX> git read-tree <BASE_SHA>
GIT_INDEX_FILE=<TEMP_INDEX> git add -A
GIT_INDEX_FILE=<TEMP_INDEX> git diff --cached --binary --full-index <BASE_SHA>
GIT_INDEX_FILE=<TEMP_INDEX> git write-tree

node scripts/audit/verify-commit.mjs --base <BASE_SHA> --tree <REVIEWED_TREE_SHA>
git rev-list --parents -n 1 HEAD
git rev-parse HEAD^{tree}
git rev-list --count <BASE_SHA>..HEAD
git diff-tree --no-commit-id --name-status -r HEAD

node scripts/audit/verify-merge.mjs --merge <MERGE_SHA> --base <BASE_SHA> --head <HEAD_SHA>
git rev-list --parents -n 1 <MERGE_SHA>
git merge-base --is-ancestor <HEAD_SHA> <MERGE_SHA>
git rev-parse <MERGE_SHA>^{tree}
git rev-parse <HEAD_SHA>^{tree}
git rev-list --count <BASE_SHA>..<MERGE_SHA>
```

## F. CI/workflow integrity

Enumerate **all** Actions runs for the exact head SHA. For every run record:

- `workflow_id`
- canonical workflow `path`
- `event`
- `head_sha`
- `head_repository`
- `conclusion`
- `run_attempt`

An ordinary candidate is expected to have a genuine `phase0-verify` run at the exact protected path and a trusted `phase0-trust` `workflow_run` decision. Any unexpected workflow on the candidate SHA blocks approval until explained.

## G. Environment and key exposure

For every infrastructure PR, grep and review all candidate workflows for `environment:`. Exactly these jobs in `phase0-trust.yml` may reference the `phase0-trust` Environment:

- `evaluate-verify`
- `approve-audited-infrastructure`

No other candidate workflow or job may reference it. **Any workflow already on `main` that references this Environment can reach its secrets after policy passes.** This is why every `.github/**` change is infrastructure-classified.

Automation that pushes must use a fine-grained PAT limited to this repository, normally with only Contents read/write, Pull requests read/write, and Metadata read. For this infrastructure batch only, add Workflows write if GitHub requires it to publish the workflow files, then revoke that permission immediately after opening the PR and before activation. Automation must not receive Actions write, Administration, Environments, Secrets, Variables, Deployments, or organization-administration permissions. The dedicated Phase 0 App installation has Checks read/write for its canonical Check Run and retains Statuses write only because GitHub requires that installation permission when binding a required check to an expected App source. Each minted workflow token is explicitly limited to Checks write and cannot post a legacy commit status. Owner-only actions include audit dispatches, rulesets, merge settings, App and Environment setup, and final merge. Stop activation if that separation cannot be guaranteed.

The eventual `main` ruleset has no Lovable, Codex, owner, or administrator bypass. It requires a PR and the source-bound App status, blocks force pushes and deletion, and permits merge commits rather than squash/rebase. Direct Lovable-side edits to `main` are intentionally rejected.

## H. Genuine verify evidence

Confirm and record that:

- the verify run used the exact `.github/workflows/phase0-verify.yml` path and trusted workflow ID;
- the event was `pull_request`;
- the head repository is this repository;
- the run head is the exact audited SHA;
- the candidate's sole parent is current `main`;
- the pinned Node and Bun versions were used;
- installation used a new empty cache and the frozen lockfile stayed unchanged;
- the protected freeze file was run explicitly;
- all focused suites, full Vitest, TypeScript, build, and diff checks passed.

## I. Required App gate integrity

List all Check Runs named `phase0-gate` for the audited head SHA with `filter=all`. Exactly one authoritative record may exist: it must target the audited head SHA, be named `phase0-gate`, have `app.id === 4876044`, be completed with a valid `completed_at`, and carry valid deterministic provenance in `external_id`. More than one dedicated-App record for the same SHA is an ambiguity and blocks approval. Before reporting that ambiguity, the trust helper attempts to move every authoritative duplicate Check Run ID to validated `failure` quarantine; an unresolved revocation produces an aggregate failure naming the unresolved IDs, and duplicate state can never proceed to authorization. A new or advancing decision must first establish and validate the canonical record at `failure`; `success` is a final update of that same Check Run ID after every pre-authorization validation completes. Once a new trusted evaluation begins against an existing successful canonical gate, that same Check Run ID is first revoked to a non-authorizing `failure` quarantine state before existing provenance or compatibility checks run. Any rejection of the new evaluation therefore leaves `phase0-gate` non-successful; a prior green authorization may never survive a failed newer evaluation. Exact quarantine provenance is `p0g:v1:q:<candidate-sha>`. Once a canonical record remains in that quarantine state after an evaluation rejects, the candidate SHA is permanently ineligible for Phase 0 authorization: ordinary reruns and manual dispatches both fail without mutating the record. Recovery requires moving the PR to a fresh candidate commit SHA and evaluating that new SHA. Timestamps sent by the writer use whole-second UTC precision. For ordinary PRs, provenance, details URL, title, and summary must identify the genuine verifier workflow, run ID, and attempt, and the final Check Run update must post-date verification completion. Attempts must advance monotonically for the same verifier run; a stale attempt or different run ID on the same SHA blocks approval. For infrastructure PRs, the record must identify the audited manual workflow dispatch, approving actor, pull request, audited head, and audited base, and later updates must preserve the actor, pull request, and audited base identity.

Legacy commit statuses are never authoritative. A user-authored status or a Check Run from another App with the same `phase0-gate` name must not satisfy the source-bound requirement. Confirm the ruleset's expected source is the dedicated `CWC Phase0 Trust Gate` App with integration ID `4876044`, and confirm the merge remains blocked whenever that exact App-owned Check Run is absent or failing.

## J. Independent commands

After the frozen install succeeds and the exact Node and Bun pins are verified, run the installed local tools directly and attach complete output for at least the following commands. These commands permit no `npx` fallback or implicit package download:

```console
node --test scripts/audit/phase0-git-integrity.test.mjs
node node_modules/vitest/vitest.mjs run src/lib/planning/phase0-freeze.test.ts --config vite.config.ts
node node_modules/vitest/vitest.mjs run src/lib/planning/p0-4.test.ts --config vite.config.ts
node node_modules/vitest/vitest.mjs run src/lib/planning/p0-2.test.ts --config vite.config.ts
node node_modules/vitest/vitest.mjs run src/lib/planning/p0-gate.test.tsx --config vite.config.ts
node node_modules/vitest/vitest.mjs run --config vite.config.ts --exclude 'scripts/audit/**'
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
git diff --check <BASE_SHA>..<HEAD_SHA>
git rev-list --parents -n 1 <HEAD_SHA>
git rev-parse <HEAD_SHA>^{tree}
git merge-base <BASE_SHA> <HEAD_SHA>
```

## K. Frozen values

Record raw and rounded values:

- seven raw economic anchors: `________________`
- exact rounded pins: `202530 / 281105 / 406524 / 1756006 / 113283 / 131458 / 274815`
- E2-1 retained minimum: `8398.825698224313`
- E2-1 transferred amount: `201571.8167573835`
- `rrif.transferRetention.engaged === false`
- `RRIF_TRANSFER_RETENTION_NOT_ENFORCED` absent
- Goal `requiredToday === 23776`, gap `3776`, funded ratio approximately `0.8411843876177658`, internal blocker `estate.afterTaxHaircut`, outer clean/internal withheld
- `rrif.ageBasisWholeYear`: `APPROXIMATE`, engaged, existing reason present

## L. Semantic and adversarial review

Document a batch-specific search for bypasses, alternate call paths, stale data, status propagation failures, and trust-boundary mistakes. Review independently; implementer agreement and green CI create no consensus pressure.

## M. Premerge

Immediately before merge, prove remote `main` still equals the audited base and that the strict up-to-date UI condition is satisfied. If `main` moved: **STOP**. Do not click “Update branch” and merge without establishing and auditing a new exact SHA.

## N. Merge method

Use GitHub's manual **Create a merge commit** method. Do not squash or rebase.

## O. Postmerge

Prove the merge has exactly two parents, parent 1 is the audited base, parent 2 is the audited head, the head remains reachable, and the merge tree exactly equals the audited head tree.

```console
git fetch origin
git rev-list --parents -n 1 origin/main
git merge-base --is-ancestor <HEAD_SHA> origin/main
git rev-parse origin/main^{tree}
git rev-parse <HEAD_SHA>^{tree}
```

## P. Verdict

- Verdict: `PASS / FAIL`
- Blocking findings: `________________`
- Non-blocking notes: `________________`
- Exact-SHA recommendation: `________________`

Green CI is evidence; it does not replace the independent semantic audit.
