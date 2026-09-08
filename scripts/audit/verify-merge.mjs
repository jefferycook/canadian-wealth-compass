#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function die(message) {
  process.stderr.write(`FAIL: ${message}\n`);
  process.exit(1);
}

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value || !["--merge", "--base", "--head", "--live-main", "--remote"].includes(key)) {
      die(
        "usage: --merge <SHA/ref> --base <SHA> --head <SHA> [--live-main <ref>] [--remote <remote>]",
      );
    }
    out[key.slice(2)] = value;
  }
  if (!out.merge || !out.base || !out.head) die("--merge, --base and --head are required");
  if (!/^[0-9a-f]{40}$/.test(out.base) || !/^[0-9a-f]{40}$/.test(out.head)) {
    die("--base and --head must be exact lowercase 40-hex commit IDs");
  }
  if (out.remote && !/^[A-Za-z0-9._-]+$/.test(out.remote)) die("invalid remote name");
  return out;
}

function git(arguments_, allowFailure = false) {
  const result = spawnSync("git", arguments_, { encoding: "utf8", shell: false });
  if (!allowFailure && result.status !== 0)
    die(`git ${arguments_.join(" ")} failed: ${result.stderr.trim()}`);
  return result;
}

const expected = argsOf(process.argv.slice(2));
if (expected.remote) {
  git([
    "fetch",
    "--no-tags",
    expected.remote,
    `+refs/heads/main:refs/remotes/${expected.remote}/main`,
  ]);
}
const merge = git(["rev-parse", `${expected.merge}^{commit}`]).stdout.trim();
const base = git(["rev-parse", `${expected.base}^{commit}`]).stdout.trim();
const head = git(["rev-parse", `${expected.head}^{commit}`]).stdout.trim();
const parents = git(["rev-list", "--parents", "-n", "1", merge])
  .stdout.trim()
  .split(/\s+/)
  .slice(1);
if (parents.length !== 2) die(`merge must have exactly two parents; found ${parents.length}`);
if (parents[0] !== base) die(`first parent ${parents[0]} does not equal base ${base}`);
if (parents[1] !== head) die(`second parent ${parents[1]} does not equal head ${head}`);
if (git(["merge-base", "--is-ancestor", head, merge], true).status !== 0)
  die("audited head is not an ancestor of merge");
const mergeTree = git(["rev-parse", `${merge}^{tree}`]).stdout.trim();
const headTree = git(["rev-parse", `${head}^{tree}`]).stdout.trim();
if (mergeTree !== headTree) die(`merge tree ${mergeTree} does not equal head tree ${headTree}`);
const count = Number(git(["rev-list", "--count", `${base}..${merge}`]).stdout.trim());
if (count !== 2) die(`expected base..merge count 2; found ${count}`);
if (expected["live-main"]) {
  const live = git(["rev-parse", `${expected["live-main"]}^{commit}`]).stdout.trim();
  if (live !== merge) die(`live main ${live} does not equal merge ${merge}`);
}
if (expected.remote) {
  const remoteMain = git(["rev-parse", `${expected.remote}/main^{commit}`]).stdout.trim();
  if (remoteMain !== merge)
    die(`${expected.remote}/main ${remoteMain} does not equal merge ${merge}`);
}

process.stdout.write(
  `merge: ${merge}\nparent 1: ${parents[0]}\nparent 2: ${parents[1]}\nmerge tree: ${mergeTree}\nhead tree: ${headTree}\nbase..merge count: ${count}\nPASS\n`,
);
