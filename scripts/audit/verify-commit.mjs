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
    if (!value || !["--base", "--tree"].includes(key)) die("usage: --base <SHA> --tree <tree SHA>");
    out[key.slice(2)] = value;
  }
  if (!out.base || !out.tree) die("--base and --tree are required");
  if (!/^[0-9a-f]{40}$/.test(out.base) || !/^[0-9a-f]{40}$/.test(out.tree)) {
    die("--base and --tree must be exact lowercase 40-hex object IDs");
  }
  return out;
}

function git(arguments_, allowFailure = false) {
  const result = spawnSync("git", arguments_, { encoding: "utf8", shell: false });
  if (!allowFailure && result.status !== 0)
    die(`git ${arguments_.join(" ")} failed: ${result.stderr.trim()}`);
  return result;
}

const expected = argsOf(process.argv.slice(2));
const head = git(["rev-parse", "HEAD"]).stdout.trim();
const parents = git(["rev-list", "--parents", "-n", "1", "HEAD"])
  .stdout.trim()
  .split(/\s+/)
  .slice(1);
if (parents.length !== 1) die(`HEAD must have exactly one parent; found ${parents.length}`);
const parent = parents[0];
if (parent !== expected.base) die(`parent ${parent} does not equal base ${expected.base}`);
const actualTree = git(["rev-parse", "HEAD^{tree}"]).stdout.trim();
if (actualTree !== expected.tree)
  die(`actual tree ${actualTree} does not equal reviewed tree ${expected.tree}`);
const count = Number(git(["rev-list", "--count", `${expected.base}..HEAD`]).stdout.trim());
if (count !== 1) die(`expected one commit from base to HEAD; found ${count}`);
if (git(["status", "--porcelain"]).stdout !== "") die("working tree is not clean");
if (git(["diff", "--cached", "--quiet"], true).status !== 0) die("index is not empty");

const boundary = git(["diff-tree", "--no-commit-id", "--name-status", "-r", "HEAD"]).stdout;
process.stdout.write(
  `HEAD: ${head}\nparent: ${parent}\nactual tree: ${actualTree}\nreviewed tree: ${expected.tree}\nchanged-file boundary:\n${boundary}PASS\n`,
);
