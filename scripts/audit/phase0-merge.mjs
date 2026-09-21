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
export const MERGER_APP_ACTOR_ID = 328179191;
export const RULESET_A_ID = 22812673;
export const RULESET_A_NAME = "Phase 0 main protection";
export const RULESET_A_UPDATED_AT = "2026-09-10T19:09:35.450Z";
export const RULESET_B_ID = 23576549;
export const RULESET_B_NAME = "Phase 0 main update restriction";
export const RULESET_B_UPDATED_AT = "2026-09-17T03:19:33.461Z";
export const RULESET_SOURCE = "jefferycook/canadian-wealth-compass";
const RULESET_ADMIN_ATTESTATIONS = Object.freeze({
  a: Object.freeze({
    id: RULESET_A_ID,
    updatedAt: RULESET_A_UPDATED_AT,
    bypassActors: Object.freeze([]),
    responseHash: "4354990a554c8632553eec4458ade23f3967aa03429f2eb5aff4182c9ebed127",
  }),
  b: Object.freeze({
    id: RULESET_B_ID,
    updatedAt: RULESET_B_UPDATED_AT,
    bypassActors: Object.freeze([
      Object.freeze({
        actor_id: MERGER_APP_ID,
        actor_type: "Integration",
        bypass_mode: "pull_request",
      }),
    ]),
    responseHash: "381fd9188ecd1dc6465a339324665de3b517d0ecc5378298d1510ecb785778f1",
  }),
});
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

const expectedConditions = {
  ref_name: { include: ["refs/heads/main"], exclude: [] },
};
const expectedRulesetARules = [
  { type: "deletion" },
  { type: "non_fast_forward" },
  { type: "pull_request", parameters: expectedPullRequestParameters },
  { type: "required_status_checks", parameters: expectedStatusParameters },
];
const expectedRulesetBRules = [{ type: "update" }];
const expectedEffectiveRules = [
  ...expectedRulesetARules.map((rule) => ({
    ...rule,
    ruleset_source_type: "Repository",
    ruleset_source: RULESET_SOURCE,
    ruleset_id: RULESET_A_ID,
  })),
  ...expectedRulesetBRules.map((rule) => ({
    ...rule,
    ruleset_source_type: "Repository",
    ruleset_source: RULESET_SOURCE,
    ruleset_id: RULESET_B_ID,
  })),
];
function normalizedInstant(value, message) {
  if (typeof value !== "string") throw new Error(message);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(message);
  return new Date(milliseconds).toISOString();
}

function exactRulesetMetadata(rule, { id, name, updatedAt, rules }) {
  return (
    rule?.id === id &&
    rule.name === name &&
    rule.target === "branch" &&
    rule.enforcement === "active" &&
    rule.source_type === "Repository" &&
    rule.source === RULESET_SOURCE &&
    rule.current_user_can_bypass === "never" &&
    canonicalJson(rule.conditions) === canonicalJson(expectedConditions) &&
    canonicalJson(rule.rules) === canonicalJson(rules) &&
    normalizedInstant(rule.updated_at, `P12 Ruleset ${id} drift`) === updatedAt
  );
}

function validateBypassProjection(rule, expected, message) {
  if (!Object.hasOwn(rule ?? {}, "bypass_actors")) return "REDACTED";
  if (canonicalJson(rule.bypass_actors) !== canonicalJson(expected)) throw new Error(message);
  return "VISIBLE";
}

export function validateEffectiveRules(applied) {
  if (!Array.isArray(applied)) throw new Error("P12 effective rules drift");
  const sortRules = (rules) =>
    [...rules].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  if (canonicalJson(sortRules(applied)) !== canonicalJson(sortRules(expectedEffectiveRules)))
    throw new Error("P12 effective rules drift");
  return true;
}

export function validateRulesetA(rule) {
  const message = "P12 Ruleset A drift";
  let exact = false;
  try {
    exact = exactRulesetMetadata(rule, {
      id: RULESET_A_ID,
      name: RULESET_A_NAME,
      updatedAt: RULESET_A_UPDATED_AT,
      rules: expectedRulesetARules,
    });
  } catch {
    throw new Error(message);
  }
  if (!exact) throw new Error(message);
  return validateBypassProjection(rule, RULESET_ADMIN_ATTESTATIONS.a.bypassActors, message);
}

export function isRulesetB(rule) {
  try {
    return (
      exactRulesetMetadata(rule, {
        id: RULESET_B_ID,
        name: RULESET_B_NAME,
        updatedAt: RULESET_B_UPDATED_AT,
        rules: expectedRulesetBRules,
      }) &&
      Boolean(
        validateBypassProjection(
          rule,
          RULESET_ADMIN_ATTESTATIONS.b.bypassActors,
          "P12 Ruleset B drift",
        ),
      )
    );
  } catch {
    return false;
  }
}

export async function validateRulesets(github, owner, repo) {
  const applied = (
    await repoRequest(github, "GET /repos/{owner}/{repo}/rules/branches/main", owner, repo)
  ).data;
  validateEffectiveRules(applied);
  const [a, b] = await Promise.all(
    [RULESET_A_ID, RULESET_B_ID].map(
      async (rulesetId) =>
        (
          await repoRequest(
            github,
            "GET /repos/{owner}/{repo}/rulesets/{ruleset_id}",
            owner,
            repo,
            {
              ruleset_id: rulesetId,
            },
          )
        ).data,
    ),
  );
  const aVisibility = validateRulesetA(a);
  if (!isRulesetB(b)) throw new Error("P12 Ruleset B drift");
  const bVisibility = validateBypassProjection(
    b,
    RULESET_ADMIN_ATTESTATIONS.b.bypassActors,
    "P12 Ruleset B drift",
  );
  const evidence = (key, rule, visibility) => {
    const adminAttestation = RULESET_ADMIN_ATTESTATIONS[key];
    const projection = {
      metadata: {
        id: rule.id,
        name: rule.name,
        target: rule.target,
        enforcement: rule.enforcement,
        source_type: rule.source_type,
        source: rule.source,
        conditions: rule.conditions,
        rules: rule.rules,
        updated_at: normalizedInstant(rule.updated_at, "P12 ruleset timestamp drift"),
        current_user_can_bypass: rule.current_user_can_bypass,
        bypass_actors: visibility,
      },
      effectiveRules: applied.filter((item) => item.ruleset_id === rule.id),
    };
    return {
      id: rule.id,
      hash: jsonHash(projection),
      updatedAt: adminAttestation.updatedAt,
      bypassVisibility: visibility,
      adminAttestation,
    };
  };
  return {
    a: evidence("a", a, aVisibility),
    b: evidence("b", b, bVisibility),
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

export async function readRuleSuiteEvidence({ github, owner, repo, mergeSha, attempts, delayMs }) {
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
    const suites = (response.data ?? []).filter((item) => item.after_sha === mergeSha);
    if (suites.length > 1) throw new Error("I6 multiple exact rule suites found for merge");
    const suite = suites[0];
    if (suite) {
      if (!["pass", "bypass"].includes(suite.result))
        throw new Error("I6 exact rule suite result is not pass/bypass");
      if (suite.actor_id !== MERGER_APP_ACTOR_ID || suite.actor_name !== MERGER_APP_BOT_LOGIN)
        throw new Error("I6 exact rule suite actor is not the Merger App");
      return {
        available: true,
        id: suite.id,
        result: suite.result,
        actorId: suite.actor_id,
        actorName: suite.actor_name,
        afterSha: suite.after_sha,
      };
    }
    if (attempt < attempts && delayMs > 0) await sleep(delayMs);
  }
  return { available: false, reason: "not found", mergeSha };
}

export async function validateMergerRulesetView(mergerGithub, owner, repo) {
  const [a, b] = await Promise.all(
    [RULESET_A_ID, RULESET_B_ID].map(
      async (rulesetId) =>
        (
          await repoRequest(
            mergerGithub,
            "GET /repos/{owner}/{repo}/rulesets/{ruleset_id}",
            owner,
            repo,
            { ruleset_id: rulesetId },
          )
        ).data,
    ),
  );
  let aUpdatedAt;
  let bUpdatedAt;
  try {
    aUpdatedAt = normalizedInstant(a?.updated_at, "P14 Merger Ruleset A view drift");
    bUpdatedAt = normalizedInstant(b?.updated_at, "P14 Merger Ruleset B view drift");
  } catch {
    throw new Error("P14 Merger ruleset view drift");
  }
  if (
    a?.id !== RULESET_A_ID ||
    a.current_user_can_bypass !== "never" ||
    aUpdatedAt !== RULESET_A_UPDATED_AT ||
    b?.id !== RULESET_B_ID ||
    b.current_user_can_bypass !== "pull_requests_only" ||
    bUpdatedAt !== RULESET_B_UPDATED_AT
  )
    throw new Error("P14 Merger ruleset view drift");
  return {
    a: {
      id: a.id,
      updatedAt: aUpdatedAt,
      currentUserCanBypass: a.current_user_can_bypass,
    },
    b: {
      id: b.id,
      updatedAt: bUpdatedAt,
      currentUserCanBypass: b.current_user_can_bypass,
    },
  };
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
  const mergerRulesets = await validateMergerRulesetView(mergerGithub, owner, repo);
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
  return { mergeSha, mergeTree: merge.commit.tree.sha, mergerRulesets, ruleSuite };
}
