import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const bundleScript = join(scripts, "make-review-bundle.mjs");
const verifyCommitScript = join(scripts, "verify-commit.mjs");
const verifyMergeScript = join(scripts, "verify-merge.mjs");

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

assert.ok(
  existsSync(bundleScript) && existsSync(verifyCommitScript) && existsSync(verifyMergeScript),
);
