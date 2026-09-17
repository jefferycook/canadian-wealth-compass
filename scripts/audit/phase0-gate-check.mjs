const SHA = /^[0-9a-f]{40}$/;
const UINT = /^[1-9][0-9]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export const PHASE0_GATE_NAME = "phase0-gate";
export const PHASE0_GATE_APP_ID = 4876044;
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const nextCompletedAt = (previous) => {
  const current = Date.parse(now());
  const prior = Date.parse(previous ?? "");
  return new Date(Number.isNaN(prior) ? current : Math.max(current, prior + 1000))
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
};
const qid = (value) => `p0g:v1:q:${value}`;
const hasAuthoritativeIdentity = (run, candidateSha) =>
  run?.name === PHASE0_GATE_NAME &&
  run?.head_sha === candidateSha &&
  run?.app?.id === PHASE0_GATE_APP_ID;
const hasCanonicalCompletedState = (run) =>
  run?.status === "completed" &&
  ISO.test(run?.completed_at ?? "") &&
  !Number.isNaN(Date.parse(run.completed_at));
export const isCanonicalPhase0GateQ = (run, candidateSha) =>
  hasAuthoritativeIdentity(run, candidateSha) &&
  hasCanonicalCompletedState(run) &&
  run.conclusion === "failure" &&
  run.external_id === qid(candidateSha);
const isAuthorizingSuccess = (run, candidateSha) =>
  hasAuthoritativeIdentity(run, candidateSha) &&
  hasCanonicalCompletedState(run) &&
  run.conclusion === "success";
const sameExactCheckState = (left, right) =>
  left?.id === right?.id &&
  left?.name === right?.name &&
  left?.head_sha === right?.head_sha &&
  left?.app?.id === right?.app?.id &&
  left?.status === right?.status &&
  left?.conclusion === right?.conclusion &&
  left?.completed_at === right?.completed_at &&
  left?.external_id === right?.external_id;
const isProvenRecovery = (error) => error?.nonAuthorizingGateProven === true;
const integer = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`invalid ${label}`);
  return value;
};
const sha = (value, label) => {
  if (!SHA.test(value ?? "")) throw new Error(`invalid ${label}`);
  return value;
};
const canonicalNumber = (value, label) => {
  if (!UINT.test(value)) throw new Error(`invalid ${label}`);
  return integer(Number(value), label);
};
const fail = (outcome, message) => {
  const error = new Error(`${outcome}: ${message}`);
  error.outcome = outcome;
  throw error;
};

function normalizeVerify(source) {
  return {
    kind: "v",
    workflowId: integer(source?.workflowId, "workflow id"),
    runId: integer(source?.runId, "run id"),
    attempt: integer(source?.runAttempt, "attempt"),
    pr: integer(source?.pullNumber, "PR"),
    base: sha(source?.baseSha, "base SHA"),
  };
}

function normalizeManual(source, old) {
  if (source?.actor !== "jefferycook") throw new Error("invalid manual actor");
  return {
    kind: "m",
    dispatchRunId: integer(source?.dispatchRunId, "dispatch run id"),
    dispatchAttempt: integer(source?.dispatchAttempt, "dispatch attempt"),
    actor: source.actor,
    pr: integer(source?.pullNumber, "PR"),
    base: sha(source?.baseSha, "base SHA"),
    verifierRunId: integer(
      source?.verifierRunId ?? (old.kind === "a" ? old.runId : old.verifierRunId),
      "verifier run id",
    ),
    verifierAttempt: integer(
      source?.verifierAttempt ?? (old.kind === "a" ? old.attempt : old.verifierAttempt),
      "verifier attempt",
    ),
  };
}

export function serializePhase0Gate(candidateSha, source) {
  sha(candidateSha, "candidate SHA");
  let fields;
  if (source.kind === "v" || source.kind === "a")
    fields = [
      "p0g",
      "v2",
      source.kind,
      candidateSha,
      source.token,
      integer(source.workflowId, "workflow id"),
      integer(source.runId, "run id"),
      integer(source.attempt, "attempt"),
      integer(source.pr, "PR"),
      sha(source.base, "base SHA"),
    ];
  else if (source.kind === "m")
    fields = [
      "p0g",
      "v2",
      "m",
      candidateSha,
      source.token,
      integer(source.dispatchRunId, "dispatch run id"),
      integer(source.dispatchAttempt, "dispatch attempt"),
      source.actor,
      integer(source.pr, "PR"),
      sha(source.base, "base SHA"),
      integer(source.verifierRunId, "verifier run id"),
      integer(source.verifierAttempt, "verifier attempt"),
    ];
  else throw new Error("invalid source kind");
  const value = fields.join(":");
  if (Buffer.byteLength(value) > 255) throw new Error("provenance exceeds 255 bytes");
  return value;
}

export function parsePhase0Gate(run, candidateSha) {
  sha(candidateSha, "candidate SHA");
  if (!hasAuthoritativeIdentity(run, candidateSha))
    throw new Error("invalid authoritative Check Run identity");
  if (!hasCanonicalCompletedState(run)) throw new Error("invalid completed Check Run state");
  const raw = String(run.external_id ?? "");
  if (raw === qid(candidateSha)) {
    if (!isCanonicalPhase0GateQ(run, candidateSha)) throw new Error("Q must be canonical");
    return { state: "Q", kind: "q", token: "q", externalId: raw };
  }
  const f = raw.split(":");
  if (f[0] !== "p0g" || f[1] !== "v2" || f[3] !== candidateSha)
    throw new Error("invalid v2 provenance");
  let parsed;
  if (f[2] === "v" && f.length === 10)
    parsed = {
      kind: "v",
      token: f[4],
      workflowId: canonicalNumber(f[5], "workflow id"),
      runId: canonicalNumber(f[6], "run id"),
      attempt: canonicalNumber(f[7], "attempt"),
      pr: canonicalNumber(f[8], "PR"),
      base: sha(f[9], "base SHA"),
    };
  else if (f[2] === "a" && f.length === 10 && f[4] === "awaiting")
    parsed = {
      kind: "a",
      token: f[4],
      workflowId: canonicalNumber(f[5], "workflow id"),
      runId: canonicalNumber(f[6], "run id"),
      attempt: canonicalNumber(f[7], "attempt"),
      pr: canonicalNumber(f[8], "PR"),
      base: sha(f[9], "base SHA"),
    };
  else if (f[2] === "m" && f.length === 12) {
    parsed = {
      kind: "m",
      token: f[4],
      dispatchRunId: canonicalNumber(f[5], "dispatch run id"),
      dispatchAttempt: canonicalNumber(f[6], "dispatch attempt"),
      actor: f[7],
      pr: canonicalNumber(f[8], "PR"),
      base: sha(f[9], "base SHA"),
      verifierRunId: canonicalNumber(f[10], "verifier run id"),
      verifierAttempt: canonicalNumber(f[11], "verifier attempt"),
    };
    if (parsed.actor !== "jefferycook") throw new Error("invalid manual actor");
  } else throw new Error("invalid v2 provenance grammar");
  const state =
    parsed.kind === "v"
      ? { safe: "V-SAFE", failure: "V-FAIL", success: "V-SUCC" }[parsed.token]
      : parsed.kind === "a"
        ? "A-WAIT"
        : { safe: "M-SAFE", success: "M-SUCC" }[parsed.token];
  if (!state) throw new Error("invalid provenance token");
  const conclusion = ["V-SUCC", "M-SUCC"].includes(state) ? "success" : "failure";
  if (run.conclusion !== conclusion) throw new Error("token/conclusion mismatch");
  if (serializePhase0Gate(candidateSha, parsed) !== raw || Buffer.byteLength(raw) > 255)
    throw new Error("noncanonical provenance");
  return { ...parsed, state, externalId: raw };
}

const expected = (candidateSha, externalId, completedAt) => ({
  name: PHASE0_GATE_NAME,
  head_sha: candidateSha,
  status: "completed",
  conclusion: externalId.includes(":success:") ? "success" : "failure",
  external_id: externalId,
  completed_at: completedAt,
});
const matches = (run, e) =>
  run &&
  run.id > 0 &&
  run.name === e.name &&
  run.head_sha === e.head_sha &&
  run.app?.id === PHASE0_GATE_APP_ID &&
  run.status === e.status &&
  run.conclusion === e.conclusion &&
  run.external_id === e.external_id &&
  ISO.test(run.completed_at ?? "") &&
  (!e.completed_at || Date.parse(run.completed_at) === Date.parse(e.completed_at));
async function get(github, owner, repo, id) {
  return (await github.rest.checks.get({ owner, repo, check_run_id: id })).data;
}
function provedNonAuthorizingRecovery(errors, id, recovered) {
  const error = new AggregateError(
    errors,
    `Check Run ${id} uncertain mutation proved a non-authorizing Gate state; current evaluation rejected`,
  );
  error.nonAuthorizingGateProven = true;
  error.recovered = recovered;
  return error;
}
async function recoverRequiredNonAuthorizingState({
  github,
  owner,
  repo,
  id,
  current,
  expectedState,
  payload,
  initialError,
}) {
  const errors = [initialError];
  let observed;
  try {
    observed = await get(github, owner, repo, id);
  } catch (error) {
    errors.push(error);
    throw new AggregateError(
      errors,
      `non-authorizing Gate state could not be proven for Check Run ${id}`,
    );
  }
  if (matches(observed, expectedState)) throw provedNonAuthorizingRecovery(errors, id, observed);
  if (!sameExactCheckState(observed, current))
    throw new AggregateError(
      errors,
      `non-authorizing Gate state could not be proven for Check Run ${id}`,
    );

  try {
    await github.rest.checks.update(payload);
  } catch (error) {
    errors.push(error);
  }
  let recovered;
  try {
    recovered = await get(github, owner, repo, id);
  } catch (error) {
    errors.push(error);
  }
  if (!matches(recovered, expectedState))
    throw new AggregateError(
      errors,
      `non-authorizing Gate state could not be proven for Check Run ${id}`,
    );
  throw provedNonAuthorizingRecovery(errors, id, recovered);
}
async function update(
  github,
  owner,
  repo,
  id,
  candidateSha,
  externalId,
  detailsUrl,
  title,
  summary,
  expectedCurrentExternalId,
  requireNonAuthorizingRecovery = false,
) {
  const current = await get(github, owner, repo, id); // I-Q before every update.
  if (isCanonicalPhase0GateQ(current, candidateSha)) fail("Q_NO_WRITE", "Q is terminal");
  if (
    current.id !== id ||
    current.name !== PHASE0_GATE_NAME ||
    current.head_sha !== candidateSha ||
    current.app?.id !== PHASE0_GATE_APP_ID
  )
    throw new Error(`invalid authoritative Check Run identity ${id}`);
  if (expectedCurrentExternalId !== undefined) {
    if (current.external_id !== expectedCurrentExternalId)
      throw new Error(`Check Run ${id} provenance changed before cleanup`);
    try {
      parsePhase0Gate(current, candidateSha);
    } catch (error) {
      if (!(requireNonAuthorizingRecovery && isAuthorizingSuccess(current, candidateSha)))
        throw error;
    }
  }
  const completedAt = nextCompletedAt(current.completed_at);
  const e = expected(candidateSha, externalId, completedAt);
  const payload = {
    owner,
    repo,
    check_run_id: id,
    name: PHASE0_GATE_NAME,
    status: "completed",
    conclusion: e.conclusion,
    completed_at: completedAt,
    details_url: detailsUrl,
    external_id: externalId,
    output: { title, summary },
  };
  const recoveryRequired =
    e.conclusion === "failure" &&
    (requireNonAuthorizingRecovery || isAuthorizingSuccess(current, candidateSha));
  let response;
  try {
    response = await github.rest.checks.update(payload);
  } catch (cause) {
    if (recoveryRequired)
      return recoverRequiredNonAuthorizingState({
        github,
        owner,
        repo,
        id,
        current,
        expectedState: e,
        payload,
        initialError: cause,
      });
    const recovered = await get(github, owner, repo, id).catch(() => null);
    if (matches(recovered, e)) return recovered;
    throw new AggregateError([cause], `ambiguous Check Run update ${id}`);
  }
  if (!matches(response?.data, e)) {
    const cause = new Error(`invalid Check Run update response ${id}`);
    if (recoveryRequired)
      return recoverRequiredNonAuthorizingState({
        github,
        owner,
        repo,
        id,
        current,
        expectedState: e,
        payload,
        initialError: cause,
      });
    const recovered = await get(github, owner, repo, id).catch(() => null);
    if (matches(recovered, e)) return recovered;
    throw cause;
  }
  return response.data;
}
async function terminalize(github, owner, repo, run, candidateSha, detailsUrl, rule) {
  if (isCanonicalPhase0GateQ(run, candidateSha)) return false;
  try {
    await update(
      github,
      owner,
      repo,
      run.id,
      candidateSha,
      qid(candidateSha),
      detailsUrl,
      "Phase 0 candidate SHA burned",
      `${rule} terminalization`,
      undefined,
      true,
    );
  } catch (error) {
    if (error?.outcome === "Q_NO_WRITE") return false;
    if (isProvenRecovery(error)) return true;
    throw error;
  }
  return true;
}
export async function terminalizeDuplicateGateChecks({
  github,
  owner,
  repo,
  candidateSha,
  runs,
  detailsUrl,
}) {
  const unresolved = [];
  for (const run of runs) {
    if (isCanonicalPhase0GateQ(run, candidateSha)) continue;
    try {
      await terminalize(github, owner, repo, run, candidateSha, detailsUrl, "T1");
    } catch (error) {
      unresolved.push({ id: run.id, error });
    }
  }
  const suffix = unresolved.length
    ? `; unresolved IDs ${unresolved.map(({ id }) => id).join(",")}`
    : "";
  const message = `T1: duplicate authoritative Gate records rejected${suffix}`;
  const error = unresolved.length
    ? new AggregateError(
        unresolved.map((item) => item.error),
        message,
      )
    : new Error(message);
  error.outcome = "T1";
  error.unresolved = unresolved;
  throw error;
}

export async function terminalizeAuthorizedGate({
  github,
  owner,
  repo,
  candidateSha,
  checkRunId,
  expectedExternalId,
  detailsUrl,
  reason,
}) {
  const current = await get(github, owner, repo, checkRunId);
  if (current.id !== checkRunId) throw new Error(`cleanup Gate ${checkRunId} identity changed`);
  if (!hasAuthoritativeIdentity(current, candidateSha))
    throw new Error(`cleanup Gate ${checkRunId} identity changed`);
  if (isCanonicalPhase0GateQ(current, candidateSha)) return { operation: "Q_NO_WRITE", checkRunId };
  let parsed;
  try {
    parsed = parsePhase0Gate(current, candidateSha);
  } catch (error) {
    if (!isAuthorizingSuccess(current, candidateSha))
      return {
        operation: "NON_AUTHORIZING_NO_WRITE",
        checkRunId,
        externalId: String(current.external_id ?? ""),
      };
  }
  if (current.conclusion !== "success")
    return {
      operation: "NON_AUTHORIZING_NO_WRITE",
      checkRunId,
      externalId: parsed?.externalId ?? String(current.external_id ?? ""),
    };
  let updated;
  try {
    updated = await update(
      github,
      owner,
      repo,
      checkRunId,
      candidateSha,
      qid(candidateSha),
      detailsUrl,
      "Phase 0 candidate SHA burned",
      `pre-P14 fail-closed cleanup: ${reason}; expected ${expectedExternalId}`,
      current.external_id,
      true,
    );
  } catch (error) {
    if (error?.outcome === "Q_NO_WRITE") return { operation: "Q_NO_WRITE", checkRunId };
    if (isProvenRecovery(error)) return { operation: "TERMINALIZED_RECOVERY", checkRunId };
    throw error;
  }
  return { operation: "TERMINALIZED", checkRunId: updated.id };
}
async function terminalFailure(args, run, rule) {
  await terminalize(
    args.github,
    args.owner,
    args.repo,
    run,
    args.candidateSha,
    args.detailsUrl,
    rule,
  );
  fail(rule, "candidate SHA terminalized");
}

export async function listAuthoritativeGateChecks(github, owner, repo, candidateSha) {
  const listed = await github.paginate(github.rest.checks.listForRef, {
    owner,
    repo,
    ref: candidateSha,
    check_name: PHASE0_GATE_NAME,
    app_id: PHASE0_GATE_APP_ID,
    filter: "all",
    per_page: 100,
  });
  if (!Array.isArray(listed)) throw new Error("malformed Check Runs response");
  return listed.filter(
    (r) =>
      r?.name === PHASE0_GATE_NAME &&
      r?.head_sha === candidateSha &&
      r?.app?.id === PHASE0_GATE_APP_ID,
  );
}

function verifyFinalSource(normalized, conclusion, infrastructure) {
  if (infrastructure && conclusion === "success")
    return { ...normalized, kind: "a", token: "awaiting" };
  return { ...normalized, kind: "v", token: conclusion };
}
function safeOf(source) {
  return { ...source, token: "safe" };
}
function sameVerifyIdentity(old, incoming) {
  return old.workflowId === incoming.workflowId && old.runId === incoming.runId;
}
function samePrBase(old, incoming) {
  return old.pr === incoming.pr && old.base === incoming.base;
}
function sameManualIdentity(old, incoming) {
  return (
    samePrBase(old, incoming) &&
    old.verifierRunId === incoming.verifierRunId &&
    old.verifierAttempt === incoming.verifierAttempt
  );
}

export async function transitionPhase0Gate(args) {
  const {
    github,
    owner,
    repo,
    candidateSha,
    existing,
    incomingType,
    classification,
    conclusion,
    source,
    detailsUrl,
    title,
    summary,
  } = args;
  if (!existing) throw new Error("existing canonical Gate required");
  if (!["v", "m"].includes(incomingType)) throw new Error("invalid incoming type");
  if (!["ordinary", "infrastructure"].includes(classification))
    throw new Error("invalid classification");
  if (incomingType === "v" && !["success", "failure"].includes(conclusion))
    throw new Error("invalid verifier conclusion");

  // U2 precedes parsing/normalisation and performs no get/update write path.
  if (isCanonicalPhase0GateQ(existing, candidateSha)) fail("Q_NO_WRITE", "Q is terminal");
  let old;
  try {
    old = parsePhase0Gate(existing, candidateSha);
  } catch (cause) {
    if (existing.conclusion === "success") await terminalFailure(args, existing, "T2");
    throw cause;
  }

  // U4-Y and U4-X precede source normalisation and staging.
  if (incomingType === "m" && classification === "ordinary")
    fail("REJECT_NO_MUTATION", "U4-Y manual input on ordinary classification");
  if (incomingType === "m" && old.kind === "v")
    fail("REJECT_NO_MUTATION", "U4-X manual input against verifier record");

  let normalized;
  let normalizeError;
  try {
    normalized = incomingType === "v" ? normalizeVerify(source) : normalizeManual(source, old);
  } catch (error) {
    normalizeError = error;
  }
  let finalSource;
  let finalId;
  if (normalized) {
    finalSource =
      incomingType === "v"
        ? verifyFinalSource(normalized, conclusion, classification === "infrastructure")
        : { ...normalized, token: "success" };
    finalId = serializePhase0Gate(candidateSha, finalSource);
    if (finalId === existing.external_id)
      return {
        operation: "unchanged",
        outcome: "NOOP",
        checkRunId: existing.id,
        externalId: finalId,
      };
  }

  // U4: all non-exempt successful records are staged before later fallible checks.
  let current = existing;
  if (["V-SUCC", "M-SUCC"].includes(old.state)) {
    current = await update(
      github,
      owner,
      repo,
      existing.id,
      candidateSha,
      serializePhase0Gate(candidateSha, safeOf(old)),
      detailsUrl,
      "Phase 0 authorization pending",
      summary,
    );
  }
  if (normalizeError) {
    if (current !== existing) await terminalFailure(args, current, "T3");
    fail("REJECT_NO_MUTATION", normalizeError.message);
  }

  // T-6: classification/kind compatibility.
  if (incomingType === "v") {
    if (
      (["V-SAFE", "V-SUCC"].includes(old.state) && classification === "infrastructure") ||
      (old.state === "A-WAIT" && classification === "ordinary") ||
      old.kind === "m"
    )
      await terminalFailure(args, current, "T6");
  } else if (old.kind === "m" && !sameManualIdentity(old, normalized)) {
    await terminalFailure(args, current, "T6");
  }

  // T-4: verifier/manual identity and ordering.
  if (incomingType === "v") {
    if (
      !sameVerifyIdentity(old, normalized) ||
      normalized.attempt < old.attempt ||
      !samePrBase(old, normalized)
    )
      await terminalFailure(args, current, "T4");
  } else if (
    old.kind === "m" &&
    normalized.dispatchRunId === old.dispatchRunId &&
    normalized.dispatchAttempt < old.dispatchAttempt
  ) {
    await terminalFailure(args, current, "T4");
  }

  // T-5: immutable same-attempt conclusions.
  if (incomingType === "v" && normalized.attempt === old.attempt) {
    const contradiction =
      (old.state === "V-FAIL" && conclusion === "success") ||
      (old.state === "V-SAFE" && conclusion === "failure") ||
      (old.state === "V-SUCC" && conclusion === "failure") ||
      (old.state === "A-WAIT" && conclusion === "failure");
    if (contradiction) await terminalFailure(args, current, "T5");
  }

  const write = async (sourceValue, outcomeTitle = title) => {
    current = await update(
      github,
      owner,
      repo,
      existing.id,
      candidateSha,
      serializePhase0Gate(candidateSha, sourceValue),
      detailsUrl,
      outcomeTitle,
      summary,
    );
  };
  let outcome;
  if (incomingType === "m") {
    if (old.state === "A-WAIT") {
      if (
        !samePrBase(old, normalized) ||
        old.runId !== normalized.verifierRunId ||
        old.attempt !== normalized.verifierAttempt
      )
        fail("REJECT_NO_MUTATION", "KC3 audit identity mismatch");
      outcome = "KC3";
    } else if (old.state === "M-SAFE") outcome = "M_SAFE_TO_M_SUCC";
    else if (old.state === "M-SUCC") outcome = "M_SUCC_REESTABLISH";
    else fail("REJECT_NO_MUTATION", "manual authorization state rejected");
    await write({ ...normalized, token: "safe" }, "Phase 0 merge authorization pending");
    await write({ ...normalized, token: "success" }, "Phase 0 exact-SHA merge authorized");
  } else if (old.state === "V-SAFE") {
    if (conclusion === "success") {
      outcome =
        normalized.attempt === old.attempt ? "V_SAFE_TO_V_SUCC" : "V_SAFE_ADVANCE_TO_V_SUCC";
      await write(safeOf(finalSource), "Phase 0 authorization pending");
      await write(finalSource);
    } else {
      outcome = "V_SAFE_ADVANCE_TO_V_FAIL";
      await write(finalSource);
    }
  } else if (old.state === "V-FAIL") {
    if (conclusion === "success" && classification === "infrastructure") {
      outcome = "KC1";
      await write(finalSource, "Manual exact-SHA infrastructure audit required");
    } else if (conclusion === "success") {
      outcome = "V_FAIL_TO_V_SUCC";
      await write(safeOf(finalSource), "Phase 0 authorization pending");
      await write(finalSource);
    } else {
      outcome = "V_FAIL_UPDATE";
      await write(finalSource);
    }
  } else if (old.state === "V-SUCC") {
    if (conclusion === "success") {
      outcome = "V_SUCC_ADVANCE_TO_V_SUCC";
      await write(safeOf(finalSource), "Phase 0 authorization pending");
      await write(finalSource);
    } else {
      outcome = "V_SUCC_TO_V_FAIL";
      await write(finalSource);
    }
  } else if (old.state === "A-WAIT") {
    if (conclusion === "success") {
      outcome = "A_WAIT_UPDATE";
      await write(finalSource, "Manual exact-SHA infrastructure audit required");
    } else {
      outcome = "KC2";
      await write(finalSource);
    }
  } else fail("REJECT_NO_MUTATION", "unsupported transition");
  return {
    operation: "updated",
    outcome,
    checkRunId: existing.id,
    externalId: current.external_id,
  };
}

export async function upsertPhase0GateCheck(args) {
  const {
    github,
    owner,
    repo,
    candidateSha,
    conclusion,
    infrastructure = false,
    detailsUrl,
    title,
    summary,
    source,
  } = args;
  sha(candidateSha, "candidate SHA");
  if (
    !github?.rest?.checks?.get ||
    !github?.rest?.checks?.create ||
    !github?.rest?.checks?.update ||
    !github?.paginate
  )
    throw new Error("missing Checks API client");
  const runs = await listAuthoritativeGateChecks(github, owner, repo, candidateSha);
  if (runs.length > 1)
    await terminalizeDuplicateGateChecks({
      github,
      owner,
      repo,
      candidateSha,
      runs,
      detailsUrl,
    });
  const existing = runs[0];
  if (existing)
    return transitionPhase0Gate({
      ...args,
      existing,
      incomingType: "v",
      classification: infrastructure ? "infrastructure" : "ordinary",
    });

  const normalized = normalizeVerify(source);
  const finalSource = verifyFinalSource(normalized, conclusion, infrastructure);
  const safeSource =
    finalSource.kind === "a"
      ? finalSource
      : finalSource.token === "success"
        ? safeOf(finalSource)
        : finalSource;
  const safeId = serializePhase0Gate(candidateSha, safeSource);
  const payload = {
    owner,
    repo,
    name: PHASE0_GATE_NAME,
    head_sha: candidateSha,
    status: "completed",
    conclusion: "failure",
    completed_at: now(),
    details_url: detailsUrl,
    external_id: safeId,
    output: {
      title:
        safeSource.kind === "a"
          ? "Manual exact-SHA infrastructure audit required"
          : safeSource.token === "safe"
            ? "Phase 0 authorization pending"
            : title,
      summary,
    },
  };
  let created = (await github.rest.checks.create(payload)).data;
  const expectedCreated = expected(candidateSha, safeId, payload.completed_at);
  if (!matches(created, expectedCreated)) {
    const createdId = created?.id;
    if (!Number.isSafeInteger(createdId) || createdId <= 0)
      throw new Error("invalid Check Run create response");
    created = await get(github, owner, repo, createdId).catch(() => null);
    if (!matches(created, expectedCreated)) throw new Error("invalid Check Run create response");
  }
  const finalId = serializePhase0Gate(candidateSha, finalSource);
  if (safeId === finalId)
    return {
      operation: "created",
      outcome: finalSource.kind === "a" ? "A_WAIT_CREATE" : "V_FAIL_CREATE",
      checkRunId: created.id,
      externalId: finalId,
    };
  const done = await update(
    github,
    owner,
    repo,
    created.id,
    candidateSha,
    finalId,
    detailsUrl,
    title,
    summary,
  );
  return {
    operation: "created",
    outcome: "V_SUCC_CREATE",
    checkRunId: done.id,
    externalId: finalId,
  };
}

export async function authorizeManualGate(args) {
  const { github, owner, repo, candidateSha } = args;
  const runs = await listAuthoritativeGateChecks(github, owner, repo, candidateSha);
  if (runs.length !== 1) throw new Error("manual path requires exactly one canonical Gate record");
  return transitionPhase0Gate({
    ...args,
    existing: runs[0],
    incomingType: "m",
    classification: args.classification ?? "infrastructure",
    conclusion: "success",
    title: "Phase 0 exact-SHA merge authorized",
    summary: "Independent exact-SHA audit authorization recorded",
  });
}
