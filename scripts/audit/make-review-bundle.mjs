#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value || !["--base", "--out", "--verification-log"].includes(key)) {
      fail(
        `Usage: make-review-bundle.mjs --base <40-hex SHA> --out <outside directory> [--verification-log <path>]`,
      );
    }
    result[key.slice(2)] = value;
  }
  if (!/^[0-9a-f]{40}$/.test(result.base ?? "") || !result.out) {
    fail("--base must be an exact lowercase 40-hex SHA and --out is required");
  }
  return result;
}

const worktree = resolve(process.cwd());

function git(args, options = {}) {
  const env = { ...process.env, ...(options.env ?? {}) };
  const result = spawnSync("git", args, {
    cwd: worktree,
    env,
    encoding: options.buffer ? undefined : "utf8",
    shell: false,
  });
  if (!options.allowFailure && result.status !== 0) {
    fail(`git ${args.join(" ")} failed (${result.status}): ${String(result.stderr).trim()}`);
  }
  return result;
}

function sha256(path) {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertEmptyRealIndex() {
  const quiet = git(["diff", "--cached", "--quiet"], { allowFailure: true });
  const names = git(["diff", "--cached", "--name-only"]);
  if (quiet.status !== 0 || names.stdout.trim() !== "") {
    fail("real index is not empty");
  }
}

const args = parseArgs(process.argv.slice(2));
const baseCommit = git(["rev-parse", "--verify", `${args.base}^{commit}`]).stdout.trim();
if (baseCommit !== args.base) fail("supplied base did not resolve to the exact commit");

const headShaBefore = git(["rev-parse", "HEAD"]).stdout.trim();
if (headShaBefore !== args.base)
  fail(`HEAD ${headShaBefore} does not equal supplied base ${args.base}`);
assertEmptyRealIndex();

const repoRoot = resolve(git(["rev-parse", "--show-toplevel"]).stdout.trim());
const outDir = resolve(args.out);
const outRelative = relative(repoRoot, outDir);
const outputIsOutside =
  outRelative === ".." || outRelative.startsWith(`..${sep}`) || isAbsolute(outRelative);
if (!outputIsOutside) {
  fail("--out must resolve outside the repository worktree");
}
if (existsSync(outDir)) fail("--out must not already exist");

const statusShort = git(["status", "--short"]).stdout;
const indexGitPath = git(["rev-parse", "--git-path", "index"]).stdout.trim();
const realIndexPath = resolve(worktree, indexGitPath);
const realIndexSha256Before = sha256(realIndexPath);

const tempDirectory = mkdtempSync(resolve(tmpdir(), "phase0-review-index-"));
const tempIndex = resolve(tempDirectory, "index");
const tempEnv = { GIT_INDEX_FILE: tempIndex };

try {
  // This is the one and only mutation sequence used to build the snapshot.
  git(["read-tree", args.base], { env: tempEnv });
  git(["add", "-A"], { env: tempEnv });

  const diffResult = git(["diff", "--cached", "--binary", "--full-index", args.base], {
    env: tempEnv,
    buffer: true,
  });
  const reviewedTreeSha = git(["write-tree"], { env: tempEnv }).stdout.trim();
  const nameStatus = git(["diff", "--cached", "--name-status", args.base], { env: tempEnv }).stdout;
  const diffStat = git(["diff", "--cached", "--stat", args.base], {
    env: tempEnv,
  }).stdout;
  const diffCheck = git(["diff", "--cached", "--check", args.base], {
    env: tempEnv,
    allowFailure: true,
  });

  mkdirSync(outDir);
  const reviewDiffPath = resolve(outDir, "review.diff");
  writeFileSync(reviewDiffPath, diffResult.stdout);

  if (args["verification-log"]) {
    copyFileSync(resolve(args["verification-log"]), resolve(outDir, "verification.log"));
  }

  assertEmptyRealIndex();
  const realIndexSha256After = sha256(realIndexPath);
  const realIndexUnchanged = realIndexSha256Before === realIndexSha256After;
  if (!realIndexUnchanged) fail("real index bytes changed while creating the review bundle");

  const manifest = {
    recordedBaseSha: args.base,
    headShaBefore,
    reviewedTreeSha,
    diffSha256: sha256(reviewDiffPath),
    realIndexSha256Before,
    realIndexSha256After,
    realIndexUnchanged,
    realIndexEmpty: true,
    changedFiles: nameStatus.trim() ? nameStatus.trimEnd().split(/\r?\n/) : [],
    nameStatus,
    diffStat,
    diffCheckExitCode: diffCheck.status,
    diffCheckOutput: `${diffCheck.stdout}${diffCheck.stderr}`,
    gitStatusShort: statusShort,
    nodeVersion: process.version,
    platform: `${process.platform} ${process.arch}`,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(resolve(outDir, "review-manifest.json"), manifestText);

  const verificationText = existsSync(resolve(outDir, "verification.log"))
    ? readFileSync(resolve(outDir, "verification.log"), "utf8")
    : "No verification log supplied.\n";
  writeFileSync(
    resolve(outDir, "review-bundle.txt"),
    `${manifestText}\n===== VERIFICATION LOG =====\n${verificationText}\n===== FULL BINARY DIFF =====\n${diffResult.stdout.toString("utf8")}`,
  );

  process.stdout.write(`${manifestText}`);
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
