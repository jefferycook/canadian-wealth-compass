import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  authorizeManualGate,
  isCanonicalPhase0GateQ,
  parsePhase0Gate,
  PHASE0_GATE_APP_ID,
  PHASE0_GATE_NAME,
  serializePhase0Gate,
  terminalizeAuthorizedGate,
  terminalizeDuplicateGateChecks,
  transitionPhase0Gate,
  upsertPhase0GateCheck,
} from "./phase0-gate-check.mjs";
import {
  MERGER_APP_BOT_LOGIN,
  finalizeBeforeMerge,
  infrastructurePath,
  isRulesetB,
  mergeOnce,
  prepareBeforeMerge,
  validateBeforeMerge,
  validateDispatch,
  validateFileEnumeration,
  validateLivePull,
  validateRulesetA,
  validateRulesets,
} from "./phase0-merge.mjs";

const head = "1".repeat(40),
  base = "2".repeat(40),
  tree = "3".repeat(40);
const completed = "2026-09-15T12:00:00Z";
const v = (token = "success", attempt = 1) => ({
  kind: "v",
  token,
  workflowId: 10,
  runId: 20,
  attempt,
  pr: 7,
  base,
});
const awaiting = (attempt = 2) => ({
  kind: "a",
  token: "awaiting",
  workflowId: 10,
  runId: 20,
  attempt,
  pr: 7,
  base,
});
const run = (source, id = 1) => ({
  id,
  name: PHASE0_GATE_NAME,
  head_sha: head,
  app: { id: PHASE0_GATE_APP_ID },
  status: "completed",
  conclusion: source.token === "success" ? "success" : "failure",
  completed_at: completed,
  external_id: serializePhase0Gate(head, source),
});

function api(initial = [], options = {}) {
  const state = { runs: structuredClone(initial), creates: [], updates: [], gets: [], merges: [] };
  const listForRef = async () => {};
  const github = {
    paginate: async (method) => (method === listForRef ? structuredClone(state.runs) : []),
    rest: {
      checks: {
        listForRef,
        get: async ({ check_run_id }) => {
          state.gets.push(check_run_id);
          if (options.getThrowsAt?.includes(state.gets.length)) throw new Error("get transport");
          const r = structuredClone(state.runs.find((item) => item.id === check_run_id));
          if (options.invalidGetResponseAt?.includes(state.gets.length))
            return { data: { ...r, external_id: "invalid-get-response" } };
          return { data: r };
        },
        create: async (p) => {
          state.creates.push(structuredClone(p));
          const r = {
            id: 100,
            name: p.name,
            head_sha: p.head_sha,
            app: { id: PHASE0_GATE_APP_ID },
            status: p.status,
            conclusion: p.conclusion,
            completed_at: p.completed_at,
            external_id: p.external_id,
          };
          state.runs.push(r);
          if (Object.hasOwn(options, "createResponseId"))
            return {
              data: {
                ...structuredClone(r),
                id: options.createResponseId,
                external_id: "invalid-create-response",
              },
            };
          if (options.invalidCreateResponse)
            return { data: { ...structuredClone(r), external_id: "invalid-create-response" } };
          return { data: structuredClone(r) };
        },
        update: async (p) => {
          state.updates.push(structuredClone(p));
          if (options.throwBeforeUpdate?.includes(state.updates.length))
            throw new Error("transport");
          const r = state.runs.find((x) => x.id === p.check_run_id);
          Object.assign(r, {
            name: p.name,
            status: p.status,
            conclusion: p.conclusion,
            completed_at: p.completed_at,
            external_id: p.external_id,
          });
          if (options.throwAfterUpdate?.includes(state.updates.length))
            throw new Error("transport");
          if (options.invalidUpdateResponseAt?.includes(state.updates.length))
            return { data: { ...structuredClone(r), external_id: "invalid-response" } };
          return { data: structuredClone(r) };
        },
      },
      pulls: {
        merge: async (p) => {
          state.merges.push(structuredClone(p));
          if (options.mergeThrows) throw new Error("transport");
          return { data: { merged: true, sha: "4".repeat(40) } };
        },
      },
    },
  };
  return { github, state };
}
const decision = (conclusion, infrastructure = false, attempt = 1) => ({
  owner: "o",
  repo: "r",
  candidateSha: head,
  conclusion,
  infrastructure,
  detailsUrl: "https://github.com/o/r/actions/runs/20",
  title: "title",
  summary: "summary",
  source: { workflowId: 10, runId: 20, runAttempt: attempt, pullNumber: 7, baseSha: base },
});

test("canonical v/a/m and Q grammar round trips", () => {
  for (const source of [
    v("safe"),
    v("failure"),
    v("success"),
    { ...v("awaiting"), kind: "a" },
    {
      kind: "m",
      token: "safe",
      dispatchRunId: 30,
      dispatchAttempt: 1,
      actor: "jefferycook",
      pr: 7,
      base,
      verifierRunId: 20,
      verifierAttempt: 1,
    },
    {
      kind: "m",
      token: "success",
      dispatchRunId: 30,
      dispatchAttempt: 1,
      actor: "jefferycook",
      pr: 7,
      base,
      verifierRunId: 20,
      verifierAttempt: 1,
    },
  ])
    assert.equal(parsePhase0Gate(run(source), head).externalId, serializePhase0Gate(head, source));
  assert.equal(
    parsePhase0Gate({ ...run(v("failure")), external_id: `p0g:v1:q:${head}` }, head).state,
    "Q",
  );
});
test("noncanonical IDs and token mappings fail closed", () => {
  assert.throws(() =>
    parsePhase0Gate(
      { ...run(v()), external_id: `p0g:v2:v:${head}:success:010:20:1:7:${base}` },
      head,
    ),
  );
  assert.throws(() => parsePhase0Gate({ ...run(v()), conclusion: "failure" }, head));
  assert.throws(() =>
    parsePhase0Gate({ ...run(v()), external_id: `p0g:v1:v:${head}:success:10:20:1` }, head),
  );
});
test("ordinary success stages V-SAFE then V-SUCC", async () => {
  const { github, state } = api();
  await upsertPhase0GateCheck({ github, ...decision("success") });
  assert.match(state.creates[0].external_id, /:safe:/);
  assert.match(state.updates[0].external_id, /:success:/);
});
test("ordinary failure creates V-FAIL", async () => {
  const { github, state } = api();
  await upsertPhase0GateCheck({ github, ...decision("failure") });
  assert.match(state.creates[0].external_id, /:failure:/);
  assert.equal(state.updates.length, 0);
});
test("infrastructure success creates completed/failure A-WAIT", async () => {
  const { github, state } = api();
  await upsertPhase0GateCheck({ github, ...decision("success", true) });
  assert.match(state.creates[0].external_id, /:a:.*:awaiting:/);
  assert.equal(state.creates[0].conclusion, "failure");
});
test("infrastructure failure remains V-FAIL", async () => {
  const { github, state } = api();
  await upsertPhase0GateCheck({ github, ...decision("failure", true) });
  assert.match(state.creates[0].external_id, /:v:.*:failure:/);
});
test("byte-identical terminal states are zero-write no-ops", async () => {
  for (const source of [v("success"), v("failure"), { ...v("awaiting"), kind: "a" }]) {
    const { github, state } = api([run(source)]);
    const result = await upsertPhase0GateCheck({
      github,
      ...decision(source.token === "awaiting" ? "success" : source.token, source.kind === "a"),
    });
    assert.equal(result.operation, "unchanged");
    assert.equal(state.updates.length, 0);
  }
});
test("Q has zero outgoing writes", async () => {
  const q = { ...run(v("failure")), external_id: `p0g:v1:q:${head}` };
  assert.equal(isCanonicalPhase0GateQ(q, head), true);
  const { github, state } = api([q]);
  await assert.rejects(upsertPhase0GateCheck({ github, ...decision("success") }), /Q_NO_WRITE/);
  assert.equal(state.updates.length, 0);
});
test("q-shaped success is U3 terminalized to canonical Q", async () => {
  const malformed = {
    ...run(v("success")),
    external_id: `p0g:v1:q:${head}`,
  };
  assert.equal(isCanonicalPhase0GateQ(malformed, head), false);
  const { github, state } = api([malformed]);
  await assert.rejects(
    upsertPhase0GateCheck({ github, ...decision("success", false, 2) }),
    (error) => error.outcome === "T2",
  );
  assert.equal(state.updates.length, 1);
  assert.equal(state.runs[0].external_id, `p0g:v1:q:${head}`);
  assert.equal(state.runs[0].conclusion, "failure");
  assert.equal(isCanonicalPhase0GateQ(state.runs[0], head), true);
});
test("q-shaped malformed non-success follows U3 without accidental authorization", async () => {
  for (const malformed of [
    { ...run(v("failure")), status: "in_progress", external_id: `p0g:v1:q:${head}` },
    { ...run(v("failure")), completed_at: "invalid", external_id: `p0g:v1:q:${head}` },
  ]) {
    assert.equal(isCanonicalPhase0GateQ(malformed, head), false);
    const { github, state } = api([malformed]);
    await assert.rejects(upsertPhase0GateCheck({ github, ...decision("success", false, 2) }));
    assert.equal(state.updates.length, 0);
    assert.notEqual(state.runs[0].conclusion, "success");
  }
});
test("post-KC3 cleanup distinguishes canonical Q from q-shaped success", async () => {
  const canonicalQ = { ...run(v("failure")), external_id: `p0g:v1:q:${head}` };
  let a = api([canonicalQ]);
  const noWrite = await terminalizeAuthorizedGate({
    github: a.github,
    owner: "o",
    repo: "r",
    candidateSha: head,
    checkRunId: 1,
    expectedExternalId: canonicalQ.external_id,
    detailsUrl: "https://github.com/o/r",
    reason: "test",
  });
  assert.equal(noWrite.operation, "Q_NO_WRITE");
  assert.equal(a.state.updates.length, 0);

  const manualSuccess = {
    kind: "m",
    token: "success",
    dispatchRunId: 30,
    dispatchAttempt: 2,
    actor: "jefferycook",
    pr: 7,
    base,
    verifierRunId: 20,
    verifierAttempt: 2,
  };
  const qShapedSuccess = {
    ...run(manualSuccess),
    external_id: `p0g:v1:q:${head}`,
  };
  a = api([qShapedSuccess]);
  const terminalized = await terminalizeAuthorizedGate({
    github: a.github,
    owner: "o",
    repo: "r",
    candidateSha: head,
    checkRunId: 1,
    expectedExternalId: serializePhase0Gate(head, manualSuccess),
    detailsUrl: "https://github.com/o/r",
    reason: "test",
  });
  assert.equal(terminalized.operation, "TERMINALIZED");
  assert.equal(a.state.updates.length, 1);
  assert.equal(isCanonicalPhase0GateQ(a.state.runs[0], head), true);
});
test("duplicates terminalize non-Q and never write Q IDs", async () => {
  const q = { ...run(v("failure"), 2), external_id: `p0g:v1:q:${head}` };
  const { github, state } = api([run(v(), 1), q]);
  await assert.rejects(upsertPhase0GateCheck({ github, ...decision("success") }), /duplicate/);
  assert.deepEqual(
    state.updates.map((x) => x.check_run_id),
    [1],
  );
  assert.match(state.updates[0].external_id, /:q:/);
});
test("duplicates skip canonical Q but terminalize q-shaped success", async () => {
  const canonicalQ = { ...run(v("failure"), 1), external_id: `p0g:v1:q:${head}` };
  const qShapedSuccess = {
    ...run(v("success"), 2),
    external_id: `p0g:v1:q:${head}`,
  };
  const { github, state } = api([canonicalQ, qShapedSuccess]);
  await assert.rejects(upsertPhase0GateCheck({ github, ...decision("success") }), /duplicate/);
  assert.deepEqual(
    state.updates.map((write) => write.check_run_id),
    [2],
  );
  assert.equal(
    isCanonicalPhase0GateQ(
      state.runs.find((item) => item.id === 1),
      head,
    ),
    true,
  );
  assert.equal(
    isCanonicalPhase0GateQ(
      state.runs.find((item) => item.id === 2),
      head,
    ),
    true,
  );
});
test("T1 duplicate cleanup attempts every non-Q ID and reports partial failures", async () => {
  const q = { ...run(v("failure"), 3), external_id: `p0g:v1:q:${head}` };
  const runs = [run(v("success"), 1), run(v("failure"), 2), q];
  const { github, state } = api(runs, { throwBeforeUpdate: [1, 2] });
  await assert.rejects(
    terminalizeDuplicateGateChecks({
      github,
      owner: "o",
      repo: "r",
      candidateSha: head,
      runs,
      detailsUrl: "https://github.com/o/r/actions/runs/30",
    }),
    (error) =>
      error instanceof AggregateError &&
      error.outcome === "T1" &&
      error.unresolved.length === 1 &&
      error.unresolved[0].id === 1 &&
      error.errors.length === 1 &&
      /unresolved IDs 1/.test(error.message),
  );
  assert.deepEqual(
    state.updates.map((write) => write.check_run_id),
    [1, 1, 2],
  );
  assert.match(state.runs.find((item) => item.id === 2).external_id, /:q:/);
  assert.equal(state.runs.find((item) => item.id === 3).external_id, q.external_id);
});
test("malformed success terminalizes; malformed failure is zero-write rejection", async () => {
  for (const conclusion of ["success", "failure"]) {
    const bad = { ...run(v()), conclusion, external_id: "bad" };
    const { github, state } = api([bad]);
    await assert.rejects(
      upsertPhase0GateCheck({ github, ...decision("success", false, 2) }),
      conclusion === "success" ? (error) => error.outcome === "T2" : undefined,
    );
    assert.equal(state.updates.length, conclusion === "success" ? 1 : 0);
  }
});
test("newer successful evaluation safely revokes old success before advancing", async () => {
  const { github, state } = api([run(v("success", 1))]);
  await upsertPhase0GateCheck({ github, ...decision("success", false, 2) });
  assert.match(state.updates[0].external_id, /:safe:/);
  assert.match(state.updates.at(-1).external_id, /:success:/);
});
test("contradictory same attempt stages SAFE then terminal Q", async () => {
  const { github, state } = api([run(v("success"))]);
  await assert.rejects(upsertPhase0GateCheck({ github, ...decision("failure") }), /T5/);
  assert.match(state.updates[0].external_id, /:safe:/);
  assert.match(state.updates[1].external_id, /:q:/);
});
test("KC-1 and KC-2 are the only automatic kind changes", async () => {
  let a = api([run(v("failure", 1))]);
  await upsertPhase0GateCheck({ github: a.github, ...decision("success", true, 2) });
  assert.match(a.state.updates.at(-1).external_id, /:a:.*:awaiting:/);
  a = api([run({ ...v("awaiting", 2), kind: "a" })]);
  await upsertPhase0GateCheck({ github: a.github, ...decision("failure", true, 3) });
  assert.match(a.state.updates.at(-1).external_id, /:v:.*:failure:/);
});
test("KC-3 A-WAIT to M-SAFE to M-SUCC preserves ID and verifier", async () => {
  const { github, state } = api([run({ ...v("awaiting"), kind: "a" })]);
  await authorizeManualGate({
    github,
    owner: "o",
    repo: "r",
    candidateSha: head,
    detailsUrl: "https://github.com/o/r/actions/runs/30",
    source: {
      dispatchRunId: 30,
      dispatchAttempt: 1,
      actor: "jefferycook",
      pullNumber: 7,
      baseSha: base,
    },
  });
  assert.deepEqual(
    state.updates.map((x) => x.check_run_id),
    [1, 1],
  );
  assert.match(state.updates[0].external_id, /:m:.*:safe:/);
  assert.match(state.updates[1].external_id, /:m:.*:success:/);
});
test("U4-X V-SUCC and V-SAFE are zero-write", async () => {
  for (const token of ["success", "safe"]) {
    const { github, state } = api([run(v(token))]);
    await assert.rejects(
      authorizeManualGate({
        github,
        owner: "o",
        repo: "r",
        candidateSha: head,
        detailsUrl: "https://github.com/o/r",
        source: {
          dispatchRunId: 30,
          dispatchAttempt: 1,
          actor: "jefferycook",
          pullNumber: 7,
          baseSha: base,
        },
      }),
      /U4-X/,
    );
    assert.equal(state.updates.length, 0);
  }
});
test("T-6 supersedes former T-7 for verifier arriving on M-SUCC", async () => {
  const m = {
    kind: "m",
    token: "success",
    dispatchRunId: 30,
    dispatchAttempt: 1,
    actor: "jefferycook",
    pr: 7,
    base,
    verifierRunId: 20,
    verifierAttempt: 1,
  };
  const { github, state } = api([run(m)]);
  await assert.rejects(
    upsertPhase0GateCheck({ github, ...decision("success", false, 2) }),
    (error) => error.outcome === "T6",
  );
  assert.match(state.updates[0].external_id, /:m:.*:safe:/);
  assert.match(state.updates[1].external_id, /:q:/);
});
test("audited tree and dispatch identities validate exactly", () => {
  assert.deepEqual(
    validateDispatch({
      ref: "refs/heads/main",
      actor: "jefferycook",
      approvalPhrase: "EXACT-SHA-AUDIT-PASS",
      prNumber: "7",
      head,
      base,
      tree,
    }),
    { prNumber: 7, head, base, tree },
  );
  for (const change of [
    { tree: "x" },
    { actor: "attacker" },
    { approvalPhrase: "yes" },
    { prNumber: "07" },
  ])
    assert.throws(() =>
      validateDispatch({
        ref: "refs/heads/main",
        actor: "jefferycook",
        approvalPhrase: "EXACT-SHA-AUDIT-PASS",
        prNumber: "7",
        head,
        base,
        tree,
        ...change,
      }),
    );
});
test("refetched live PR is revalidated against every trusted observation", () => {
  const pull = {
    state: "open",
    draft: false,
    merged: false,
    changed_files: 1,
    base: { ref: "main", sha: base },
    head: { sha: head, repo: { full_name: "o/r" } },
  };
  assert.equal(validateLivePull(pull, { owner: "o", repo: "r", head, base }), pull);
  for (const mutate of [
    (value) => (value.state = "closed"),
    (value) => (value.draft = true),
    (value) => (value.merged = true),
    (value) => (value.base.ref = "dev"),
    (value) => (value.base.sha = "8".repeat(40)),
    (value) => (value.head.sha = "8".repeat(40)),
    (value) => (value.head.repo.full_name = "attacker/r"),
    (value) => (value.changed_files = 0),
    (value) => (value.changed_files = 3001),
    (value) => (value.changed_files = 1.5),
  ]) {
    const changed = structuredClone(pull);
    mutate(changed);
    assert.throws(
      () => validateLivePull(changed, { owner: "o", repo: "r", head, base }),
      /P4 pull request identity mismatch/,
    );
  }
});
test("P4 rejects zero-file and incomplete file enumeration", () => {
  assert.deepEqual(validateFileEnumeration([{ filename: "a" }], 1), [{ filename: "a" }]);
  for (const [files, expected] of [
    [[], 0],
    [[], 1],
    [[{ filename: "a" }], 2],
    [new Array(3001).fill({}), 3001],
  ])
    assert.throws(() => validateFileEnumeration(files, expected), /P4 incomplete/);
});
test("classification covers protected paths and renames", () => {
  for (const path of [
    ".github/workflows/x.yml",
    "scripts/audit/x.mjs",
    "package.json",
    "vite.config.ts",
    "root.yml",
  ])
    assert.equal(infrastructurePath(path), true);
  assert.equal(infrastructurePath("src/ui.tsx"), false);
});
test("merge payload is exact and cannot select squash/rebase", async () => {
  const mergeSha = "4".repeat(40);
  const gate = run(v());
  const { github: merger, state } = api();
  const readGithub = {
    paginate: async () => [gate],
    request: async () => {
      const error = new Error("rule-suite endpoint unavailable");
      error.status = 404;
      throw error;
    },
    rest: {
      git: { getRef: async () => ({ data: { object: { sha: mergeSha } } }) },
      pulls: {
        get: async () => ({ data: { merged: true, state: "closed", merge_commit_sha: mergeSha } }),
      },
      repos: {
        getCommit: async () => ({
          data: {
            parents: [{ sha: base }, { sha: head }],
            commit: { tree: { sha: tree } },
            author: { login: MERGER_APP_BOT_LOGIN },
            committer: { login: "web-flow" },
          },
        }),
      },
      checks: { listForRef: async () => {} },
    },
  };
  await mergeOnce({
    mergerGithub: merger,
    readGithub,
    owner: "o",
    repo: "r",
    validated: {
      audit: { prNumber: 7, head, base, tree },
      gateId: 1,
      gateExternalId: gate.external_id,
      gateCompletedAt: completed,
      dispatchIdentity: { runId: 30, attempt: 2 },
    },
    confirmationDelayMs: 0,
  });
  assert.deepEqual(state.merges, [
    {
      owner: "o",
      repo: "r",
      pull_number: 7,
      sha: head,
      merge_method: "merge",
      commit_title: `Merge pull request #7 (Phase 0 audited head ${head})`,
      commit_message: `base ${base}\nhead ${head}\ngate 1 ${gate.external_id}\ndispatch 30/2`,
    },
  ]);
});
test("workflow serializes Gate and merge authority and orders least-privilege tokens", () => {
  const yml = readFileSync(
    new URL("../../.github/workflows/phase0-trust.yml", import.meta.url),
    "utf8",
  );
  const githubScriptPin = "3a2844b7e9c422d3c10d287c895573f7108da1b3";
  const githubScriptPins = [...yml.matchAll(/uses: actions\/github-script@([0-9a-f]{40})/g)].map(
    (match) => match[1],
  );
  assert.equal(githubScriptPins.length, 5);
  assert.deepEqual([...new Set(githubScriptPins)], [githubScriptPin]);
  assert.doesNotMatch(yml, /require\(\s*["']@actions\/github["']\s*\)/);
  assert.doesNotMatch(yml, /__original_require__/);
  assert.equal((yml.match(/\bgetOctokit\(/g) ?? []).length, 2);
  assert.doesNotMatch(yml, /\b(?:const|let|var)\s+(?:\{\s*)?getOctokit\b/);
  assert.match(yml, /merge-audited-candidate:/);
  assert.doesNotMatch(yml, /approve-audited-infrastructure:/);
  assert.match(yml, /audited_tree_sha:/);
  assert.equal((yml.match(/group: phase0-trust-\$\{\{ github\.repository \}\}/g) ?? []).length, 1);
  assert.doesNotMatch(yml, /group: phase0-gate-|group: phase0-merge-main/);
  assert.match(yml, /cancel-in-progress: false/);
  assert.match(yml, /PHASE0_MERGER_APP_PRIVATE_KEY/);
  assert.equal((yml.match(/permission-contents: write/g) ?? []).length, 1);
  assert.equal((yml.match(/mergerGithub\.rest\.pulls\.merge|pulls\.merge/g) ?? []).length, 0);
  assert.match(yml, /mergeOnce/);
  const prepare = yml.indexOf("Prepare P1 through P11 with read-only token");
  const gateToken = yml.indexOf("Mint Gate App token only for P7 cleanup or infrastructure P9");
  const finalize = yml.indexOf("Finalize P9 through P13");
  const mergerToken = yml.indexOf("Mint single-purpose Merger App token");
  const merge = yml.indexOf("Perform one exact-SHA merge and verify I1 through I7");
  assert.ok(
    prepare < gateToken && gateToken < finalize && finalize < mergerToken && mergerToken < merge,
  );
  assert.match(yml, /if: steps\.prepare\.outputs\.needs_gate_token == 'true'/);
  assert.match(yml, /const gateGithub = process\.env\.GATE_TOKEN \? getOctokit/);
  assert.match(yml, /mergerGithub: getOctokit\(process\.env\.MERGER_TOKEN\)/);
  assert.ok(yml.indexOf("github.rest.pulls.get") < yml.indexOf("validateLivePull(pull"));
  assert.match(yml, /validateFileEnumeration\(files, pull\.changed_files\)/);
  for (const field of [
    "auditedTree",
    "mergeSha",
    "mergeTree",
    "gateId",
    "gateProvenance",
    "gateCompletedAt",
    "rulesetA",
    "rulesetB",
    "ruleSuite",
  ])
    assert.match(yml, new RegExp(`${field}:`));
  const helper = readFileSync(new URL("./phase0-merge.mjs", import.meta.url), "utf8");
  assert.equal((helper.match(/mergerGithub\./g) ?? []).length, 1);
  assert.match(helper, /mergerGithub\.rest\.pulls\.merge/);
  assert.match(helper, /confirmationDelayMs = 5000/);
});

// Delta 4 X-42. These 336 outcomes are literal test-owned oracle data, ordered by:
// incoming [V_SUCCESS,V_FAILURE,M], relation [SAME,OLDER,NEWER,DIFFERENT],
// classification [ORDINARY,INFRASTRUCTURE], subcase [MATCH,MISMATCH].
const literal = (value) => value.trim().split(/\s+/);
const X42 = {
  "V-FAIL": literal(`
    T5 T4  T5 T4  T4 T4  T4 T4  V_FAIL_TO_V_SUCC T4  KC1 T4  T4 T4  T4 T4
    NOOP T4  NOOP T4  T4 T4  T4 T4  V_FAIL_UPDATE T4  V_FAIL_UPDATE T4  T4 T4  T4 T4
    REJECT_NO_MUTATION REJECT_NO_MUTATION  REJECT_NO_MUTATION REJECT_NO_MUTATION
    REJECT_NO_MUTATION REJECT_NO_MUTATION  REJECT_NO_MUTATION REJECT_NO_MUTATION
    REJECT_NO_MUTATION REJECT_NO_MUTATION  REJECT_NO_MUTATION REJECT_NO_MUTATION
    REJECT_NO_MUTATION REJECT_NO_MUTATION  REJECT_NO_MUTATION REJECT_NO_MUTATION
  `),
  "V-SAFE": literal(`
    V_SAFE_TO_V_SUCC T4  T6 T6  T4 T4  T6 T6  V_SAFE_ADVANCE_TO_V_SUCC T4  T6 T6  T4 T4  T6 T6
    T5 T4  T6 T6  T4 T4  T6 T6  V_SAFE_ADVANCE_TO_V_FAIL T4  T6 T6  T4 T4  T6 T6
    REJECT_NO_MUTATION REJECT_NO_MUTATION  REJECT_NO_MUTATION REJECT_NO_MUTATION
    REJECT_NO_MUTATION REJECT_NO_MUTATION  REJECT_NO_MUTATION REJECT_NO_MUTATION
    REJECT_NO_MUTATION REJECT_NO_MUTATION  REJECT_NO_MUTATION REJECT_NO_MUTATION
    REJECT_NO_MUTATION REJECT_NO_MUTATION  REJECT_NO_MUTATION REJECT_NO_MUTATION
  `),
  "V-SUCC": literal(`
    NOOP T4  T6 T6  T4 T4  T6 T6  V_SUCC_ADVANCE_TO_V_SUCC T4  T6 T6  T4 T4  T6 T6
    T5 T4  T6 T6  T4 T4  T6 T6  V_SUCC_TO_V_FAIL T4  T6 T6  T4 T4  T6 T6
    REJECT_NO_MUTATION REJECT_NO_MUTATION  REJECT_NO_MUTATION REJECT_NO_MUTATION
    REJECT_NO_MUTATION REJECT_NO_MUTATION  REJECT_NO_MUTATION REJECT_NO_MUTATION
    REJECT_NO_MUTATION REJECT_NO_MUTATION  REJECT_NO_MUTATION REJECT_NO_MUTATION
    REJECT_NO_MUTATION REJECT_NO_MUTATION  REJECT_NO_MUTATION REJECT_NO_MUTATION
  `),
  "A-WAIT": literal(`
    T6 T6  NOOP T4  T6 T6  T4 T4  T6 T6  A_WAIT_UPDATE T4  T6 T6  T4 T4
    T6 T6  T5 T4  T6 T6  T4 T4  T6 T6  KC2 T4  T6 T6  T4 T4
    REJECT_NO_MUTATION REJECT_NO_MUTATION  KC3 REJECT_NO_MUTATION
    REJECT_NO_MUTATION REJECT_NO_MUTATION  KC3 REJECT_NO_MUTATION
    REJECT_NO_MUTATION REJECT_NO_MUTATION  KC3 REJECT_NO_MUTATION
    REJECT_NO_MUTATION REJECT_NO_MUTATION  KC3 REJECT_NO_MUTATION
  `),
  "M-SAFE": literal(`
    T6 T6  T6 T6  T6 T6  T6 T6  T6 T6  T6 T6  T6 T6  T6 T6
    T6 T6  T6 T6  T6 T6  T6 T6  T6 T6  T6 T6  T6 T6  T6 T6
    REJECT_NO_MUTATION REJECT_NO_MUTATION  M_SAFE_TO_M_SUCC T6
    REJECT_NO_MUTATION REJECT_NO_MUTATION  T4 T6
    REJECT_NO_MUTATION REJECT_NO_MUTATION  M_SAFE_TO_M_SUCC T6
    REJECT_NO_MUTATION REJECT_NO_MUTATION  M_SAFE_TO_M_SUCC T6
  `),
  "M-SUCC": literal(`
    T6 T6  T6 T6  T6 T6  T6 T6  T6 T6  T6 T6  T6 T6  T6 T6
    T6 T6  T6 T6  T6 T6  T6 T6  T6 T6  T6 T6  T6 T6  T6 T6
    REJECT_NO_MUTATION REJECT_NO_MUTATION  NOOP T6
    REJECT_NO_MUTATION REJECT_NO_MUTATION  T4 T6
    REJECT_NO_MUTATION REJECT_NO_MUTATION  M_SUCC_REESTABLISH T6
    REJECT_NO_MUTATION REJECT_NO_MUTATION  M_SUCC_REESTABLISH T6
  `),
  Q: literal(`
    Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE
    Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE
    Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE
    Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE
    Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE
    Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE Q_NO_WRITE
  `),
};

const xStates = Object.keys(X42);
const xIncoming = ["V_SUCCESS", "V_FAILURE", "M"];
const xRelations = ["SAME", "OLDER", "NEWER", "DIFFERENT_RUN_OR_WORKFLOW"];
const xClasses = ["ORDINARY", "INFRASTRUCTURE"];
const xMatches = [true, false];
const manualBase = (token) => ({
  kind: "m",
  token,
  dispatchRunId: 30,
  dispatchAttempt: 2,
  actor: "jefferycook",
  pr: 7,
  base,
  verifierRunId: 20,
  verifierAttempt: 2,
});
function xExisting(state) {
  if (state === "Q") return { ...run(v("failure", 2)), external_id: `p0g:v1:q:${head}` };
  if (state === "A-WAIT") return run({ ...v("awaiting", 2), kind: "a" });
  if (state === "M-SAFE") return run(manualBase("safe"));
  if (state === "M-SUCC") return run(manualBase("success"));
  return run(v({ "V-FAIL": "failure", "V-SAFE": "safe", "V-SUCC": "success" }[state], 2));
}
function xSource(incoming, relation, matches) {
  if (incoming !== "M") {
    return {
      workflowId: relation === "DIFFERENT_RUN_OR_WORKFLOW" ? 11 : 10,
      runId: 20,
      runAttempt: relation === "OLDER" ? 1 : relation === "NEWER" ? 3 : 2,
      pullNumber: matches ? 7 : 8,
      baseSha: matches ? base : "9".repeat(40),
    };
  }
  return {
    dispatchRunId: relation === "DIFFERENT_RUN_OR_WORKFLOW" ? 31 : 30,
    dispatchAttempt: relation === "OLDER" ? 1 : relation === "NEWER" ? 3 : 2,
    actor: "jefferycook",
    pullNumber: matches ? 7 : 8,
    baseSha: matches ? base : "9".repeat(40),
    verifierRunId: matches ? 20 : 21,
    verifierAttempt: 2,
  };
}
function xFinalSource(incoming, classification, source) {
  if (incoming === "M")
    return {
      kind: "m",
      token: "success",
      dispatchRunId: source.dispatchRunId,
      dispatchAttempt: source.dispatchAttempt,
      actor: source.actor,
      pr: source.pullNumber,
      base: source.baseSha,
      verifierRunId: source.verifierRunId,
      verifierAttempt: source.verifierAttempt,
    };
  const common = {
    kind: classification === "INFRASTRUCTURE" && incoming === "V_SUCCESS" ? "a" : "v",
    workflowId: source.workflowId,
    runId: source.runId,
    attempt: source.runAttempt,
    pr: source.pullNumber,
    base: source.baseSha,
  };
  return {
    ...common,
    token: common.kind === "a" ? "awaiting" : incoming === "V_SUCCESS" ? "success" : "failure",
  };
}
function xExpectedWrites(outcome, state, incoming, classification, source, existing) {
  const q = `p0g:v1:q:${head}`;
  const old = state === "Q" ? null : parsePhase0Gate(existing, head);
  const final = xFinalSource(incoming, classification, source);
  const id = (s) => serializePhase0Gate(head, s);
  const safePrev = old && id({ ...old, token: "safe" });
  const safeFinal = id({ ...final, token: "safe" });
  if (["T4", "T5", "T6"].includes(outcome))
    return ["V-SUCC", "M-SUCC"].includes(state) ? [safePrev, q] : [q];
  if (["NOOP", "REJECT_NO_MUTATION", "Q_NO_WRITE"].includes(outcome)) return [];
  if (
    [
      "V_SAFE_TO_V_SUCC",
      "V_SAFE_ADVANCE_TO_V_SUCC",
      "V_FAIL_TO_V_SUCC",
      "M_SAFE_TO_M_SUCC",
      "KC3",
    ].includes(outcome)
  )
    return [safeFinal, id(final)];
  if (outcome === "V_SUCC_ADVANCE_TO_V_SUCC" || outcome === "M_SUCC_REESTABLISH")
    return [safePrev, safeFinal, id(final)];
  if (outcome === "V_SUCC_TO_V_FAIL") return [safePrev, id(final)];
  return [id(final)];
}

test("X-42 literal 336-cell Delta 4 oracle", async (t) => {
  const actualTotals = {};
  let cells = 0;
  for (const stateName of xStates) {
    assert.equal(X42[stateName].length, 48, `${stateName} literal row count`);
    let index = 0;
    for (const incoming of xIncoming)
      for (const relation of xRelations)
        for (const classification of xClasses)
          for (const matchesIdentity of xMatches) {
            const expectedOutcome = X42[stateName][index++];
            actualTotals[expectedOutcome] = (actualTotals[expectedOutcome] ?? 0) + 1;
            cells++;
            await t.test(
              `${stateName}/${incoming}/${relation}/${classification}/${matchesIdentity ? "MATCH" : "MISMATCH"} => ${expectedOutcome}`,
              async () => {
                const existing = xExisting(stateName);
                const source = xSource(incoming, relation, matchesIdentity);
                const { github, state } = api([existing]);
                let result;
                let thrown;
                try {
                  result = await transitionPhase0Gate({
                    github,
                    owner: "o",
                    repo: "r",
                    candidateSha: head,
                    existing,
                    incomingType: incoming === "M" ? "m" : "v",
                    classification: classification.toLowerCase(),
                    conclusion: incoming === "V_FAILURE" ? "failure" : "success",
                    detailsUrl: "https://github.com/o/r/actions/runs/30",
                    title: "title",
                    summary: "summary",
                    source,
                  });
                } catch (error) {
                  thrown = error;
                }
                const expectedWrites = xExpectedWrites(
                  expectedOutcome,
                  stateName,
                  incoming,
                  classification,
                  source,
                  existing,
                );
                assert.equal(state.creates.length, 0);
                assert.deepEqual(
                  state.updates.map((p) => p.check_run_id),
                  expectedWrites.map(() => 1),
                );
                assert.deepEqual(
                  state.updates.map((p) => p.external_id),
                  expectedWrites,
                );
                assert.deepEqual(
                  state.updates.map((p) => p.conclusion),
                  expectedWrites.map((id) => (id.includes(":success:") ? "success" : "failure")),
                );
                assert.equal(
                  state.gets.length,
                  state.updates.length,
                  "exact-ID I-Q refetch per update",
                );
                const shouldThrow = ["T4", "T5", "T6", "REJECT_NO_MUTATION", "Q_NO_WRITE"].includes(
                  expectedOutcome,
                );
                assert.equal(Boolean(thrown), shouldThrow, thrown?.stack);
                if (shouldThrow) assert.equal(thrown.outcome, expectedOutcome);
                else assert.equal(result.outcome, expectedOutcome);
                if (expectedOutcome === "NOOP") assert.equal(result.operation, "unchanged");
                if (expectedWrites.length)
                  assert.equal(state.runs[0].external_id, expectedWrites.at(-1));
                else assert.equal(state.runs[0].external_id, existing.external_id);
                if (expectedOutcome === "Q_NO_WRITE") assert.equal(state.gets.length, 0);
              },
            );
          }
  }
  assert.equal(cells, 336);
  assert.deepEqual(actualTotals, {
    T5: 5,
    T4: 62,
    V_FAIL_TO_V_SUCC: 1,
    KC1: 1,
    NOOP: 5,
    V_FAIL_UPDATE: 2,
    REJECT_NO_MUTATION: 76,
    T6: 120,
    V_SAFE_TO_V_SUCC: 1,
    V_SAFE_ADVANCE_TO_V_SUCC: 1,
    V_SAFE_ADVANCE_TO_V_FAIL: 1,
    V_SUCC_ADVANCE_TO_V_SUCC: 1,
    V_SUCC_TO_V_FAIL: 1,
    A_WAIT_UPDATE: 1,
    KC2: 1,
    KC3: 4,
    M_SAFE_TO_M_SUCC: 3,
    M_SUCC_REESTABLISH: 2,
    Q_NO_WRITE: 48,
  });
});

test("T-3 invalid manual actor stages M-SUCC safe then terminalizes", async () => {
  const existing = run(manualBase("success"));
  const { github, state } = api([existing]);
  await assert.rejects(
    transitionPhase0Gate({
      github,
      owner: "o",
      repo: "r",
      candidateSha: head,
      existing,
      incomingType: "m",
      classification: "infrastructure",
      conclusion: "success",
      detailsUrl: "https://github.com/o/r",
      title: "x",
      summary: "x",
      source: { ...xSource("M", "NEWER", true), actor: "attacker" },
    }),
    (error) => error.outcome === "T3",
  );
  assert.equal(state.updates.length, 2);
  assert.match(state.updates[0].external_id, /:m:.*:safe:/);
  assert.equal(state.updates[1].external_id, `p0g:v1:q:${head}`);
});
test("manual path never creates a missing Gate record", async () => {
  const a = api([]);
  await assert.rejects(
    authorizeManualGate({
      github: a.github,
      owner: "o",
      repo: "r",
      candidateSha: head,
      detailsUrl: "https://github.com/o/r",
      source: xSource("M", "SAME", true),
    }),
    /exactly one canonical Gate/,
  );
  assert.equal(a.state.creates.length, 0);
  assert.equal(a.state.updates.length, 0);
});

test("U4-X precedes invalid manual source normalization", async () => {
  const existing = run(v("success", 2));
  const { github, state } = api([existing]);
  await assert.rejects(
    transitionPhase0Gate({
      github,
      owner: "o",
      repo: "r",
      candidateSha: head,
      existing,
      incomingType: "m",
      classification: "infrastructure",
      conclusion: "success",
      detailsUrl: "https://github.com/o/r",
      title: "x",
      summary: "x",
      source: { actor: "attacker" },
    }),
    (error) => error.outcome === "REJECT_NO_MUTATION",
  );
  assert.equal(state.updates.length, 0);
});
test("U4-Y precedes staging and invalid manual source normalization", async () => {
  for (const stateName of ["V-FAIL", "V-SAFE", "V-SUCC", "A-WAIT", "M-SAFE", "M-SUCC"]) {
    const existing = xExisting(stateName);
    const a = api([existing]);
    await assert.rejects(
      transitionPhase0Gate({
        github: a.github,
        owner: "o",
        repo: "r",
        candidateSha: head,
        existing,
        incomingType: "m",
        classification: "ordinary",
        conclusion: "success",
        detailsUrl: "https://github.com/o/r",
        title: "x",
        summary: "x",
        source: { actor: "attacker" },
      }),
      (error) => error.outcome === "REJECT_NO_MUTATION",
    );
    assert.equal(a.state.updates.length, 0);
  }
});
test("Check creation accepts a matching immediate response without a recovery GET", async () => {
  const a = api();
  const result = await upsertPhase0GateCheck({
    github: a.github,
    ...decision("failure"),
  });
  assert.equal(result.outcome, "V_FAIL_CREATE");
  assert.equal(a.state.creates.length, 1);
  assert.equal(a.state.gets.length, 0);
  assert.equal(a.state.updates.length, 0);
  assert.equal(parsePhase0Gate(a.state.runs[0], head).state, "V-FAIL");
});
test("Check creation response mismatch recovers from one exact authoritative GET", async () => {
  const a = api([], { invalidCreateResponse: true });
  const result = await upsertPhase0GateCheck({
    github: a.github,
    ...decision("failure"),
  });
  assert.equal(result.outcome, "V_FAIL_CREATE");
  assert.equal(result.checkRunId, 100);
  assert.deepEqual(a.state.gets, [100]);
  assert.equal(a.state.creates.length, 1);
  assert.equal(a.state.updates.length, 0);
  assert.equal(parsePhase0Gate(a.state.runs[0], head).state, "V-FAIL");
});
test("Check creation response mismatch fails closed on an unproved authoritative read", async (t) => {
  for (const [name, options] of [
    ["GET mismatch", { invalidCreateResponse: true, invalidGetResponseAt: [1] }],
    ["GET throws", { invalidCreateResponse: true, getThrowsAt: [1] }],
  ])
    await t.test(name, async () => {
      const a = api([], options);
      await assert.rejects(
        upsertPhase0GateCheck({ github: a.github, ...decision("failure") }),
        /invalid Check Run create response/,
      );
      assert.equal(a.state.creates.length, 1);
      assert.deepEqual(a.state.gets, [100]);
      assert.equal(a.state.updates.length, 0);
    });
});
test("Check creation invalid response ID fails without a GET or speculative create", async (t) => {
  for (const invalidId of [undefined, 0, -1, "100"])
    await t.test(String(invalidId), async () => {
      const a = api([], { createResponseId: invalidId });
      await assert.rejects(
        upsertPhase0GateCheck({ github: a.github, ...decision("failure") }),
        /invalid Check Run create response/,
      );
      assert.equal(a.state.creates.length, 1);
      assert.equal(a.state.gets.length, 0);
      assert.equal(a.state.updates.length, 0);
    });
});
test("Check update accepts a matching immediate response without a recovery GET", async () => {
  const a = api();
  const result = await upsertPhase0GateCheck({
    github: a.github,
    ...decision("success"),
  });
  assert.equal(result.outcome, "V_SUCC_CREATE");
  assert.equal(result.checkRunId, 100);
  assert.deepEqual(a.state.gets, [100]);
  assert.equal(a.state.creates.length, 1);
  assert.equal(a.state.updates.length, 1);
  assert.equal(parsePhase0Gate(a.state.runs[0], head).state, "V-SUCC");
});
test("Check update response mismatch recovers from one exact authoritative GET", async () => {
  const a = api([], { invalidUpdateResponseAt: [1] });
  const result = await upsertPhase0GateCheck({
    github: a.github,
    ...decision("success"),
  });
  assert.equal(result.outcome, "V_SUCC_CREATE");
  assert.equal(result.checkRunId, 100);
  assert.deepEqual(a.state.gets, [100, 100]);
  assert.equal(a.state.creates.length, 1);
  assert.equal(a.state.updates.length, 1);
  assert.equal(parsePhase0Gate(a.state.runs[0], head).state, "V-SUCC");
});
test("Check update response mismatch fails closed on an unproved authoritative read", async (t) => {
  for (const [name, options] of [
    ["GET mismatch", { invalidUpdateResponseAt: [1], invalidGetResponseAt: [2] }],
    ["GET throws", { invalidUpdateResponseAt: [1], getThrowsAt: [2] }],
  ])
    await t.test(name, async () => {
      const a = api([], options);
      await assert.rejects(
        upsertPhase0GateCheck({ github: a.github, ...decision("success") }),
        /invalid Check Run update response 100/,
      );
      assert.equal(a.state.creates.length, 1);
      assert.deepEqual(a.state.gets, [100, 100]);
      assert.equal(a.state.updates.length, 1);
    });
});
test("Check mutation transport ambiguity recovers only a proven applied write", async () => {
  let existing = xExisting("V-SAFE");
  let a = api([existing], { throwAfterUpdate: [1] });
  const recovered = await transitionPhase0Gate({
    github: a.github,
    owner: "o",
    repo: "r",
    candidateSha: head,
    existing,
    incomingType: "v",
    classification: "ordinary",
    conclusion: "success",
    detailsUrl: "https://github.com/o/r",
    title: "x",
    summary: "x",
    source: xSource("V_SUCCESS", "SAME", true),
  });
  assert.equal(recovered.outcome, "V_SAFE_TO_V_SUCC");
  existing = xExisting("V-SAFE");
  a = api([existing], { throwBeforeUpdate: [1] });
  await assert.rejects(
    transitionPhase0Gate({
      github: a.github,
      owner: "o",
      repo: "r",
      candidateSha: head,
      existing,
      incomingType: "v",
      classification: "ordinary",
      conclusion: "success",
      detailsUrl: "https://github.com/o/r",
      title: "x",
      summary: "x",
      source: xSource("V_SUCCESS", "SAME", true),
    }),
    /ambiguous Check Run update/,
  );
  assert.equal(a.state.runs[0].external_id, existing.external_id);
});
test("U4 throw-before-apply recovery revokes V-SUCC and rejects the evaluation", async () => {
  const existing = run(v("success", 1));
  const a = api([existing], { throwBeforeUpdate: [1] });
  await assert.rejects(
    upsertPhase0GateCheck({ github: a.github, ...decision("success", false, 2) }),
    (error) =>
      error instanceof AggregateError &&
      error.nonAuthorizingGateProven === true &&
      /evaluation rejected/.test(error.message),
  );
  assert.equal(a.state.updates.length, 2);
  assert.equal(parsePhase0Gate(a.state.runs[0], head).state, "V-SAFE");
  assert.equal(a.state.runs[0].conclusion, "failure");
});
test("U4 throw-before-apply recovery revokes M-SUCC and rejects redispatch", async () => {
  const existing = xExisting("M-SUCC");
  const a = api([existing], { throwBeforeUpdate: [1] });
  await assert.rejects(
    transitionPhase0Gate({
      github: a.github,
      owner: "o",
      repo: "r",
      candidateSha: head,
      existing,
      incomingType: "m",
      classification: "infrastructure",
      conclusion: "success",
      detailsUrl: "https://github.com/o/r",
      title: "x",
      summary: "x",
      source: xSource("M", "NEWER", true),
    }),
    (error) =>
      error instanceof AggregateError &&
      error.nonAuthorizingGateProven === true &&
      /evaluation rejected/.test(error.message),
  );
  assert.equal(a.state.updates.length, 2);
  assert.equal(parsePhase0Gate(a.state.runs[0], head).state, "M-SAFE");
  assert.equal(a.state.runs[0].conclusion, "failure");
});
test("U4 throw-after-apply recovery rejects V-SUCC advancement after proving V-SAFE", async (t) => {
  for (const [conclusion, sourceKind] of [
    ["success", "V_SUCCESS"],
    ["failure", "V_FAILURE"],
  ])
    await t.test(conclusion, async () => {
      const existing = xExisting("V-SUCC");
      const a = api([existing], { throwAfterUpdate: [1] });
      await assert.rejects(
        transitionPhase0Gate({
          github: a.github,
          owner: "o",
          repo: "r",
          candidateSha: head,
          existing,
          incomingType: "v",
          classification: "ordinary",
          conclusion,
          detailsUrl: "https://github.com/o/r",
          title: "x",
          summary: "x",
          source: xSource(sourceKind, "NEWER", true),
        }),
        (error) =>
          error instanceof AggregateError &&
          error.nonAuthorizingGateProven === true &&
          parsePhase0Gate(error.recovered, head).state === "V-SAFE" &&
          /current evaluation rejected/.test(error.message),
      );
      assert.equal(a.state.updates.length, 1);
      assert.equal(parsePhase0Gate(a.state.runs[0], head).state, "V-SAFE");
      assert.equal(a.state.runs[0].conclusion, "failure");
    });
});
test("U4 throw-after-apply recovery rejects M-SUCC redispatch after proving M-SAFE", async () => {
  const existing = xExisting("M-SUCC");
  const a = api([existing], { throwAfterUpdate: [1] });
  await assert.rejects(
    transitionPhase0Gate({
      github: a.github,
      owner: "o",
      repo: "r",
      candidateSha: head,
      existing,
      incomingType: "m",
      classification: "infrastructure",
      conclusion: "success",
      detailsUrl: "https://github.com/o/r",
      title: "x",
      summary: "x",
      source: xSource("M", "NEWER", true),
    }),
    (error) =>
      error instanceof AggregateError &&
      error.nonAuthorizingGateProven === true &&
      parsePhase0Gate(error.recovered, head).state === "M-SAFE" &&
      /current evaluation rejected/.test(error.message),
  );
  assert.equal(a.state.updates.length, 1);
  assert.equal(parsePhase0Gate(a.state.runs[0], head).state, "M-SAFE");
  assert.equal(a.state.runs[0].conclusion, "failure");
});
test("U4 invalid applied PATCH response rejects after proving V-SAFE", async () => {
  const existing = xExisting("V-SUCC");
  const a = api([existing], { invalidUpdateResponseAt: [1] });
  await assert.rejects(
    transitionPhase0Gate({
      github: a.github,
      owner: "o",
      repo: "r",
      candidateSha: head,
      existing,
      incomingType: "v",
      classification: "ordinary",
      conclusion: "success",
      detailsUrl: "https://github.com/o/r",
      title: "x",
      summary: "x",
      source: xSource("V_SUCCESS", "NEWER", true),
    }),
    (error) =>
      error instanceof AggregateError &&
      error.nonAuthorizingGateProven === true &&
      parsePhase0Gate(error.recovered, head).state === "V-SAFE" &&
      /current evaluation rejected/.test(error.message),
  );
  assert.equal(a.state.updates.length, 1);
  assert.equal(parsePhase0Gate(a.state.runs[0], head).state, "V-SAFE");
  assert.equal(a.state.runs[0].conclusion, "failure");
});
test("failed U4 recovery explicitly reports that non-authorizing state is unproven", async () => {
  const existing = run(v("success", 1));
  const a = api([existing], { throwBeforeUpdate: [1, 2] });
  await assert.rejects(
    upsertPhase0GateCheck({ github: a.github, ...decision("success", false, 2) }),
    (error) =>
      error instanceof AggregateError &&
      /non-authorizing Gate state could not be proven/.test(error.message),
  );
  assert.equal(a.state.runs[0].conclusion, "success");
});

const rulesetA = {
  id: 22812673,
  name: "Phase 0 main protection",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
  bypass_actors: [],
  rules: [
    { type: "deletion" },
    { type: "non_fast_forward" },
    {
      type: "pull_request",
      parameters: {
        required_approving_review_count: 0,
        dismiss_stale_reviews_on_push: false,
        required_reviewers: [],
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_review_thread_resolution: false,
        require_extra_approval_for_unattributed_changes: false,
        allowed_merge_methods: ["merge"],
      },
    },
    {
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        do_not_enforce_on_create: false,
        required_status_checks: [{ context: "phase0-gate", integration_id: 4876044 }],
      },
    },
  ],
};
const rulesetB = {
  id: 991,
  name: "Phase 0 main update restriction",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
  bypass_actors: [{ actor_type: "Integration", actor_id: 4915565, bypass_mode: "pull_request" }],
  rules: [{ type: "update" }],
};
function rulesClient(a = rulesetA, bs = [rulesetB]) {
  const all = [a, ...bs];
  return {
    request: async (route, parameters) => {
      if (route.includes("rules/branches")) return { data: all.map((r) => ({ ruleset_id: r.id })) };
      return { data: structuredClone(all.find((r) => r.id === parameters.ruleset_id)) };
    },
  };
}
test("Ruleset A exact normative configuration and drift rejection", () => {
  assert.doesNotThrow(() => validateRulesetA(structuredClone(rulesetA)));
  for (const mutate of [
    (r) => (r.target = "tag"),
    (r) => (r.enforcement = "disabled"),
    (r) => (r.conditions.ref_name.include = ["refs/heads/dev"]),
    (r) => (r.conditions.ref_name.include = ["~DEFAULT_BRANCH"]),
    (r) => r.conditions.ref_name.exclude.push("refs/heads/dev"),
    (r) => r.bypass_actors.push({ actor_type: "RepositoryRole", actor_id: 5 }),
    (r) => r.rules.splice(0, 1),
    (r) => r.rules.push({ type: "update" }),
    (r) => r.rules.push({ type: "deletion" }),
    (r) =>
      (r.rules.find((x) => x.type === "pull_request").parameters.allowed_merge_methods = [
        "squash",
      ]),
    (r) =>
      (r.rules.find(
        (x) => x.type === "required_status_checks",
      ).parameters.strict_required_status_checks_policy = false),
    (r) =>
      (r.rules.find(
        (x) => x.type === "required_status_checks",
      ).parameters.required_status_checks[0].integration_id = 1),
    (r) =>
      (r.rules.find(
        (x) => x.type === "required_status_checks",
      ).parameters.do_not_enforce_on_create = true),
  ]) {
    const changed = structuredClone(rulesetA);
    mutate(changed);
    assert.throws(() => validateRulesetA(changed), /Ruleset A drift/);
  }
});
test("Ruleset B exact actor/ref/rule configuration", () => {
  assert.equal(isRulesetB(structuredClone(rulesetB)), true);
  for (const mutate of [
    (r) => (r.target = "tag"),
    (r) => (r.enforcement = "disabled"),
    (r) => (r.conditions.ref_name.include = ["refs/heads/dev"]),
    (r) => (r.conditions.ref_name.include = ["~DEFAULT_BRANCH"]),
    (r) => r.rules.push({ type: "deletion" }),
    (r) => (r.rules = []),
    (r) => (r.bypass_actors[0].actor_type = "RepositoryRole"),
    (r) => (r.bypass_actors[0].actor_id = 4915564),
    (r) => (r.bypass_actors[0].bypass_mode = "always"),
    (r) =>
      r.bypass_actors.push({ actor_type: "Integration", actor_id: 2, bypass_mode: "pull_request" }),
  ]) {
    const changed = structuredClone(rulesetB);
    mutate(changed);
    assert.equal(isRulesetB(changed), false);
  }
});
test("Ruleset B missing and duplicate matches fail closed", async () => {
  await assert.rejects(validateRulesets(rulesClient(rulesetA, []), "o", "r"), /found 0/);
  await assert.rejects(
    validateRulesets(rulesClient(rulesetA, [rulesetB, { ...rulesetB, id: 992 }]), "o", "r"),
    /found 2/,
  );
});

function preflightClient(change = {}) {
  const gate = Object.hasOwn(change, "gate") ? change.gate : run(v("success", 2));
  const gates = change.gates ?? (gate ? [gate] : []);
  const wrongApp = change.wrongApp ? [{ ...run(v("success", 2), 88), app: { id: 999 } }] : [];
  const files = change.files ?? [{ filename: "src/ui.tsx", status: "modified" }];
  const rules = rulesClient(change.rulesetA ?? rulesetA, change.rulesets ?? [rulesetB]);
  let mainReads = 0;
  let pullReads = 0;
  let commitReads = 0;
  let checkLists = 0;
  let checkUpdates = 0;
  const client = {
    paginate: async (method) => {
      if (method === client.rest.pulls.listFiles) return files;
      if (method === client.rest.repos.listCommitStatusesForRef)
        return change.legacy ? [{ context: "phase0-gate" }] : [];
      if (method === client.rest.checks.listForRef) {
        checkLists += 1;
        if (change.p13GateChange && checkLists >= 5 && gates[0])
          Object.assign(gates[0], {
            external_id: serializePhase0Gate(head, {
              kind: "m",
              token: "success",
              dispatchRunId: 31,
              dispatchAttempt: 1,
              actor: "jefferycook",
              pr: 7,
              base,
              verifierRunId: 20,
              verifierAttempt: 2,
            }),
            conclusion: "success",
            completed_at: "2026-09-15T12:00:09Z",
          });
        return [...gates, ...wrongApp];
      }
      throw new Error("unexpected paginate method");
    },
    request: async (route, parameters) => {
      if (route.includes("actions/workflows")) return { data: { id: 10 } };
      return rules.request(route, parameters);
    },
    rest: {
      pulls: {
        listFiles: async () => {},
        get: async () => {
          pullReads += 1;
          return {
            data: {
              state: change.pullState ?? "open",
              draft: change.pullDraft ?? false,
              merged: change.pullMerged ?? false,
              changed_files: change.changedFiles ?? files.length,
              base: {
                ref: change.pullBaseRef ?? "main",
                sha: change.p13Base && pullReads > 1 ? "8".repeat(40) : (change.pullBase ?? base),
              },
              head: {
                sha: change.p13Head && pullReads > 1 ? "8".repeat(40) : (change.pullHead ?? head),
                repo: { full_name: change.pullRepo ?? "o/r" },
              },
            },
          };
        },
      },
      git: {
        getRef: async () => {
          mainReads += 1;
          return {
            data: {
              object: {
                sha: change.p13Main && mainReads > 1 ? "8".repeat(40) : (change.main ?? base),
              },
            },
          };
        },
      },
      repos: {
        listCommitStatusesForRef: async () => {},
        getCommit: async ({ ref }) => {
          if (ref !== head) return { data: {} };
          commitReads += 1;
          return {
            data: {
              parents: [{ sha: base }],
              commit: {
                tree: {
                  sha: change.p13Tree && commitReads > 1 ? "8".repeat(40) : (change.tree ?? tree),
                },
              },
            },
          };
        },
        compareCommitsWithBasehead: async () => ({
          data: { merge_base_commit: { sha: base }, ahead_by: 1, behind_by: 0, total_commits: 1 },
        }),
      },
      checks: {
        listForRef: async () => {},
        get: async ({ check_run_id }) => ({
          data: structuredClone(gates.find((item) => item.id === check_run_id)),
        }),
        update: async (payload) => {
          checkUpdates += 1;
          if (change.throwBeforeUpdate?.includes(checkUpdates)) throw new Error("transport");
          const item = gates.find((candidate) => candidate.id === payload.check_run_id);
          Object.assign(item, {
            name: payload.name,
            status: payload.status,
            conclusion: payload.conclusion,
            completed_at: payload.completed_at,
            external_id: payload.external_id,
          });
          return { data: structuredClone(item) };
        },
      },
      actions: {
        getWorkflowRun: async () => {
          if (change.verifierThrows) throw new Error("verifier transport");
          return {
            data: {
              id: 20,
              workflow_id: change.workflowId ?? 10,
              run_attempt: 2,
              head_sha: head,
              conclusion: "success",
              event: "pull_request",
              path: ".github/workflows/phase0-verify.yml",
              head_repository: { full_name: "o/r" },
            },
          };
        },
      },
    },
  };
  return client;
}
const dispatch = {
  ref: "refs/heads/main",
  actor: "jefferycook",
  approvalPhrase: "EXACT-SHA-AUDIT-PASS",
  prNumber: "7",
  head,
  base,
  tree,
};
async function preflight(change = {}, dispatchChange = {}) {
  const github = preflightClient(change);
  return validateBeforeMerge({
    github,
    gateGithub: github,
    owner: "o",
    repo: "r",
    dispatch: { ...dispatch, ...dispatchChange },
    trustedSha: base,
    helperSha: base,
    dispatchRunId: 30,
    dispatchAttempt: 1,
  });
}
test("P7/P8/P9 merge preflight accepts one exact ordinary V-SUCC", async () => {
  const result = await preflight();
  assert.equal(result.gateId, 1);
  assert.equal(result.infrastructure, false);
});
test("merge preflight required rejection matrix", async (t) => {
  const malformed = { ...run(v("success", 2)), external_id: "bad" };
  const q = { ...run(v("failure", 2)), external_id: `p0g:v1:q:${head}` };
  const failed = run(v("failure", 2));
  const cases = [
    ["missing Gate", { gate: null }, {}, /exactly one canonical Gate/],
    ["failed Gate", { gate: failed }, {}, /lacks V-SUCC/],
    ["Q Gate", { gate: q }, {}, /Gate audit identity mismatch/],
    ["malformed provenance", { gate: malformed }, {}, /invalid v2 provenance/],
    ["duplicate Gate", { gates: [run(v("success", 2)), run(v("success", 2), 2)] }, {}, /T1/],
    ["legacy poison", { legacy: true }, {}, /legacy phase0-gate/],
    ["wrong-App same-name", { wrongApp: true }, {}, /wrong-App/],
    ["wrong PR", {}, { prNumber: "8" }, /Gate audit identity mismatch/],
    ["wrong actor", {}, { actor: "attacker" }, /dispatch authority/],
    ["wrong phrase", {}, { approvalPhrase: "yes" }, /dispatch authority/],
    ["moved head", { pullHead: "8".repeat(40) }, {}, /pull request identity/],
    ["moved base", { main: "8".repeat(40) }, {}, /live main moved/],
    ["zero-file candidate", { files: [], changedFiles: 0 }, {}, /pull request identity/],
    ["audited tree mismatch", { tree: "8".repeat(40) }, {}, /parent\/tree mismatch/],
    ["wrong verifier workflow ID", { workflowId: 11 }, {}, /verifier provenance/],
    ["verifier transport ambiguity", { verifierThrows: true }, {}, /verifier transport/],
  ];
  for (const [name, change, dispatchChange, pattern] of cases)
    await t.test(name, async () => assert.rejects(preflight(change, dispatchChange), pattern));
});

test("every post-KC3 pre-P14 failure leaves the Gate non-authorizing", async (t) => {
  const driftedA = structuredClone(rulesetA);
  driftedA.enforcement = "disabled";
  const driftedB = structuredClone(rulesetB);
  driftedB.conditions.ref_name.include = ["~DEFAULT_BRANCH"];
  const cases = [
    ["Ruleset A drift", { rulesetA: driftedA }],
    ["Ruleset B missing", { rulesets: [] }],
    ["Ruleset B drift", { rulesets: [driftedB] }],
    ["P13 main changed", { p13Main: true }],
    ["P13 head changed", { p13Head: true }],
    ["P13 tree changed", { p13Tree: true }],
    ["P13 Gate changed", { p13GateChange: true }],
  ];
  for (const [name, change] of cases)
    await t.test(name, async () => {
      const gate = run(awaiting());
      const github = preflightClient({
        gate,
        files: [{ filename: ".github/workflows/candidate.yml", status: "modified" }],
        ...change,
      });
      await assert.rejects(
        validateBeforeMerge({
          github,
          gateGithub: github,
          owner: "o",
          repo: "r",
          dispatch,
          trustedSha: base,
          helperSha: base,
          dispatchRunId: 30,
          dispatchAttempt: 1,
        }),
      );
      assert.equal(gate.conclusion, "failure");
      assert.equal(gate.external_id, `p0g:v1:q:${head}`);
    });
});
test("post-KC3 P12/P13 cleanup recovers Q after a throw-before-apply", async (t) => {
  const driftedA = structuredClone(rulesetA);
  driftedA.enforcement = "disabled";
  for (const [name, change] of [
    ["P12 Ruleset A failure", { rulesetA: driftedA }],
    ["P13 main failure", { p13Main: true }],
  ])
    await t.test(name, async () => {
      const gate = run(awaiting());
      const github = preflightClient({
        gate,
        files: [{ filename: ".github/workflows/candidate.yml", status: "modified" }],
        throwBeforeUpdate: [3],
        ...change,
      });
      await assert.rejects(
        validateBeforeMerge({
          github,
          gateGithub: github,
          owner: "o",
          repo: "r",
          dispatch,
          trustedSha: base,
          helperSha: base,
          dispatchRunId: 30,
          dispatchAttempt: 1,
        }),
      );
      assert.equal(gate.external_id, `p0g:v1:q:${head}`);
      assert.equal(gate.conclusion, "failure");
      assert.equal(isCanonicalPhase0GateQ(gate, head), true);
    });
});

test("read-only preparation identifies whether a Gate token is actually required", async () => {
  const ordinary = preflightClient();
  const ordinaryPrepared = await prepareBeforeMerge({
    github: ordinary,
    owner: "o",
    repo: "r",
    dispatch,
    trustedSha: base,
    helperSha: base,
    dispatchRunId: 30,
    dispatchAttempt: 1,
  });
  assert.equal(ordinaryPrepared.requiresGateToken, false);
  const infrastructure = preflightClient({
    gate: run(awaiting()),
    files: [{ filename: ".github/workflows/candidate.yml", status: "modified" }],
  });
  const infrastructurePrepared = await prepareBeforeMerge({
    github: infrastructure,
    owner: "o",
    repo: "r",
    dispatch,
    trustedSha: base,
    helperSha: base,
    dispatchRunId: 30,
    dispatchAttempt: 1,
  });
  assert.equal(infrastructurePrepared.requiresGateToken, true);
  await assert.rejects(
    finalizeBeforeMerge({
      github: infrastructure,
      owner: "o",
      repo: "r",
      prepared: infrastructurePrepared,
      trustedSha: base,
    }),
    /Gate token required/,
  );
});

function postMergeFixture(change = {}) {
  const mergeSha = "4".repeat(40);
  const gate = change.gate ?? run(v("success", 2));
  const writes = [];
  const ruleSuiteRequests = [];
  const mergerGithub = {
    rest: {
      pulls: {
        merge: async (payload) => {
          writes.push(payload);
          if (change.httpStatus) {
            const error = new Error("HTTP refusal");
            error.status = change.httpStatus;
            throw error;
          }
          if (change.transport) throw new Error("transport");
          return {
            data: {
              merged: change.responseMerged ?? true,
              sha: change.responseSha ?? mergeSha,
            },
          };
        },
      },
    },
  };
  const readGithub = {
    paginate: async () => [gate],
    request: async (route, parameters) => {
      ruleSuiteRequests.push({ route, parameters });
      if (route.endsWith("/rule-suites")) {
        const mode = change.ruleSuiteMode ?? "unavailable";
        if (mode === "unavailable") {
          const error = new Error("rule-suite endpoint unavailable");
          error.status = 404;
          throw error;
        }
        if (mode === "no-exact") return { data: [] };
        return {
          data: [
            {
              id: 71,
              head_sha: mergeSha,
              result: mode === "wrong-result" ? "fail" : "pass",
              actor: {
                login: mode === "wrong-actor" ? "attacker" : MERGER_APP_BOT_LOGIN,
              },
            },
          ],
        };
      }
      if (route.includes("rule-suites/{rule_suite_id}"))
        return { data: { id: 71, rule_evaluations: [{ rule_source: "Repository" }] } };
      throw new Error(`unexpected route ${route}`);
    },
    rest: {
      checks: { listForRef: async () => {} },
      git: {
        getRef: async () => ({ data: { object: { sha: change.main ?? mergeSha } } }),
      },
      pulls: {
        get: async () => ({
          data: {
            merged: change.merged ?? true,
            state: change.state ?? "closed",
            merge_commit_sha: change.prMergeSha ?? mergeSha,
          },
        }),
      },
      repos: {
        getCommit: async () => ({
          data: {
            parents: change.parents ?? [
              { sha: change.parent1 ?? base },
              { sha: change.parent2 ?? head },
            ],
            commit: { tree: { sha: change.mergeTree ?? tree } },
            author: { login: change.author ?? MERGER_APP_BOT_LOGIN },
            committer: { login: change.committer ?? "web-flow" },
          },
        }),
      },
    },
  };
  const validated = {
    audit: { prNumber: 7, head, base, tree },
    gateId: 1,
    gateExternalId: run(v("success", 2)).external_id,
    gateCompletedAt: completed,
    dispatchIdentity: { runId: 30, attempt: 2 },
  };
  return { mergerGithub, readGithub, validated, writes, mergeSha, ruleSuiteRequests };
}
test("merge ambiguity never retries and recovered merge runs invariants", async () => {
  const f = postMergeFixture({ transport: true });
  const result = await mergeOnce({
    ...f,
    owner: "o",
    repo: "r",
    confirmationDelayMs: 0,
    ruleSuiteAttempts: 1,
    ruleSuiteDelayMs: 0,
  });
  assert.equal(result.mergeSha, f.mergeSha);
  assert.equal(f.writes.length, 1);
});
test("definitive merge refusals never enter ambiguity recovery", async () => {
  for (const change of [{ responseMerged: false }, { httpStatus: 422 }]) {
    const f = postMergeFixture(change);
    await assert.rejects(
      mergeOnce({
        ...f,
        owner: "o",
        repo: "r",
        confirmationDelayMs: 0,
        ruleSuiteAttempts: 1,
        ruleSuiteDelayMs: 0,
      }),
      /definitive merge refusal/,
    );
    assert.equal(f.writes.length, 1);
  }
});
test("merge ambiguity non-merged and indeterminate cases fail closed without retry", async () => {
  for (const change of [
    { transport: true, merged: false, state: "open" },
    { transport: true, merged: true, prMergeSha: "8".repeat(40) },
  ]) {
    const f = postMergeFixture(change);
    await assert.rejects(
      mergeOnce({
        ...f,
        owner: "o",
        repo: "r",
        confirmationDelayMs: 0,
        ruleSuiteAttempts: 1,
        ruleSuiteDelayMs: 0,
      }),
      /not proven/,
    );
    assert.equal(f.writes.length, 1);
  }
});
test("post-merge invariant rejection matrix", async (t) => {
  const changedGate = { ...run(v("success", 2)), completed_at: "2026-09-15T12:00:01Z" };
  const changedGateId = { ...run(v("success", 2)), id: 9 };
  const changedGateProvenance = run(v("success", 3));
  const changedGateConclusion = run(v("failure", 2));
  const cases = [
    ["wrong parent count", { parents: [{ sha: base }] }, /graph\/tree\/author\/committer/],
    ["wrong parent1", { parent1: "8".repeat(40) }, /graph\/tree\/author\/committer/],
    ["wrong parent2", { parent2: "8".repeat(40) }, /graph\/tree\/author\/committer/],
    ["wrong tree", { mergeTree: "8".repeat(40) }, /graph\/tree\/author\/committer/],
    ["wrong author", { author: "attacker" }, /graph\/tree\/author\/committer/],
    ["wrong committer", { committer: "attacker" }, /graph\/tree\/author\/committer/],
    ["wrong main ref", { main: "8".repeat(40) }, /main does not equal/],
    ["PR not merged", { merged: false }, /PR merge state/],
    ["merge SHA mismatch", { prMergeSha: "8".repeat(40) }, /PR merge state/],
    ["Gate changed", { gate: changedGate }, /Gate changed/],
    ["Gate ID changed", { gate: changedGateId }, /Gate changed/],
    ["Gate provenance changed", { gate: changedGateProvenance }, /Gate changed/],
    ["Gate conclusion changed", { gate: changedGateConclusion }, /Gate changed/],
  ];
  for (const [name, change, pattern] of cases)
    await t.test(name, async () => {
      const f = postMergeFixture(change);
      await assert.rejects(
        mergeOnce({
          ...f,
          owner: "o",
          repo: "r",
          confirmationDelayMs: 0,
          ruleSuiteAttempts: 1,
          ruleSuiteDelayMs: 0,
        }),
        pattern,
      );
      assert.equal(f.writes.length, 1);
    });
});

test("I6 rule-suite evidence distinguishes endpoint availability and exact evidence", async () => {
  const unavailable = postMergeFixture({ ruleSuiteMode: "unavailable" });
  const unavailableResult = await mergeOnce({
    ...unavailable,
    owner: "o",
    repo: "r",
    confirmationDelayMs: 0,
    ruleSuiteAttempts: 1,
    ruleSuiteDelayMs: 0,
  });
  assert.equal(unavailableResult.ruleSuite.available, false);
  assert.match(unavailableResult.ruleSuite.reason, /endpoint unavailable/);
  assert.equal(unavailable.writes.length, 1);

  const valid = postMergeFixture({ ruleSuiteMode: "valid" });
  const validResult = await mergeOnce({
    ...valid,
    owner: "o",
    repo: "r",
    confirmationDelayMs: 0,
    ruleSuiteAttempts: 1,
    ruleSuiteDelayMs: 0,
  });
  assert.deepEqual(
    {
      available: validResult.ruleSuite.available,
      id: validResult.ruleSuite.id,
      result: validResult.ruleSuite.result,
      actor: validResult.ruleSuite.actor,
    },
    { available: true, id: 71, result: "pass", actor: MERGER_APP_BOT_LOGIN },
  );
  assert.equal(validResult.ruleSuite.detail.rule_evaluations.length, 1);
  assert.equal(valid.ruleSuiteRequests[0].parameters.time_period, "hour");
  assert.equal(valid.writes.length, 1);

  for (const [mode, attempts] of [
    ["no-exact", 2],
    ["wrong-actor", 1],
    ["wrong-result", 1],
  ]) {
    const fixture = postMergeFixture({ ruleSuiteMode: mode });
    await assert.rejects(
      mergeOnce({
        ...fixture,
        owner: "o",
        repo: "r",
        confirmationDelayMs: 0,
        ruleSuiteAttempts: attempts,
        ruleSuiteDelayMs: 0,
      }),
      /I6/,
    );
    assert.equal(fixture.writes.length, 1);
    if (mode === "no-exact")
      assert.equal(
        fixture.ruleSuiteRequests.filter(({ route }) => route.endsWith("/rule-suites")).length,
        2,
      );
  }
});

test("crash recovery covers every Delta 4 multi-write outcome", async (t) => {
  const cases = [
    [
      "V_SAFE_TO_V_SUCC",
      xExisting("V-SAFE"),
      "v",
      "ordinary",
      "success",
      xSource("V_SUCCESS", "SAME", true),
      2,
    ],
    [
      "V_SAFE_ADVANCE_TO_V_SUCC",
      xExisting("V-SAFE"),
      "v",
      "ordinary",
      "success",
      xSource("V_SUCCESS", "NEWER", true),
      2,
    ],
    [
      "V_FAIL_TO_V_SUCC",
      xExisting("V-FAIL"),
      "v",
      "ordinary",
      "success",
      xSource("V_SUCCESS", "NEWER", true),
      2,
    ],
    [
      "V_SUCC_ADVANCE_TO_V_SUCC",
      xExisting("V-SUCC"),
      "v",
      "ordinary",
      "success",
      xSource("V_SUCCESS", "NEWER", true),
      3,
    ],
    [
      "V_SUCC_TO_V_FAIL",
      xExisting("V-SUCC"),
      "v",
      "ordinary",
      "failure",
      xSource("V_FAILURE", "NEWER", true),
      2,
    ],
    ["KC3", xExisting("A-WAIT"), "m", "infrastructure", "success", xSource("M", "SAME", true), 2],
    [
      "M_SAFE_TO_M_SUCC",
      xExisting("M-SAFE"),
      "m",
      "infrastructure",
      "success",
      xSource("M", "NEWER", true),
      2,
    ],
    [
      "M_SUCC_REESTABLISH",
      xExisting("M-SUCC"),
      "m",
      "infrastructure",
      "success",
      xSource("M", "NEWER", true),
      3,
    ],
  ];
  for (const [outcome, existing, incomingType, classification, conclusion, source, writes] of cases)
    for (let crashAt = 1; crashAt <= writes; crashAt++)
      await t.test(`${outcome} transport crash after write ${crashAt}`, async () => {
        const a = api([existing], { throwAfterUpdate: [crashAt] });
        const invoke = () =>
          transitionPhase0Gate({
            github: a.github,
            owner: "o",
            repo: "r",
            candidateSha: head,
            existing,
            incomingType,
            classification,
            conclusion,
            detailsUrl: "https://github.com/o/r",
            title: "x",
            summary: "x",
            source,
          });
        const startingState = parsePhase0Gate(existing, head).state;
        if (crashAt === 1 && ["V-SUCC", "M-SUCC"].includes(startingState)) {
          await assert.rejects(
            invoke(),
            (error) =>
              error instanceof AggregateError &&
              error.nonAuthorizingGateProven === true &&
              /current evaluation rejected/.test(error.message),
          );
          assert.equal(
            parsePhase0Gate(a.state.runs[0], head).state,
            startingState === "V-SUCC" ? "V-SAFE" : "M-SAFE",
          );
          assert.equal(a.state.runs[0].conclusion, "failure");
          assert.equal(a.state.updates.length, 1);
        } else {
          const result = await invoke();
          assert.equal(result.outcome, outcome);
          assert.equal(
            a.state.runs[0].conclusion,
            outcome === "V_SUCC_TO_V_FAIL" ? "failure" : "success",
          );
        }
      });
});

test("T4/T5/T6 reject after an applied U4 SAFE and preserve later SAFE-to-Q recovery", async (t) => {
  const cases = [
    ["T4", "ordinary", "success", xSource("V_SUCCESS", "OLDER", true)],
    ["T5", "ordinary", "failure", xSource("V_FAILURE", "SAME", true)],
    ["T6", "infrastructure", "success", xSource("V_SUCCESS", "SAME", true)],
  ];
  for (const [rule, classification, conclusion, source] of cases)
    for (const crashAt of [1, 2])
      await t.test(`${rule} transport crash after write ${crashAt}`, async () => {
        const existing = xExisting("V-SUCC");
        const a = api([existing], { throwAfterUpdate: [crashAt] });
        const invoke = () =>
          transitionPhase0Gate({
            github: a.github,
            owner: "o",
            repo: "r",
            candidateSha: head,
            existing,
            incomingType: "v",
            classification,
            conclusion,
            detailsUrl: "https://github.com/o/r",
            title: "x",
            summary: "x",
            source,
          });
        if (crashAt === 1) {
          await assert.rejects(
            invoke(),
            (error) =>
              error instanceof AggregateError &&
              error.nonAuthorizingGateProven === true &&
              /current evaluation rejected/.test(error.message),
          );
          assert.equal(parsePhase0Gate(a.state.runs[0], head).state, "V-SAFE");
          assert.equal(a.state.runs[0].conclusion, "failure");
          assert.equal(a.state.updates.length, 1);
        } else {
          await assert.rejects(invoke(), (error) => error.outcome === rule);
          assert.equal(a.state.runs[0].external_id, `p0g:v1:q:${head}`);
        }
      });
});
test("T4/T5/T6 terminal Q recovers after a throw-before-apply", async (t) => {
  const cases = [
    ["T4", "ordinary", "success", xSource("V_SUCCESS", "OLDER", true)],
    ["T5", "ordinary", "failure", xSource("V_FAILURE", "SAME", true)],
    ["T6", "infrastructure", "success", xSource("V_SUCCESS", "SAME", true)],
  ];
  for (const [rule, classification, conclusion, source] of cases)
    await t.test(rule, async () => {
      const existing = xExisting("V-SUCC");
      const a = api([existing], { throwBeforeUpdate: [2] });
      await assert.rejects(
        transitionPhase0Gate({
          github: a.github,
          owner: "o",
          repo: "r",
          candidateSha: head,
          existing,
          incomingType: "v",
          classification,
          conclusion,
          detailsUrl: "https://github.com/o/r",
          title: "x",
          summary: "x",
          source,
        }),
        (error) => error.outcome === rule,
      );
      assert.deepEqual(
        a.state.updates.map((write) => write.check_run_id),
        [1, 1, 1],
      );
      assert.equal(isCanonicalPhase0GateQ(a.state.runs[0], head), true);
      assert.equal(a.state.runs[0].conclusion, "failure");
    });
});

test("independent verify-merge helper preserves Git graph and tree invariants", () => {
  const root = mkdtempSync(join(tmpdir(), "phase0-verify-merge-"));
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git(["init", "--initial-branch=main"]);
  git(["config", "user.name", "Phase0 Test"]);
  git(["config", "user.email", "phase0@example.invalid"]);
  writeFileSync(join(root, "a.txt"), "base\n");
  git(["add", "a.txt"]);
  git(["commit", "-m", "base"]);
  const gitBase = git(["rev-parse", "HEAD"]);
  git(["switch", "-c", "candidate"]);
  writeFileSync(join(root, "a.txt"), "candidate\n");
  git(["commit", "-am", "candidate"]);
  const gitHead = git(["rev-parse", "HEAD"]);
  git(["switch", "main"]);
  git(["merge", "--no-ff", "candidate", "-m", "merge"]);
  const merge = git(["rev-parse", "HEAD"]);
  const script = fileURLToPath(new URL("./verify-merge.mjs", import.meta.url));
  const good = spawnSync(
    process.execPath,
    [script, "--merge", merge, "--base", gitBase, "--head", gitHead],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /PASS/);
  const wrongParent = spawnSync(
    process.execPath,
    [script, "--merge", gitHead, "--base", gitBase, "--head", gitHead],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(wrongParent.status, 0);
  assert.match(wrongParent.stderr, /exactly two parents/);
  const wrongHead = spawnSync(
    process.execPath,
    [script, "--merge", merge, "--base", gitBase, "--head", gitBase],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(wrongHead.status, 0);
  assert.match(wrongHead.stderr, /second parent/);
});
