import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PHASE0_GATE_APP_ID,
  PHASE0_GATE_NAME,
  upsertPhase0GateCheck,
} from "./phase0-gate-check.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const bundleScript = join(scripts, "make-review-bundle.mjs");
const verifyCommitScript = join(scripts, "verify-commit.mjs");
const verifyMergeScript = join(scripts, "verify-merge.mjs");
const candidateSha = "1111111111111111111111111111111111111111";
const auditedBaseSha = "2222222222222222222222222222222222222222";

function verifyDecision(runId, runAttempt, conclusion) {
  return {
    github: null,
    owner: "jefferycook",
    repo: "canadian-wealth-compass",
    candidateSha,
    conclusion,
    detailsUrl: `https://github.com/jefferycook/canadian-wealth-compass/actions/runs/${runId}`,
    title: conclusion === "success" ? "Phase 0 verification passed" : "Phase 0 verification failed",
    summary: `Trusted verifier run ${runId}, attempt ${runAttempt}`,
    source: { kind: "verify", workflowId: 1234, runId, runAttempt },
  };
}

function manualDecision(workflowRunId, workflowRunAttempt) {
  return {
    github: null,
    owner: "jefferycook",
    repo: "canadian-wealth-compass",
    candidateSha,
    conclusion: "success",
    detailsUrl: `https://github.com/jefferycook/canadian-wealth-compass/actions/runs/${workflowRunId}`,
    title: "Phase 0 infrastructure audit approved",
    summary: "Audited manual decision",
    source: {
      kind: "manual",
      workflowRunId,
      workflowRunAttempt,
      actor: "jefferycook",
      pullNumber: 12,
      auditedBaseSha,
    },
  };
}

function assertIsoTimestamp(value) {
  assert.equal(typeof value, "string");
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/);
  assert.equal(Number.isNaN(new Date(value).valueOf()), false);
}

function assertWholeSecondTimestamp(value) {
  assertIsoTimestamp(value);
  assert.doesNotMatch(value, /\./);
}

function checksApi(initialRuns = [], options = {}) {
  const state = {
    runs: structuredClone(initialRuns),
    lists: [],
    creates: [],
    updates: [],
    gets: [],
    legacyStatusReads: 0,
    nextId: 100,
  };
  const listForRef = async () => {
    throw new Error("listForRef must be called through paginate");
  };
  const github = {
    paginate: async (method, parameters) => {
      assert.equal(method, listForRef);
      state.lists.push(structuredClone(parameters));
      return structuredClone(state.runs);
    },
    rest: {
      checks: {
        listForRef,
        create: async (payload) => {
          state.creates.push(structuredClone(payload));
          const run = {
            id: state.nextId++,
            name: payload.name,
            head_sha: payload.head_sha,
            status: payload.status,
            conclusion: payload.conclusion,
            completed_at: options.omitCreateCompletedAt
              ? undefined
              : (options.createCompletedAt ?? payload.completed_at),
            details_url: payload.details_url,
            external_id: payload.external_id,
            output: structuredClone(payload.output),
            app: { id: options.createAppId ?? PHASE0_GATE_APP_ID },
          };
          state.runs.push(run);
          return { data: structuredClone(run) };
        },
        update: async (payload) => {
          const behavior = options.updateBehaviors?.[state.updates.length] ?? {};
          state.updates.push(structuredClone(payload));
          if (behavior.throwBeforeApply) throw new Error(behavior.throwBeforeApply);
          const run = state.runs.find((candidate) => candidate.id === payload.check_run_id);
          if (!run) throw new Error("missing mocked Check Run");
          Object.assign(run, {
            name: payload.name,
            status: payload.status,
            conclusion: payload.conclusion,
            completed_at:
              (behavior.omitCompletedAt ?? options.omitUpdateCompletedAt)
                ? undefined
                : typeof behavior.completedAt === "function"
                  ? behavior.completedAt(payload.completed_at)
                  : (behavior.completedAt ?? options.updateCompletedAt ?? payload.completed_at),
            details_url: payload.details_url,
            external_id: payload.external_id,
            output: structuredClone(payload.output),
          });
          if (behavior.throwAfterApply) throw new Error(behavior.throwAfterApply);
          return { data: structuredClone(run) };
        },
        get: async (payload) => {
          state.gets.push(structuredClone(payload));
          if (options.getThrows) throw new Error("mocked Check Run fetch failure");
          const run = state.runs.find((candidate) => candidate.id === payload.check_run_id);
          if (!run) throw new Error("missing mocked Check Run");
          return { data: structuredClone(run) };
        },
      },
      repos: {
        getCombinedStatusForRef: async () => {
          state.legacyStatusReads += 1;
          throw new Error("legacy statuses are not an authority");
        },
      },
    },
  };
  return { github, state };
}

function repository(label = "repo") {
  const parent = mkdtempSync(join(tmpdir(), `phase0-git-test-${label}-`));
  const root = join(parent, "repo");
  const home = join(parent, "home");
  const hooks = join(parent, "empty-hooks");
  const globalConfig = join(parent, "empty-gitconfig");
  mkdirSync(root);
  mkdirSync(home);
  mkdirSync(hooks);
  writeFileSync(globalConfig, "");
  const config = [
    ["user.name", "Phase0 Test"],
    ["user.email", "phase0@example.invalid"],
    ["commit.gpgsign", "false"],
    ["core.autocrlf", "false"],
    ["core.hooksPath", hooks],
  ];
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: globalConfig,
    HOME: home,
    USERPROFILE: home,
    GIT_CONFIG_COUNT: String(config.length),
  };
  config.forEach(([key, value], index) => {
    env[`GIT_CONFIG_KEY_${index}`] = key;
    env[`GIT_CONFIG_VALUE_${index}`] = value;
  });

  function git(args, options = {}) {
    return execFileSync("git", args, {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    }).trim();
  }
  function script(file, args) {
    return spawnSync(process.execPath, [file, ...args], {
      cwd: root,
      env,
      encoding: "utf8",
      shell: false,
    });
  }
  function commit(message = "commit") {
    git(["add", "-A"]);
    git(["commit", "-m", message]);
    return git(["rev-parse", "HEAD"]);
  }

  git(["init", "--initial-branch=main"]);
  writeFileSync(join(root, "tracked.txt"), "base\n");
  const base = commit("base");
  return { parent, root, env, git, script, commit, base };
}

function makeBundle(repo, suffix = "bundle") {
  const out = join(repo.parent, suffix);
  const result = repo.script(bundleScript, ["--base", repo.base, "--out", out]);
  assert.equal(result.status, 0, result.stderr);
  return {
    out,
    diff: readFileSync(join(out, "review.diff"), "utf8"),
    manifest: JSON.parse(readFileSync(join(out, "review-manifest.json"), "utf8")),
  };
}

test("A: review bundle contains tracked, untracked, and deleted changes", () => {
  const repo = repository("boundary");
  writeFileSync(join(repo.root, "tracked.txt"), "modified\n");
  writeFileSync(join(repo.root, "delete.txt"), "temporary\n");
  repo.commit("add deletion target");
  repo.base = repo.git(["rev-parse", "HEAD"]);
  writeFileSync(join(repo.root, "tracked.txt"), "modified again\n");
  writeFileSync(join(repo.root, "new.txt"), "new again\n");
  // Node's unlink is used only inside this isolated temporary repository.
  execFileSync(process.execPath, [
    "-e",
    "require('node:fs').unlinkSync(process.argv[1])",
    join(repo.root, "delete.txt"),
  ]);
  const bundle = makeBundle(repo);
  assert.match(bundle.diff, /diff --git a\/tracked\.txt b\/tracked\.txt/);
  assert.match(bundle.diff, /diff --git a\/new\.txt b\/new\.txt/);
  assert.match(bundle.diff, /deleted file mode/);
  assert.deepEqual(bundle.manifest.changedFiles.map((line) => line.split("\t")[0]).sort(), [
    "A",
    "D",
    "M",
  ]);
});

test("B: review bundle leaves the real index byte-identical and empty", () => {
  const repo = repository("index");
  writeFileSync(join(repo.root, "tracked.txt"), "working tree\n");
  const bundle = makeBundle(repo);
  assert.equal(bundle.manifest.realIndexUnchanged, true);
  assert.equal(bundle.manifest.realIndexEmpty, true);
  assert.equal(bundle.manifest.realIndexSha256Before, bundle.manifest.realIndexSha256After);
  assert.equal(repo.git(["diff", "--cached", "--name-only"]), "");
});

test("C: committed tree equals the tree produced by the one temp-index snapshot", () => {
  const repo = repository("identity");
  writeFileSync(join(repo.root, "tracked.txt"), "reviewed\n");
  writeFileSync(join(repo.root, "new.txt"), "reviewed new\n");
  const bundle = makeBundle(repo);
  repo.commit("candidate");
  assert.equal(repo.git(["rev-parse", "HEAD^{tree}"]), bundle.manifest.reviewedTreeSha);
});

test("D: post-bundle working-tree drift invalidates the old reviewed tree", () => {
  const repo = repository("drift");
  writeFileSync(join(repo.root, "tracked.txt"), "reviewed\n");
  const bundle = makeBundle(repo, "old-bundle");
  writeFileSync(join(repo.root, "tracked.txt"), "changed after review\n");
  const regenerated = makeBundle(repo, "new-bundle");
  assert.notEqual(regenerated.manifest.reviewedTreeSha, bundle.manifest.reviewedTreeSha);
  repo.commit("candidate drift");
  assert.notEqual(repo.git(["rev-parse", "HEAD^{tree}"]), bundle.manifest.reviewedTreeSha);
  const check = repo.script(verifyCommitScript, [
    "--base",
    repo.base,
    "--tree",
    bundle.manifest.reviewedTreeSha,
  ]);
  assert.notEqual(check.status, 0);
});

test("E: ignored files stay out while .gitignore policy changes remain visible", () => {
  const repo = repository("ignore");
  writeFileSync(join(repo.root, ".gitignore"), "ignored.txt\n");
  repo.commit("ignore policy");
  repo.base = repo.git(["rev-parse", "HEAD"]);
  writeFileSync(join(repo.root, "ignored.txt"), "hidden\n");
  const ignored = makeBundle(repo, "ignored-bundle");
  assert.equal(ignored.manifest.reviewedTreeSha, repo.git(["rev-parse", "HEAD^{tree}"]));
  assert.doesNotMatch(ignored.diff, /ignored\.txt/);

  writeFileSync(join(repo.root, ".gitignore"), "ignored.txt\nother.tmp\n");
  const policy = makeBundle(repo, "policy-bundle");
  assert.deepEqual(policy.manifest.changedFiles, ["M\t.gitignore"]);
  assert.match(policy.diff, /\+other\.tmp/);
  assert.doesNotMatch(policy.diff, /hidden/);
  // Audit implication: the visible .gitignore change must be reviewed for the
  // hidden-file semantics that cannot appear in a Git tree.
});

function candidateRepository(label) {
  const repo = repository(label);
  writeFileSync(join(repo.root, "tracked.txt"), "candidate\n");
  const bundle = makeBundle(repo);
  repo.commit("candidate");
  return { repo, bundle };
}

test("F: verify-commit accepts only the reviewed one-parent one-commit boundary", () => {
  const correct = candidateRepository("commit-pass");
  assert.equal(
    correct.repo.script(verifyCommitScript, [
      "--base",
      correct.repo.base,
      "--tree",
      correct.bundle.manifest.reviewedTreeSha,
    ]).status,
    0,
  );
  assert.notEqual(
    correct.repo.script(verifyCommitScript, [
      "--base",
      correct.repo.git(["rev-parse", "HEAD"]),
      "--tree",
      correct.bundle.manifest.reviewedTreeSha,
    ]).status,
    0,
  );
  assert.notEqual(
    correct.repo.script(verifyCommitScript, [
      "--base",
      correct.repo.base,
      "--tree",
      correct.repo.git(["rev-parse", `${correct.repo.base}^{tree}`]),
    ]).status,
    0,
  );

  writeFileSync(join(correct.repo.root, "second.txt"), "second\n");
  correct.repo.commit("extra commit");
  assert.notEqual(
    correct.repo.script(verifyCommitScript, [
      "--base",
      correct.repo.base,
      "--tree",
      correct.repo.git(["rev-parse", "HEAD^{tree}"]),
    ]).status,
    0,
  );

  const merge = repository("commit-merge");
  merge.git(["switch", "-c", "candidate"]);
  writeFileSync(join(merge.root, "candidate.txt"), "candidate\n");
  merge.commit("candidate");
  merge.git(["switch", "main"]);
  writeFileSync(join(merge.root, "main.txt"), "main\n");
  merge.commit("main advance");
  merge.git(["merge", "--no-ff", "candidate", "-m", "merge"]);
  assert.notEqual(
    merge.script(verifyCommitScript, [
      "--base",
      merge.base,
      "--tree",
      merge.git(["rev-parse", "HEAD^{tree}"]),
    ]).status,
    0,
  );
});

test("G: verify-merge pins parent order, audited head, tree, and merge shape", () => {
  const repo = repository("merge");
  repo.git(["switch", "-c", "candidate"]);
  writeFileSync(join(repo.root, "candidate.txt"), "candidate\n");
  const head = repo.commit("candidate");
  const headTree = repo.git(["rev-parse", `${head}^{tree}`]);
  repo.git(["switch", "main"]);
  const merge = repo.git(["commit-tree", headTree, "-p", repo.base, "-p", head, "-m", "merge"]);

  assert.equal(
    repo.script(verifyMergeScript, ["--merge", merge, "--base", repo.base, "--head", head]).status,
    0,
  );
  assert.notEqual(
    repo.script(verifyMergeScript, ["--merge", merge, "--base", repo.base, "--head", repo.base])
      .status,
    0,
  );
  assert.notEqual(
    repo.script(verifyMergeScript, ["--merge", merge, "--base", head, "--head", repo.base]).status,
    0,
  );

  const drift = repo.git([
    "commit-tree",
    `${repo.base}^{tree}`,
    "-p",
    repo.base,
    "-p",
    head,
    "-m",
    "drift merge",
  ]);
  assert.notEqual(
    repo.script(verifyMergeScript, ["--merge", drift, "--base", repo.base, "--head", head]).status,
    0,
  );

  const squash = repo.git(["commit-tree", headTree, "-p", repo.base, "-m", "squash"]);
  assert.notEqual(
    repo.script(verifyMergeScript, ["--merge", squash, "--base", repo.base, "--head", head]).status,
    0,
  );
});

test("H: trusted classification requires complete live PR file enumeration", () => {
  const workflowPath = resolve(scripts, "../../.github/workflows/phase0-trust.yml");
  const workflow = readFileSync(workflowPath, "utf8");
  const automaticStart = workflow.indexOf("  evaluate-verify:");
  const manualStart = workflow.indexOf("  approve-audited-infrastructure:");
  assert.ok(automaticStart >= 0 && manualStart > automaticStart);

  const sections = {
    automatic: workflow.slice(automaticStart, manualStart),
    manual: workflow.slice(manualStart),
  };
  for (const [name, section] of Object.entries(sections)) {
    assert.match(section, /github\.rest\.pulls\.get\(/, `${name} must fetch the complete live PR`);
    assert.match(
      section,
      /Number\.isSafeInteger\(pull\.changed_files\)/,
      `${name} must validate changed_files`,
    );
    assert.match(section, /pull\.changed_files < 0/, `${name} must reject negative counts`);
    assert.match(
      section,
      /pull\.changed_files > 3000/,
      `${name} must reject the REST 3,000-file cap`,
    );
    assert.match(
      section,
      /files\.length !== pull\.changed_files/,
      `${name} must prove pagination completeness`,
    );
  }
});

test("I: review output uses component-safe outside paths and fresh directories", () => {
  const repo = repository("outside-paths");
  writeFileSync(join(repo.root, "tracked.txt"), "reviewed\n");

  const dotPrefixedInside = repo.script(bundleScript, [
    "--base",
    repo.base,
    "--out",
    join(repo.root, "..review"),
  ]);
  assert.notEqual(dotPrefixedInside.status, 0);
  assert.match(dotPrefixedInside.stderr, /outside the repository worktree/);

  const nestedInside = repo.script(bundleScript, [
    "--base",
    repo.base,
    "--out",
    join(repo.root, "nested", "review"),
  ]);
  assert.notEqual(nestedInside.status, 0);
  assert.match(nestedInside.stderr, /outside the repository worktree/);

  const genuineOutside = join(repo.parent, "genuine-outside");
  const outside = repo.script(bundleScript, ["--base", repo.base, "--out", genuineOutside]);
  assert.equal(outside.status, 0, outside.stderr);
  assert.ok(existsSync(join(genuineOutside, "review-manifest.json")));

  const preExisting = join(repo.parent, "pre-existing-outside");
  mkdirSync(preExisting);
  writeFileSync(join(preExisting, "verification.log"), "stale evidence\n");
  const stale = repo.script(bundleScript, ["--base", repo.base, "--out", preExisting]);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /must not already exist/);
  assert.equal(readFileSync(join(preExisting, "verification.log"), "utf8"), "stale evidence\n");
});

test("J: requested success creates failure first, then authorizes the same Check Run ID", async () => {
  const { github, state } = checksApi();
  const input = verifyDecision(7001, 1, "success");
  input.github = github;
  const result = await upsertPhase0GateCheck(input);

  assert.deepEqual(result.operation, "created");
  assert.equal(state.creates.length, 1);
  assert.equal(state.updates.length, 1);
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0].id, result.checkRunId);
  assert.equal(state.runs[0].name, PHASE0_GATE_NAME);
  assert.equal(state.runs[0].head_sha, candidateSha);
  assert.equal(state.runs[0].app.id, PHASE0_GATE_APP_ID);
  assert.equal(state.runs[0].conclusion, "success");
  assert.equal(state.creates[0].conclusion, "failure");
  assert.match(state.creates[0].external_id, /:failure:1234:7001:1$/);
  assert.equal(state.updates[0].check_run_id, result.checkRunId);
  assert.equal(state.updates[0].conclusion, "success");
  assert.match(state.updates[0].external_id, /:success:1234:7001:1$/);
  assertWholeSecondTimestamp(state.creates[0].completed_at);
  assertWholeSecondTimestamp(state.updates[0].completed_at);
  assert.deepEqual(state.lists, [
    {
      owner: input.owner,
      repo: input.repo,
      ref: candidateSha,
      check_name: PHASE0_GATE_NAME,
      app_id: PHASE0_GATE_APP_ID,
      filter: "all",
      per_page: 100,
    },
  ]);
});

test("K: same-SHA reruns update the same canonical Check Run in both directions", async () => {
  const { github, state } = checksApi();
  const success = verifyDecision(7100, 1, "success");
  success.github = github;
  const created = await upsertPhase0GateCheck(success);
  const failure = verifyDecision(7100, 2, "failure");
  failure.github = github;
  const failed = await upsertPhase0GateCheck(failure);

  assert.equal(failed.operation, "updated");
  assert.equal(failed.checkRunId, created.checkRunId);
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0].conclusion, "failure");
  assert.equal(state.creates.length, 1);
  assert.equal(state.updates.length, 3);
  assert.equal(state.updates[0].conclusion, "success");
  assert.equal(state.updates[1].conclusion, "failure");
  assert.match(state.updates[1].external_id, new RegExp(`^p0g:v1:q:${candidateSha}$`));
  assert.equal(state.updates[2].conclusion, "failure");
  assert.equal(state.updates[2].check_run_id, created.checkRunId);
  assertWholeSecondTimestamp(state.updates[2].completed_at);

  const laterSuccess = verifyDecision(7100, 3, "success");
  laterSuccess.github = github;
  const passed = await upsertPhase0GateCheck(laterSuccess);
  assert.equal(passed.operation, "updated");
  assert.equal(passed.checkRunId, created.checkRunId);
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0].conclusion, "success");
  assert.equal(state.creates.length, 1);
  assert.equal(state.updates.length, 5);
  assert.deepEqual(
    state.updates.slice(3).map((update) => update.conclusion),
    ["failure", "success"],
  );
  assert.ok(state.updates.every((update) => update.check_run_id === created.checkRunId));
  assert.match(state.runs[0].external_id, /:success:1234:7100:3$/);
  assert.ok(state.runs[0].external_id.length <= 255);
});

test("L: failure to success requires a new trusted decision and preserves identity", async () => {
  const { github, state } = checksApi();
  const failure = verifyDecision(7200, 1, "failure");
  failure.github = github;
  const created = await upsertPhase0GateCheck(failure);
  assert.equal(state.runs[0].conclusion, "failure");

  await assert.rejects(
    upsertPhase0GateCheck({ ...verifyDecision(7200, 2, "success"), github, source: null }),
    /missing trusted decision source/,
  );
  assert.equal(state.runs[0].conclusion, "failure");
  assert.equal(state.updates.length, 0);

  const success = verifyDecision(7200, 2, "success");
  success.github = github;
  const updated = await upsertPhase0GateCheck(success);
  assert.equal(updated.checkRunId, created.checkRunId);
  assert.equal(state.runs[0].conclusion, "success");
});

test("M: duplicate authoritative successes are all quarantined before rejection", async () => {
  const seed = checksApi();
  const input = verifyDecision(7300, 1, "success");
  input.github = seed.github;
  await upsertPhase0GateCheck(input);
  const duplicateRuns = [
    structuredClone(seed.state.runs[0]),
    { ...structuredClone(seed.state.runs[0]), id: seed.state.runs[0].id + 1 },
  ];
  const { github, state } = checksApi(duplicateRuns);

  await assert.rejects(
    upsertPhase0GateCheck({ ...verifyDecision(7300, 2, "failure"), github }),
    /ambiguous authoritative phase0-gate Check Runs/,
  );
  assert.equal(state.creates.length, 0);
  assert.deepEqual(
    state.updates.map((update) => update.check_run_id),
    duplicateRuns.map((run) => run.id),
  );
  assert.ok(state.updates.every((update) => update.conclusion === "failure"));
  assert.ok(state.updates.every((update) => update.external_id === `p0g:v1:q:${candidateSha}`));
  assert.ok(state.runs.every((run) => run.conclusion === "failure"));
  assert.ok(state.runs.every((run) => run.external_id === `p0g:v1:q:${candidateSha}`));
});

test("M2: partial duplicate revocation attempts every ID and reports unresolved records", async () => {
  const seed = checksApi();
  await upsertPhase0GateCheck({ ...verifyDecision(7350, 1, "success"), github: seed.github });
  const duplicateRuns = [
    structuredClone(seed.state.runs[0]),
    { ...structuredClone(seed.state.runs[0]), id: seed.state.runs[0].id + 1 },
  ];
  const { github, state } = checksApi(duplicateRuns, {
    updateBehaviors: [{}, { throwBeforeApply: "duplicate quarantine unavailable" }],
    getThrows: true,
  });

  await assert.rejects(
    upsertPhase0GateCheck({ ...verifyDecision(7350, 2, "success"), github }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, new RegExp(`IDs: ${duplicateRuns[1].id}$`));
      return true;
    },
  );
  assert.equal(state.creates.length, 0);
  assert.deepEqual(
    state.updates.map((update) => update.check_run_id),
    duplicateRuns.map((run) => run.id),
  );
  assert.ok(state.updates.every((update) => update.conclusion === "failure"));
  assert.equal(state.runs[0].conclusion, "failure");
  assert.equal(state.runs[0].external_id, `p0g:v1:q:${candidateSha}`);
  assert.equal(state.runs[1].conclusion, "success");
});

test("N: wrong-App checks and user legacy statuses never become authoritative", async () => {
  const wrongApp = {
    id: 91,
    name: PHASE0_GATE_NAME,
    head_sha: candidateSha,
    status: "completed",
    conclusion: "success",
    external_id: "wrong-source",
    app: { id: 999999 },
  };
  const { github, state } = checksApi([wrongApp]);
  const input = verifyDecision(7400, 1, "success");
  input.github = github;
  const result = await upsertPhase0GateCheck(input);

  assert.equal(result.operation, "created");
  assert.notEqual(result.checkRunId, wrongApp.id);
  assert.equal(state.runs.length, 2);
  assert.equal(state.runs.filter((run) => run.app.id === PHASE0_GATE_APP_ID).length, 1);
  assert.equal(state.legacyStatusReads, 0);
});

test("O: malformed provenance and source mismatches revoke prior success", async () => {
  const malformed = {
    id: 92,
    name: PHASE0_GATE_NAME,
    head_sha: candidateSha,
    status: "completed",
    conclusion: "success",
    completed_at: "2026-09-10T12:00:00.000Z",
    external_id: "not-json",
    app: { id: PHASE0_GATE_APP_ID },
  };
  const existing = checksApi([malformed]);
  await assert.rejects(
    upsertPhase0GateCheck({ ...verifyDecision(7500, 1, "failure"), github: existing.github }),
    /provenance/,
  );
  assert.equal(existing.state.updates.length, 1);
  assert.equal(existing.state.runs[0].conclusion, "failure");
  assert.match(existing.state.runs[0].external_id, new RegExp(`^p0g:v1:q:${candidateSha}$`));

  const wrongMutation = checksApi([], { createAppId: 999999 });
  await assert.rejects(
    upsertPhase0GateCheck({ ...verifyDecision(7501, 1, "success"), github: wrongMutation.github }),
    /failed authoritative identity validation/,
  );
  assert.equal(wrongMutation.state.runs[0].conclusion, "failure");
  assert.equal(wrongMutation.state.updates.length, 0);

  const sourceMismatch = checksApi();
  await upsertPhase0GateCheck({
    ...verifyDecision(7502, 1, "success"),
    github: sourceMismatch.github,
  });
  const updatesBeforeMismatch = sourceMismatch.state.updates.length;
  await assert.rejects(
    upsertPhase0GateCheck({
      github: sourceMismatch.github,
      owner: "jefferycook",
      repo: "canadian-wealth-compass",
      candidateSha,
      conclusion: "success",
      detailsUrl: "https://github.com/jefferycook/canadian-wealth-compass/actions/runs/7503",
      title: "Phase 0 infrastructure audit approved",
      summary: "Audited manual decision",
      source: {
        kind: "manual",
        workflowRunId: 7503,
        workflowRunAttempt: 1,
        actor: "jefferycook",
        pullNumber: 12,
        auditedBaseSha,
      },
    }),
    /source kind differs/,
  );
  assert.equal(sourceMismatch.state.updates.length, updatesBeforeMismatch + 1);
  assert.equal(sourceMismatch.state.runs[0].conclusion, "failure");
  assert.match(sourceMismatch.state.runs[0].external_id, new RegExp(`^p0g:v1:q:${candidateSha}$`));
});

test("P: manual exact-SHA decisions use canonical compact provenance", async () => {
  const { github, state } = checksApi();
  const first = manualDecision(7600, 1);
  first.github = github;
  const created = await upsertPhase0GateCheck(first);
  const second = manualDecision(7600, 2);
  second.github = github;
  const updated = await upsertPhase0GateCheck(second);

  assert.equal(updated.checkRunId, created.checkRunId);
  assert.equal(state.runs.length, 1);
  assert.equal(state.creates.length, 1);
  assert.equal(state.updates.length, 4);
  assert.match(
    state.runs[0].external_id,
    new RegExp(`^p0g:v1:m:${candidateSha}:success:7600:2:jefferycook:12:${auditedBaseSha}$`),
  );
  assert.ok(state.runs[0].external_id.length <= 255);
});

test("Q: a stale verifier attempt revokes a canonical success before rejection", async () => {
  const { github, state } = checksApi();
  await upsertPhase0GateCheck({ ...verifyDecision(7700, 2, "success"), github });
  assert.equal(state.runs[0].conclusion, "success");

  await assert.rejects(
    upsertPhase0GateCheck({ ...verifyDecision(7700, 1, "success"), github }),
    /older than canonical attempt 2/,
  );
  assert.equal(state.updates.length, 2);
  assert.equal(state.runs[0].conclusion, "failure");
  assert.match(state.runs[0].external_id, new RegExp(`^p0g:v1:q:${candidateSha}$`));
});

test("R: a different verifier run ID revokes a canonical success before rejection", async () => {
  const { github, state } = checksApi();
  await upsertPhase0GateCheck({ ...verifyDecision(7800, 1, "success"), github });

  await assert.rejects(
    upsertPhase0GateCheck({ ...verifyDecision(7801, 2, "failure"), github }),
    /run id differs/,
  );
  assert.equal(state.updates.length, 2);
  assert.equal(state.runs[0].conclusion, "failure");
  assert.match(state.runs[0].external_id, new RegExp(`^p0g:v1:q:${candidateSha}$`));
});

test("R2: ordinary and manual decisions cannot re-authorize a quarantined SHA", async () => {
  const { github, state } = checksApi();
  await upsertPhase0GateCheck({ ...verifyDecision(7850, 1, "success"), github });
  await assert.rejects(
    upsertPhase0GateCheck({ ...verifyDecision(7851, 1, "failure"), github }),
    /run id differs/,
  );
  const updatesAfterQuarantine = state.updates.length;

  for (const decision of [verifyDecision(7850, 2, "success"), manualDecision(7852, 1)]) {
    await assert.rejects(
      upsertPhase0GateCheck({ ...decision, github }),
      /candidate SHA is quarantined and cannot be re-authorized; move the PR to a fresh head SHA/,
    );
  }

  assert.equal(state.updates.length, updatesAfterQuarantine);
  assert.equal(state.runs[0].conclusion, "failure");
  assert.equal(state.runs[0].external_id, `p0g:v1:q:${candidateSha}`);
  assert.equal(state.updates.filter((update) => update.conclusion === "success").length, 1);
  assert.equal(state.updates.at(-1).conclusion, "failure");
});

test("S: an identical verifier decision is idempotent and cannot reverse conclusion", async () => {
  const { github, state } = checksApi();
  const decision = verifyDecision(7900, 1, "success");
  const created = await upsertPhase0GateCheck({ ...decision, github });
  const repeated = await upsertPhase0GateCheck({ ...decision, github });

  assert.equal(repeated.operation, "updated");
  assert.equal(repeated.checkRunId, created.checkRunId);
  assert.equal(state.creates.length, 1);
  assert.equal(state.updates.length, 4);
  assert.equal(state.runs[0].conclusion, "success");

  await assert.rejects(
    upsertPhase0GateCheck({ ...verifyDecision(7900, 1, "failure"), github }),
    /identical verifier run and attempt conflicts with canonical provenance or conclusion/,
  );
  assert.equal(state.updates.length, 5);
  assert.equal(state.runs[0].conclusion, "failure");
  assert.match(state.runs[0].external_id, new RegExp(`^p0g:v1:q:${candidateSha}$`));
});

test("T: manual updates cannot replace a different actor, pull, or audited base", async () => {
  const variants = [
    { actor: "another-auditor" },
    { pullNumber: 13 },
    { auditedBaseSha: "3333333333333333333333333333333333333333" },
  ];

  for (const variant of variants) {
    const { github, state } = checksApi();
    await upsertPhase0GateCheck({ ...manualDecision(8000, 1), github });
    const incoming = manualDecision(8001, 1);
    incoming.source = { ...incoming.source, ...variant };

    await assert.rejects(
      upsertPhase0GateCheck({ ...incoming, github }),
      /(invalid manual approving actor|manual (pull number|audited base) differs)/,
    );
    assert.equal(state.updates.length, 2);
    assert.equal(state.runs[0].conclusion, "failure");
    assert.match(state.runs[0].external_id, new RegExp(`^p0g:v1:q:${candidateSha}$`));
  }
});

test("U: malformed safe-stage completion responses cannot leave a successful gate", async () => {
  for (const options of [
    { omitCreateCompletedAt: true },
    { createCompletedAt: "not-an-iso-timestamp" },
  ]) {
    const { github, state } = checksApi([], options);
    await assert.rejects(
      upsertPhase0GateCheck({ ...verifyDecision(8100, 1, "failure"), github }),
      /completion timestamp validation/,
    );
    assertWholeSecondTimestamp(state.creates[0].completed_at);
    assert.equal(state.creates[0].conclusion, "failure");
    assert.equal(state.runs[0].conclusion, "failure");
    assert.equal(state.updates.length, 0);
  }

  for (const behavior of [{ omitCompletedAt: true }, { completedAt: "not-an-iso-timestamp" }]) {
    const { github, state } = checksApi([], { updateBehaviors: [behavior] });
    await upsertPhase0GateCheck({ ...verifyDecision(8200, 1, "failure"), github });
    await assert.rejects(
      upsertPhase0GateCheck({ ...verifyDecision(8200, 2, "failure"), github }),
      /completion timestamp validation/,
    );
    assertWholeSecondTimestamp(state.updates[0].completed_at);
    assert.equal(state.updates[0].conclusion, "failure");
    assert.equal(state.runs[0].conclusion, "failure");
    assert.equal(state.updates.length, 2);
    assert.equal(state.updates[1].conclusion, "failure");
  }
});

test("V: harmless final-response timestamp normalization preserves successful authorization", async () => {
  const { github, state } = checksApi([], {
    updateBehaviors: [{ completedAt: (value) => new Date(value).toISOString() }],
  });
  const result = await upsertPhase0GateCheck({
    ...verifyDecision(8300, 1, "success"),
    github,
  });

  assert.equal(result.operation, "created");
  assert.equal(state.runs[0].conclusion, "success");
  assert.match(state.runs[0].completed_at, /\.000Z$/);
  assert.equal(state.gets.length, 0);
});

test("W: an applied-but-throwing final PATCH recovers by exact-ID refetch", async () => {
  const { github, state } = checksApi([], {
    updateBehaviors: [{ throwAfterApply: "ambiguous final PATCH" }],
  });
  const result = await upsertPhase0GateCheck({
    ...verifyDecision(8400, 1, "success"),
    github,
  });

  assert.equal(result.operation, "created");
  assert.equal(result.checkRunId, state.runs[0].id);
  assert.equal(state.runs[0].conclusion, "success");
  assert.equal(state.updates.length, 1);
  assert.deepEqual(state.gets, [
    {
      owner: "jefferycook",
      repo: "canadian-wealth-compass",
      check_run_id: result.checkRunId,
    },
  ]);
});

test("X: a final PATCH that was not applied restores and confirms failure before throwing", async () => {
  const { github, state } = checksApi([], {
    updateBehaviors: [{ throwBeforeApply: "final PATCH unavailable" }],
  });

  await assert.rejects(
    upsertPhase0GateCheck({ ...verifyDecision(8500, 1, "success"), github }),
    /final PATCH unavailable/,
  );
  assert.equal(state.runs[0].conclusion, "failure");
  assert.match(state.runs[0].external_id, /:failure:1234:8500:1$/);
  assert.deepEqual(
    state.updates.map((update) => update.conclusion),
    ["success"],
  );
  assert.equal(state.gets.length, 1);
});

test("Y: higher-attempt success validates its safe failure update before authorization", async () => {
  const { github, state } = checksApi([], {
    updateBehaviors: [{ completedAt: "not-an-iso-timestamp" }],
  });
  await upsertPhase0GateCheck({ ...verifyDecision(8600, 1, "failure"), github });

  await assert.rejects(
    upsertPhase0GateCheck({ ...verifyDecision(8600, 2, "success"), github }),
    /completion timestamp validation/,
  );
  assert.equal(state.runs[0].conclusion, "failure");
  assert.match(state.runs[0].external_id, /:failure:1234:8600:2$/);
  assert.equal(state.updates.length, 2);
  assert.equal(state.updates[0].conclusion, "failure");
  assert.equal(state.updates[1].conclusion, "failure");
});

test("Z: a pre-success transport failure cannot leave an older successful gate in place", async () => {
  const { github, state } = checksApi([], {
    updateBehaviors: [{}, { throwBeforeApply: "safe-stage PATCH unavailable" }, {}],
  });
  await upsertPhase0GateCheck({ ...verifyDecision(8700, 1, "success"), github });

  await assert.rejects(
    upsertPhase0GateCheck({ ...verifyDecision(8700, 2, "success"), github }),
    /safe-stage PATCH unavailable/,
  );
  assert.equal(state.runs[0].conclusion, "failure");
  assert.match(state.runs[0].external_id, new RegExp(`^p0g:v1:q:${candidateSha}$`));
  assert.deepEqual(
    state.updates.map((update) => update.conclusion),
    ["success", "failure", "failure"],
  );
});

test("AA: trust workflow loads the helper only from an immutable trusted revision", () => {
  const workflow = readFileSync(
    resolve(scripts, "../../.github/workflows/phase0-trust.yml"),
    "utf8",
  );
  const occurrences = (pattern) => workflow.match(pattern)?.length ?? 0;

  assert.equal(occurrences(/actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683/g), 2);
  assert.equal(occurrences(/ref: \$\{\{ github\.sha \}\}/g), 2);
  assert.equal(occurrences(/persist-credentials: false/g), 2);
  assert.equal(occurrences(/TRUSTED_WORKFLOW_SHA: \$\{\{ github\.sha \}\}/g), 2);
  assert.equal(occurrences(/process\.env\.TRUSTED_WORKFLOW_SHA !== liveMain/g), 2);
  assert.equal(occurrences(/git -C phase0-trusted-source rev-parse HEAD/g), 2);
  assert.equal(
    occurrences(
      /TRUSTED_HELPER_PATH: \$\{\{ github\.workspace \}\}\/phase0-trusted-source\/scripts\/audit\/phase0-gate-check\.mjs/g,
    ),
    2,
  );
  assert.equal(occurrences(/permission-checks: write/g), 2);
  assert.equal(occurrences(/upsertPhase0GateCheck/g), 4);
  assert.match(
    workflow,
    /group: phase0-gate-\$\{\{ github\.event\.workflow_run\.head_sha \|\| inputs\.audited_head_sha \}\}/,
  );
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ inputs\.audited_head_sha \}\}/);
  assert.doesNotMatch(workflow, /createCommitStatus/);
  assert.doesNotMatch(workflow, /permission-statuses:/);
  assert.match(
    workflow,
    /Infrastructure-classified candidate: automatic path intentionally posts no phase0-gate status/,
  );
});

assert.ok(
  existsSync(bundleScript) && existsSync(verifyCommitScript) && existsSync(verifyMergeScript),
);
