import { createHash } from "node:crypto";
import {
  PHASE0_GATE_APP_ID,
  PHASE0_GATE_NAME,
  authorizeManualGate,
  listAuthoritativeGateChecks,
  parsePhase0Gate,
  terminalizeAuthorizedGate,
  terminalizeDuplicateGateChecks,
} from "./phase0-gate-check.mjs";

export const MERGER_APP_ID = 4915565;
export const MERGER_APP_BOT_LOGIN = "cwc-phase0-merger[bot]";
export const RULESET_A_ID = 22812673;
export const RULESET_A_NAME = "Phase 0 main protection";
export const RULESET_B_NAME = "Phase 0 main update restriction";
const SHA = /^[0-9a-f]{40}$/;
const sha = (value, name) => {
  if (!SHA.test(value ?? "")) throw new Error(`invalid ${name}`);
  return value;
};
const normalizeJson = (value) =>
  Array.isArray(value)
    ? value.map(normalizeJson)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, normalizeJson(value[key])]),
        )
      : value;
const canonicalJson = (value) => JSON.stringify(normalizeJson(value));
const jsonHash = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const repoRequest = (github, route, owner, repo, rest = {}) =>
  github.request(route, { owner, repo, ...rest });
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function validateDispatch(input) {
  if (
    input.ref !== "refs/heads/main" ||
    input.actor !== "jefferycook" ||
    input.approvalPhrase !== "EXACT-SHA-AUDIT-PASS"
  )
    throw new Error("P1 dispatch authority mismatch");
  if (!/^[1-9][0-9]*$/.test(input.prNumber ?? "") || !Number.isSafeInteger(Number(input.prNumber)))
    throw new Error("P1 invalid PR number");
  return {
    prNumber: Number(input.prNumber),
    head: sha(input.head, "audited head SHA"),
    base: sha(input.base, "audited base SHA"),
    tree: sha(input.tree, "audited tree SHA"),
  };
}

export function validateLivePull(pull, { owner, repo, head, base }) {
  if (
    pull?.state !== "open" ||
    pull.draft !== false ||
    pull.merged !== false ||
    pull.base?.ref !== "main" ||
    pull.base?.sha !== base ||
    pull.head?.repo?.full_name !== `${owner}/${repo}` ||
    pull.head?.sha !== head ||
    !Number.isSafeInteger(pull.changed_files) ||
    pull.changed_files <= 0 ||
    pull.changed_files > 3000
  )
    throw new Error("P4 pull request identity mismatch");
  return pull;
}

export function validateFileEnumeration(files, expected) {
  if (
    !Number.isSafeInteger(expected) ||
    expected <= 0 ||
    expected > 3000 ||
    !Array.isArray(files) ||
    files.length !== expected
  )
    throw new Error("P4 incomplete or insane file enumeration");
  return files;
}

async function allFiles(github, owner, repo, prNumber, expected) {
  const files = await github.paginate(github.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });
  return validateFileEnumeration(files, expected);
}

export function infrastructurePath(path) {
  if (!path) return false;
  const exact = new Set([
    "src/lib/planning/phase0-freeze.test.ts",
    "src/lib/planning/phase0-freeze.fixtures.ts",
    "docs/audit/exact-sha-audit-template.md",
    "bun.lock",
    "bunfig.toml",
    "package.json",
    ".node-version",
    ".npmrc",
    ".env",
  ]);
  return (
    path.startsWith(".github/") ||
    path.startsWith("scripts/audit/") ||
    exact.has(path) ||
    path.startsWith(".env.") ||
    /^(vite|vitest)(?:\.workspace)?\.config\./.test(path) ||
    /^vitest\..+\.(?:ts|js|mjs|cjs|mts|cts)$/.test(path) ||
    /^tsconfig.*\.json$/.test(path) ||
    (!path.includes("/") && /\.(?:json|toml|ya?ml|[cm]?[jt]s)$/.test(path))
  );
}

function literalMainOnly(rule) {
  const refs = rule?.conditions?.ref_name;
  return (
    Array.isArray(refs?.include) &&
    refs.include.length === 1 &&
    refs.include[0] === "refs/heads/main" &&
    Array.isArray(refs.exclude) &&
    refs.exclude.length === 0
  );
}

const expectedPullRequestParameters = {
  required_approving_review_count: 0,
  dismiss_stale_reviews_on_push: false,
  required_reviewers: [],
  require_code_owner_review: false,
  require_last_push_approval: false,
  required_review_thread_resolution: false,
  require_extra_approval_for_unattributed_changes: false,
  allowed_merge_methods: ["merge"],
};
const expectedStatusParameters = {
  strict_required_status_checks_policy: true,
  do_not_enforce_on_create: false,
  required_status_checks: [{ context: PHASE0_GATE_NAME, integration_id: PHASE0_GATE_APP_ID }],
};

export function validateRulesetA(rule) {
  const rules = rule?.rules ?? [];
  const byType = new Map();
  for (const item of rules) {
    if (byType.has(item.type)) throw new Error("P12 Ruleset A drift");
    byType.set(item.type, item);
  }
  const exactTypes = ["deletion", "non_fast_forward", "pull_request", "required_status_checks"];
  if (
    rule?.id !== RULESET_A_ID ||
    rule.name !== RULESET_A_NAME ||
    rule.target !== "branch" ||
    rule.enforcement !== "active" ||
    !literalMainOnly(rule) ||
    !Array.isArray(rule.bypass_actors) ||
    rule.bypass_actors.length !== 0 ||
    rules.length !== exactTypes.length ||
    exactTypes.some((type) => !byType.has(type)) ||
    Object.hasOwn(byType.get("deletion"), "parameters") ||
    Object.hasOwn(byType.get("non_fast_forward"), "parameters") ||
    canonicalJson(byType.get("pull_request")?.parameters) !==
      canonicalJson(expectedPullRequestParameters) ||
    canonicalJson(byType.get("required_status_checks")?.parameters) !==
      canonicalJson(expectedStatusParameters)
  )
    throw new Error("P12 Ruleset A drift");
  return true;
}

export function isRulesetB(rule) {
  const bypass = rule?.bypass_actors ?? [];
  const rules = rule?.rules ?? [];
  return (
    rule?.name === RULESET_B_NAME &&
    rule.target === "branch" &&
    rule.enforcement === "active" &&
    literalMainOnly(rule) &&
    rules.length === 1 &&
    rules[0].type === "update" &&
    bypass.length === 1 &&
    bypass[0].actor_type === "Integration" &&
    bypass[0].actor_id === MERGER_APP_ID &&
    bypass[0].bypass_mode === "pull_request"
  );
}

export async function validateRulesets(github, owner, repo) {
  const applied = (
    await repoRequest(github, "GET /repos/{owner}/{repo}/rules/branches/main", owner, repo)
  ).data;
  const details = [];
  const ids = [...new Set(applied.map((item) => item.ruleset_id ?? item.id))];
  for (const rulesetId of ids)
    details.push(
      (
        await repoRequest(github, "GET /repos/{owner}/{repo}/rulesets/{ruleset_id}", owner, repo, {
          ruleset_id: rulesetId,
        })
      ).data,
    );
  const a = details.find((rule) => rule.id === RULESET_A_ID);
  validateRulesetA(a);
  const matches = details.filter(isRulesetB);
  if (matches.length !== 1)
    throw new Error(`P12 expected exactly one normative Ruleset B; found ${matches.length}`);
  return {
    a: { id: a.id, hash: jsonHash(a), json: a },
    b: { id: matches[0].id, hash: jsonHash(matches[0]), json: matches[0] },
  };
}

async function poisonSignals(github, owner, repo, head) {
  const statuses = await github.paginate(github.rest.repos.listCommitStatusesForRef, {
    owner,
    repo,
    ref: head,
    per_page: 100,
  });
  if (statuses.some((status) => status.context === PHASE0_GATE_NAME))
    throw new Error("P10 legacy phase0-gate status poison");
  const all = await github.paginate(github.rest.checks.listForRef, {
    owner,
    repo,
    ref: head,
    check_name: PHASE0_GATE_NAME,
    filter: "all",
    per_page: 100,
  });
  if (
    all.some(
      (check) =>
        check.name === PHASE0_GATE_NAME &&
        check.head_sha === head &&
        check.app?.id !== PHASE0_GATE_APP_ID,
    )
  )
    throw new Error("P11 wrong-App phase0-gate poison");
}

async function validateVerifier(github, owner, repo, gate, head) {
  const id = gate.kind === "m" ? gate.verifierRunId : gate.runId;
  const attempt = gate.kind === "m" ? gate.verifierAttempt : gate.attempt;
  const workflow = (
    await repoRequest(
      github,
      "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}",
      owner,
      repo,
      { workflow_id: "phase0-verify.yml" },
    )
  ).data;
  if (!Number.isSafeInteger(workflow?.id) || workflow.id < 1)
    throw new Error("P9 trusted verifier workflow identity unavailable");
  const run = (await github.rest.actions.getWorkflowRun({ owner, repo, run_id: id })).data;
  const path = String(run.path ?? "").replace(/@refs\/[^@]+$/, "");
  if (
    run.id !== id ||
    run.workflow_id !== workflow.id ||
    run.run_attempt !== attempt ||
    run.head_sha !== head ||
    run.conclusion !== "success" ||
    run.event !== "pull_request" ||
    path !== ".github/workflows/phase0-verify.yml" ||
    run.head_repository?.full_name !== `${owner}/${repo}`
  )
    throw new Error("P9 verifier provenance invalid");
}

export async function prepareBeforeMerge({
  github,
  owner,
  repo,
  dispatch,
  trustedSha,
  dispatchRunId,
  dispatchAttempt,
  helperSha,
}) {
  const audit = validateDispatch(dispatch);
  if (trustedSha !== audit.base || helperSha !== trustedSha)
    throw new Error("P2 trusted checkout is not live main");
  const live = (await github.rest.git.getRef({ owner, repo, ref: "heads/main" })).data.object.sha;
  if (live !== audit.base) throw new Error("P3 live main moved");
  const pull = (await github.rest.pulls.get({ owner, repo, pull_number: audit.prNumber })).data;
  validateLivePull(pull, { owner, repo, head: audit.head, base: audit.base });
  const commit = (await github.rest.repos.getCommit({ owner, repo, ref: audit.head })).data;
  if (
    commit.parents?.length !== 1 ||
    commit.parents[0].sha !== audit.base ||
    commit.commit?.tree?.sha !== audit.tree
  )
    throw new Error("P5 candidate parent/tree mismatch");
  const compare = (
    await github.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${audit.base}...${audit.head}`,
    })
  ).data;
  if (
    compare.merge_base_commit?.sha !== audit.base ||
    compare.ahead_by !== 1 ||
    compare.behind_by !== 0 ||
    compare.total_commits !== 1
  )
    throw new Error("P5 candidate graph mismatch");
  const files = await allFiles(github, owner, repo, audit.prNumber, pull.changed_files);
  const accepted = new Set(["added", "modified", "removed", "renamed", "copied", "changed"]);
  const infrastructure = files.some(
    (file) =>
      !accepted.has(file.status) ||
      infrastructurePath(file.filename) ||
      infrastructurePath(file.previous_filename),
  );
  await poisonSignals(github, owner, repo, audit.head);
  const gates = await listAuthoritativeGateChecks(github, owner, repo, audit.head);
  if (gates.length === 0) throw new Error("P7 exactly one canonical Gate required");
  const common = {
    audit,
    infrastructure,
    dispatchIdentity: { runId: dispatchRunId, attempt: dispatchAttempt, actor: dispatch.actor },
    detailsUrl: `https://github.com/${owner}/${repo}/actions/runs/${dispatchRunId}`,
  };
  if (gates.length > 1) return { ...common, duplicateGates: gates, requiresGateToken: true };
  const canonicalGate = gates[0];
  const gate = parsePhase0Gate(canonicalGate, audit.head);
  if (gate.pr !== audit.prNumber || gate.base !== audit.base || gate.state === "Q")
    throw new Error("P8 Gate audit identity mismatch");
  if (infrastructure) {
    if (!["A-WAIT", "M-SAFE", "M-SUCC"].includes(gate.state))
      throw new Error("P9 infrastructure Gate state invalid");
  } else if (gate.state !== "V-SUCC") throw new Error("P9 ordinary candidate lacks V-SUCC");
  await validateVerifier(github, owner, repo, gate, audit.head);
  return { ...common, gateRun: canonicalGate, gate, requiresGateToken: infrastructure };
}

export async function doubleRead({ github, owner, repo, validated, trustedSha }) {
  const { audit } = validated;
  const main = (await github.rest.git.getRef({ owner, repo, ref: "heads/main" })).data.object.sha;
  const pull = (await github.rest.pulls.get({ owner, repo, pull_number: audit.prNumber })).data;
  const tree = (await github.rest.repos.getCommit({ owner, repo, ref: audit.head })).data.commit
    ?.tree?.sha;
  const gates = await listAuthoritativeGateChecks(github, owner, repo, audit.head);
  const gate = gates[0];
  if (
    main !== audit.base ||
    trustedSha !== audit.base ||
    pull.state !== "open" ||
    pull.draft !== false ||
    pull.merged !== false ||
    pull.head?.sha !== audit.head ||
    pull.head?.repo?.full_name !== `${owner}/${repo}` ||
    pull.base?.ref !== "main" ||
    pull.base?.sha !== audit.base ||
    tree !== audit.tree ||
    gates.length !== 1 ||
    gate.id !== validated.gateId ||
    gate.external_id !== validated.gateExternalId ||
    gate.completed_at !== validated.gateCompletedAt ||
    gate.conclusion !== "success"
  )
    throw new Error("P13 final double-read changed");
  return validated;
}

export async function finalizeBeforeMerge({
  github,
  gateGithub,
  owner,
  repo,
  prepared,
  trustedSha,
}) {
  if (prepared.duplicateGates) {
    if (!gateGithub) throw new Error("P7 Gate token required for duplicate terminalization");
    await terminalizeDuplicateGateChecks({
      github: gateGithub,
      owner,
      repo,
      candidateSha: prepared.audit.head,
      runs: prepared.duplicateGates,
      detailsUrl: prepared.detailsUrl,
    });
  }
  let canonicalGate = prepared.gateRun;
  let gate = prepared.gate;
  let manualAuthorized = false;
  let cleanupGateId;
  let cleanupExternalId;
  if (prepared.infrastructure) {
    if (!gateGithub) throw new Error("P9 Gate token required for KC-3");
    const authorization = await authorizeManualGate({
      github: gateGithub,
      owner,
      repo,
      candidateSha: prepared.audit.head,
      detailsUrl: prepared.detailsUrl,
      source: {
        dispatchRunId: prepared.dispatchIdentity.runId,
        dispatchAttempt: prepared.dispatchIdentity.attempt,
        actor: prepared.dispatchIdentity.actor,
        pullNumber: prepared.audit.prNumber,
        baseSha: prepared.audit.base,
      },
    });
    manualAuthorized = true;
    cleanupGateId = authorization.checkRunId;
    cleanupExternalId = authorization.externalId;
  }
  try {
    if (prepared.infrastructure) {
      const refreshed = await listAuthoritativeGateChecks(github, owner, repo, prepared.audit.head);
      if (refreshed.length !== 1) throw new Error("P9 Gate changed during KC-3");
      canonicalGate = refreshed[0];
      gate = parsePhase0Gate(canonicalGate, prepared.audit.head);
      if (
        gate.state !== "M-SUCC" ||
        canonicalGate.id !== cleanupGateId ||
        gate.externalId !== cleanupExternalId
      )
        throw new Error("P9 KC-3 did not establish the exact M-SUCC");
    }
    const rulesets = await validateRulesets(github, owner, repo);
    const validated = {
      audit: prepared.audit,
      infrastructure: prepared.infrastructure,
      dispatchIdentity: prepared.dispatchIdentity,
      gateId: canonicalGate.id,
      gateExternalId: gate.externalId,
      gateCompletedAt: canonicalGate.completed_at,
      rulesets,
    };
    await doubleRead({ github, owner, repo, validated, trustedSha });
    return validated;
  } catch (error) {
    if (!manualAuthorized) throw error;
    try {
      await terminalizeAuthorizedGate({
        github: gateGithub,
        owner,
        repo,
        candidateSha: prepared.audit.head,
        checkRunId: cleanupGateId,
        expectedExternalId: cleanupExternalId,
        detailsUrl: prepared.detailsUrl,
        reason: String(error?.message ?? error),
      });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "pre-P14 validation failed and M-SUCC cleanup could not be proven",
      );
    }
    throw error;
  }
}

export async function validateBeforeMerge(args) {
  const prepared = await prepareBeforeMerge(args);
  return finalizeBeforeMerge({
    github: args.github,
    gateGithub: args.gateGithub,
    owner: args.owner,
    repo: args.repo,
    prepared,
    trustedSha: args.trustedSha,
  });
}

const statusOf = (error) => error?.status ?? error?.response?.status;
const definitiveHttpFailure = (error) => {
  const status = Number(statusOf(error));
  return Number.isInteger(status) && status >= 400 && status <= 599;
};
const endpointUnavailable = (error) => [403, 404, 410, 501].includes(Number(statusOf(error)));

async function readRuleSuiteEvidence({ github, owner, repo, mergeSha, attempts, delayMs }) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response;
    try {
      response = await repoRequest(
        github,
        "GET /repos/{owner}/{repo}/rulesets/rule-suites",
        owner,
        repo,
        { ref: "refs/heads/main", time_period: "hour", per_page: 100 },
      );
    } catch (error) {
      if (endpointUnavailable(error))
        return {
          available: false,
          reason: `endpoint unavailable: ${String(error?.message ?? error)}`,
        };
      throw error;
    }
    const suite = (response.data ?? []).find((item) => item.head_sha === mergeSha);
    if (suite) {
      if (!["pass", "bypass"].includes(suite.result))
        throw new Error("I6 exact rule suite result is not pass/bypass");
      if (suite.actor?.login !== MERGER_APP_BOT_LOGIN)
        throw new Error("I6 exact rule suite actor is not the Merger App");
      const detail = await repoRequest(
        github,
        "GET /repos/{owner}/{repo}/rulesets/rule-suites/{rule_suite_id}",
        owner,
        repo,
        { rule_suite_id: suite.id },
      );
      return {
        available: true,
        id: suite.id,
        result: suite.result,
        actor: suite.actor.login,
        detail: detail.data,
      };
    }
    if (attempt < attempts && delayMs > 0) await sleep(delayMs);
  }
  throw new Error(`I6 no exact rule suite found for merge ${mergeSha}`);
}

export async function mergeOnce({
  mergerGithub,
  readGithub,
  owner,
  repo,
  validated,
  confirmationDelayMs = 5000,
  ruleSuiteAttempts = 3,
  ruleSuiteDelayMs = 5000,
}) {
  const { audit } = validated;
  const payload = {
    owner,
    repo,
    pull_number: audit.prNumber,
    sha: audit.head,
    merge_method: "merge",
    commit_title: `Merge pull request #${audit.prNumber} (Phase 0 audited head ${audit.head})`,
    commit_message: [
      `base ${audit.base}`,
      `head ${audit.head}`,
      `gate ${validated.gateId} ${validated.gateExternalId}`,
      `dispatch ${validated.dispatchIdentity.runId}/${validated.dispatchIdentity.attempt}`,
    ].join("\n"),
  };
  let response;
  let mergeSha;
  try {
    response = await mergerGithub.rest.pulls.merge(payload);
  } catch (error) {
    if (definitiveHttpFailure(error))
      throw new Error(`definitive merge refusal HTTP ${statusOf(error)}`, { cause: error });
    const main = (await readGithub.rest.git.getRef({ owner, repo, ref: "heads/main" })).data.object
      .sha;
    const pull = (await readGithub.rest.pulls.get({ owner, repo, pull_number: audit.prNumber }))
      .data;
    if (pull.merged && pull.merge_commit_sha === main && SHA.test(main)) mergeSha = main;
    else throw new AggregateError([error], "merge result not proven; no retry performed");
  }
  if (response) {
    if (!response.data?.merged || !SHA.test(response.data.sha ?? ""))
      throw new Error("definitive merge refusal");
    mergeSha = response.data.sha;
  }
  const merge = (await readGithub.rest.repos.getCommit({ owner, repo, ref: mergeSha })).data;
  if (
    merge.parents?.length !== 2 ||
    merge.parents[0].sha !== audit.base ||
    merge.parents[1].sha !== audit.head ||
    merge.commit?.tree?.sha !== audit.tree ||
    merge.author?.login !== MERGER_APP_BOT_LOGIN ||
    merge.committer?.login !== "web-flow"
  )
    throw new Error("I2 merge graph/tree/author/committer mismatch");
  for (let read = 0; read < 2; read++) {
    if (
      (await readGithub.rest.git.getRef({ owner, repo, ref: "heads/main" })).data.object.sha !==
      mergeSha
    )
      throw new Error("I3 main does not equal exact merge SHA");
    if (read === 0 && confirmationDelayMs > 0) await sleep(confirmationDelayMs);
  }
  const pull = (await readGithub.rest.pulls.get({ owner, repo, pull_number: audit.prNumber })).data;
  if (!pull.merged || pull.state !== "closed" || pull.merge_commit_sha !== mergeSha)
    throw new Error("I4 PR merge state mismatch");
  const gates = await listAuthoritativeGateChecks(readGithub, owner, repo, audit.head);
  const gate = gates[0];
  if (
    gates.length !== 1 ||
    gate.id !== validated.gateId ||
    gate.external_id !== validated.gateExternalId ||
    gate.completed_at !== validated.gateCompletedAt ||
    gate.conclusion !== "success"
  )
    throw new Error("I5 Gate changed after authorization");
  const ruleSuite = await readRuleSuiteEvidence({
    github: readGithub,
    owner,
    repo,
    mergeSha,
    attempts: ruleSuiteAttempts,
    delayMs: ruleSuiteDelayMs,
  });
  return { mergeSha, mergeTree: merge.commit.tree.sha, ruleSuite };
}
