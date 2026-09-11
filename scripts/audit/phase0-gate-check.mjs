const EXACT_SHA = /^[0-9a-f]{40}$/;
const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export const PHASE0_GATE_NAME = "phase0-gate";
export const PHASE0_GATE_APP_ID = 4876044;

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`invalid ${label}`);
  return value;
}

function exactSha(value, label) {
  if (!EXACT_SHA.test(value ?? "")) throw new Error(`invalid ${label}`);
  return value;
}

function normalizeSource(source) {
  if (!source || typeof source !== "object") throw new Error("missing trusted decision source");
  if (source.kind === "verify") {
    return {
      kind: "verify",
      workflowId: positiveInteger(source.workflowId, "verifier workflow id"),
      runId: positiveInteger(source.runId, "verifier run id"),
      runAttempt: positiveInteger(source.runAttempt, "verifier run attempt"),
    };
  }
  if (source.kind === "manual") {
    if (source.actor !== "jefferycook") throw new Error("invalid manual approving actor");
    return {
      kind: "manual",
      workflowRunId: positiveInteger(source.workflowRunId, "manual workflow run id"),
      workflowRunAttempt: positiveInteger(source.workflowRunAttempt, "manual workflow run attempt"),
      actor: source.actor,
      pullNumber: positiveInteger(source.pullNumber, "manual pull request number"),
      auditedBaseSha: exactSha(source.auditedBaseSha, "manual audited base SHA"),
    };
  }
  throw new Error("invalid trusted decision source kind");
}

function provenanceFor(candidateSha, conclusion, source) {
  const normalized = normalizeSource(source);
  const fields =
    normalized.kind === "verify"
      ? [
          "p0g",
          "v1",
          "v",
          candidateSha,
          conclusion,
          normalized.workflowId,
          normalized.runId,
          normalized.runAttempt,
        ]
      : [
          "p0g",
          "v1",
          "m",
          candidateSha,
          conclusion,
          normalized.workflowRunId,
          normalized.workflowRunAttempt,
          normalized.actor,
          normalized.pullNumber,
          normalized.auditedBaseSha,
        ];
  const serialized = fields.join(":");
  if (serialized.length > 255) throw new Error("trusted decision provenance is too long");
  return serialized;
}

function quarantineProvenanceFor(candidateSha) {
  return `p0g:v1:q:${candidateSha}`;
}

function quarantinePayloadFor(owner, repo, candidateSha, detailsUrl) {
  return {
    owner,
    repo,
    name: PHASE0_GATE_NAME,
    status: "completed",
    conclusion: "failure",
    details_url: detailsUrl,
    external_id: quarantineProvenanceFor(candidateSha),
    output: {
      title: "Phase 0 authorization revoked",
      summary: "A trusted evaluation was rejected; this candidate SHA is permanently quarantined.",
    },
  };
}

function validIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    ISO_8601_UTC.test(value) &&
    !Number.isNaN(new Date(value).valueOf())
  );
}

function completedAtNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function validateExistingProvenance(checkRun, candidateSha) {
  if (
    checkRun.status !== "completed" ||
    !["success", "failure"].includes(checkRun.conclusion) ||
    !validIsoTimestamp(checkRun.completed_at)
  ) {
    throw new Error(`authoritative Check Run ${checkRun.id} has invalid state`);
  }
  const fields = String(checkRun.external_id ?? "").split(":");
  if (
    fields[0] !== "p0g" ||
    fields[1] !== "v1" ||
    fields[3] !== candidateSha ||
    fields[4] !== checkRun.conclusion
  ) {
    throw new Error(`authoritative Check Run ${checkRun.id} has mismatched provenance`);
  }
  let source;
  if (fields[2] === "v" && fields.length === 8) {
    source = {
      kind: "verify",
      workflowId: Number(fields[5]),
      runId: Number(fields[6]),
      runAttempt: Number(fields[7]),
    };
  } else if (fields[2] === "m" && fields.length === 10) {
    source = {
      kind: "manual",
      workflowRunId: Number(fields[5]),
      workflowRunAttempt: Number(fields[6]),
      actor: fields[7],
      pullNumber: Number(fields[8]),
      auditedBaseSha: fields[9],
    };
  } else {
    throw new Error(`authoritative Check Run ${checkRun.id} has invalid provenance`);
  }
  if (provenanceFor(candidateSha, checkRun.conclusion, source) !== checkRun.external_id) {
    throw new Error(`authoritative Check Run ${checkRun.id} has noncanonical provenance`);
  }
  return source;
}

function matchesCanonicalState(checkRun, expected) {
  return Boolean(
    checkRun &&
    Number.isSafeInteger(checkRun.id) &&
    checkRun.id > 0 &&
    (expected.checkRunId === undefined || checkRun.id === expected.checkRunId) &&
    checkRun.name === PHASE0_GATE_NAME &&
    checkRun.head_sha === expected.candidateSha &&
    checkRun.app?.id === PHASE0_GATE_APP_ID &&
    checkRun.status === "completed" &&
    checkRun.conclusion === expected.conclusion &&
    validIsoTimestamp(checkRun.completed_at) &&
    checkRun.external_id === expected.externalId,
  );
}

function isCanonicalQuarantine(checkRun, candidateSha, checkRunId) {
  return matchesCanonicalState(checkRun, {
    checkRunId,
    candidateSha,
    conclusion: "failure",
    externalId: quarantineProvenanceFor(candidateSha),
  });
}

function validateSafeMutation(response, expected) {
  const checkRun = response?.data;
  if (
    !validIsoTimestamp(checkRun?.completed_at) ||
    new Date(checkRun.completed_at).valueOf() !== new Date(expected.completedAt).valueOf()
  ) {
    throw new Error("Check Run mutation response failed completion timestamp validation");
  }
  if (!matchesCanonicalState(checkRun, expected)) {
    throw new Error("Check Run mutation response failed authoritative identity validation");
  }
  return checkRun;
}

async function fetchCheckRun(github, owner, repo, checkRunId) {
  const response = await github.rest.checks.get({ owner, repo, check_run_id: checkRunId });
  return response?.data;
}

async function quarantineDuplicateCheckRun({
  github,
  owner,
  repo,
  candidateSha,
  detailsUrl,
  checkRunId,
}) {
  positiveInteger(checkRunId, "authoritative Check Run id");
  const payload = quarantinePayloadFor(owner, repo, candidateSha, detailsUrl);
  const completedAt = completedAtNow();
  let response;
  try {
    response = await github.rest.checks.update({
      ...payload,
      check_run_id: checkRunId,
      completed_at: completedAt,
    });
    return validateSafeMutation(response, {
      checkRunId,
      candidateSha,
      conclusion: "failure",
      externalId: payload.external_id,
      completedAt,
    });
  } catch (cause) {
    try {
      const fetched = await fetchCheckRun(github, owner, repo, checkRunId);
      if (isCanonicalQuarantine(fetched, candidateSha, checkRunId)) return fetched;
    } catch (confirmationError) {
      throw new AggregateError(
        [cause, confirmationError],
        `unable to confirm authoritative Check Run ${checkRunId} in quarantine`,
      );
    }
    throw new AggregateError(
      [cause],
      `unable to confirm authoritative Check Run ${checkRunId} in quarantine`,
    );
  }
}

async function confirmFinalSuccess(github, owner, repo, checkRunId, expected, response) {
  if (matchesCanonicalState(response?.data, { ...expected, checkRunId })) {
    return response.data;
  }
  const fetched = await fetchCheckRun(github, owner, repo, checkRunId);
  return matchesCanonicalState(fetched, { ...expected, checkRunId }) ? fetched : null;
}

async function ensureFailureBeforeThrow({
  github,
  owner,
  repo,
  checkRunId,
  safePayload,
  candidateSha,
  safeExternalId,
  cause,
}) {
  const completedAt = completedAtNow();
  try {
    const response = await github.rest.checks.update({
      ...safePayload,
      check_run_id: checkRunId,
      completed_at: completedAt,
    });
    validateSafeMutation(response, {
      checkRunId,
      candidateSha,
      conclusion: "failure",
      externalId: safeExternalId,
      completedAt,
    });
    throw cause;
  } catch (failureError) {
    if (failureError === cause) throw cause;
    try {
      const fetched = await fetchCheckRun(github, owner, repo, checkRunId);
      if (
        matchesCanonicalState(fetched, {
          checkRunId,
          candidateSha,
          conclusion: "failure",
          externalId: safeExternalId,
        })
      ) {
        throw cause;
      }
    } catch (confirmationError) {
      if (confirmationError === cause) throw cause;
    }
    throw new AggregateError(
      [cause, failureError],
      `unable to restore authoritative Check Run ${checkRunId} to failure`,
    );
  }
}

async function restoreFailureOrRecoverSuccess({
  github,
  owner,
  repo,
  checkRunId,
  safePayload,
  candidateSha,
  safeExternalId,
  finalExpected,
  cause,
}) {
  try {
    const fetched = await fetchCheckRun(github, owner, repo, checkRunId);
    if (matchesCanonicalState(fetched, { ...finalExpected, checkRunId })) return fetched;
    if (
      matchesCanonicalState(fetched, {
        checkRunId,
        candidateSha,
        conclusion: "failure",
        externalId: safeExternalId,
      })
    ) {
      throw cause;
    }
  } catch (confirmationError) {
    if (confirmationError === cause) throw cause;
    // The final PATCH outcome remains ambiguous; force the known ID back to failure below.
  }

  const completedAt = completedAtNow();
  try {
    const response = await github.rest.checks.update({
      ...safePayload,
      check_run_id: checkRunId,
      completed_at: completedAt,
    });
    validateSafeMutation(response, {
      checkRunId,
      candidateSha,
      conclusion: "failure",
      externalId: safeExternalId,
      completedAt,
    });
    throw cause;
  } catch (restoreError) {
    if (restoreError === cause) throw cause;
    try {
      const fetched = await fetchCheckRun(github, owner, repo, checkRunId);
      if (matchesCanonicalState(fetched, { ...finalExpected, checkRunId })) return fetched;
      if (
        matchesCanonicalState(fetched, {
          checkRunId,
          candidateSha,
          conclusion: "failure",
          externalId: safeExternalId,
        })
      ) {
        throw cause;
      }
    } catch (confirmationError) {
      if (confirmationError === cause) throw cause;
    }
    throw new AggregateError(
      [cause, restoreError],
      `unable to confirm success or restore authoritative Check Run ${checkRunId} to failure`,
    );
  }
}

function verifyUpdateCompatibility(existing, incoming, existingExternalId, incomingExternalId) {
  if (existing.workflowId !== incoming.workflowId) {
    throw new Error("verifier workflow id differs from canonical Check Run provenance");
  }
  if (existing.runId !== incoming.runId) {
    throw new Error("verifier run id differs from canonical Check Run provenance");
  }
  if (incoming.runAttempt < existing.runAttempt) {
    throw new Error(
      `verifier run attempt ${incoming.runAttempt} is older than canonical attempt ${existing.runAttempt}`,
    );
  }
  if (incoming.runAttempt === existing.runAttempt) {
    if (incomingExternalId !== existingExternalId) {
      throw new Error(
        "identical verifier run and attempt conflicts with canonical provenance or conclusion",
      );
    }
    return "unchanged";
  }
  return "update";
}

function manualUpdateCompatibility(existing, incoming, existingExternalId, incomingExternalId) {
  if (existing.actor !== incoming.actor) {
    throw new Error("manual actor differs from canonical Check Run provenance");
  }
  if (existing.pullNumber !== incoming.pullNumber) {
    throw new Error("manual pull number differs from canonical Check Run provenance");
  }
  if (existing.auditedBaseSha !== incoming.auditedBaseSha) {
    throw new Error("manual audited base differs from canonical Check Run provenance");
  }
  return incomingExternalId === existingExternalId ? "unchanged" : "update";
}

export async function upsertPhase0GateCheck({
  github,
  owner,
  repo,
  candidateSha,
  conclusion,
  detailsUrl,
  title,
  summary,
  source,
}) {
  if (
    !github?.rest?.checks ||
    typeof github.rest.checks.create !== "function" ||
    typeof github.rest.checks.update !== "function" ||
    typeof github.rest.checks.get !== "function" ||
    typeof github.paginate !== "function"
  ) {
    throw new Error("missing Checks API client");
  }
  if (typeof owner !== "string" || owner.length === 0) throw new Error("invalid repository owner");
  if (typeof repo !== "string" || repo.length === 0) throw new Error("invalid repository name");
  exactSha(candidateSha, "candidate SHA");
  if (!["success", "failure"].includes(conclusion)) throw new Error("invalid gate conclusion");
  if (typeof detailsUrl !== "string" || !detailsUrl.startsWith("https://github.com/")) {
    throw new Error("invalid gate details URL");
  }
  if (typeof title !== "string" || title.length === 0 || title.length > 255) {
    throw new Error("invalid gate title");
  }
  if (typeof summary !== "string" || summary.length === 0 || summary.length > 65535) {
    throw new Error("invalid gate summary");
  }

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
  const authoritative = listed.filter(
    (run) =>
      run?.name === PHASE0_GATE_NAME &&
      run?.head_sha === candidateSha &&
      run?.app?.id === PHASE0_GATE_APP_ID,
  );
  if (authoritative.length > 1) {
    const unresolved = [];
    for (const run of authoritative) {
      try {
        await quarantineDuplicateCheckRun({
          github,
          owner,
          repo,
          candidateSha,
          detailsUrl,
          checkRunId: run.id,
        });
      } catch (error) {
        unresolved.push({ id: run.id, error });
      }
    }
    if (unresolved.length > 0) {
      throw new AggregateError(
        unresolved.map(({ error }) => error),
        `unable to quarantine duplicate authoritative Check Run IDs: ${unresolved.map(({ id }) => id).join(", ")}`,
      );
    }
    throw new Error(
      `ambiguous authoritative ${PHASE0_GATE_NAME} Check Runs for ${candidateSha}: ${authoritative.map((run) => run.id).join(", ")}`,
    );
  }

  const existing = authoritative[0];
  if (existing && isCanonicalQuarantine(existing, candidateSha)) {
    throw new Error(
      "candidate SHA is quarantined and cannot be re-authorized; move the PR to a fresh head SHA",
    );
  }
  let quarantined = false;
  if (existing?.conclusion === "success") {
    const quarantineExternalId = quarantineProvenanceFor(candidateSha);
    const quarantinePayload = quarantinePayloadFor(owner, repo, candidateSha, detailsUrl);
    const completedAt = completedAtNow();
    try {
      const response = await github.rest.checks.update({
        ...quarantinePayload,
        check_run_id: existing.id,
        completed_at: completedAt,
      });
      validateSafeMutation(response, {
        checkRunId: existing.id,
        candidateSha,
        conclusion: "failure",
        externalId: quarantineExternalId,
        completedAt,
      });
    } catch (cause) {
      await ensureFailureBeforeThrow({
        github,
        owner,
        repo,
        checkRunId: existing.id,
        safePayload: quarantinePayload,
        candidateSha,
        safeExternalId: quarantineExternalId,
        cause,
      });
    }
    quarantined = true;
  }

  const normalizedSource = normalizeSource(source);
  const finalExternalId = provenanceFor(candidateSha, conclusion, normalizedSource);
  const safeExternalId = provenanceFor(candidateSha, "failure", normalizedSource);

  const finalPayload = {
    owner,
    repo,
    name: PHASE0_GATE_NAME,
    status: "completed",
    conclusion,
    details_url: detailsUrl,
    external_id: finalExternalId,
    output: { title, summary },
  };
  const safePayload = {
    ...finalPayload,
    conclusion: "failure",
    external_id: safeExternalId,
    output: {
      title: conclusion === "failure" ? title : "Phase 0 authorization pending",
      summary:
        conclusion === "failure"
          ? summary
          : `Safe failure state established before final authorization.\n${summary}`,
    },
  };

  let checkRunId;
  let operation;
  if (authoritative.length === 0) {
    const completedAt = completedAtNow();
    const response = await github.rest.checks.create({
      ...safePayload,
      head_sha: candidateSha,
      completed_at: completedAt,
    });
    const checkRun = validateSafeMutation(response, {
      candidateSha,
      conclusion: "failure",
      externalId: safeExternalId,
      completedAt,
    });
    checkRunId = checkRun.id;
    operation = "created";
  } else {
    const existingSource = validateExistingProvenance(existing, candidateSha);
    if (existingSource.kind !== normalizedSource.kind) {
      throw new Error("trusted decision source kind differs from canonical Check Run provenance");
    }
    const compatibility =
      normalizedSource.kind === "verify"
        ? verifyUpdateCompatibility(
            existingSource,
            normalizedSource,
            existing.external_id,
            finalExternalId,
          )
        : manualUpdateCompatibility(
            existingSource,
            normalizedSource,
            existing.external_id,
            finalExternalId,
          );
    if (compatibility === "unchanged" && !quarantined) {
      return {
        operation: "unchanged",
        checkRunId: existing.id,
        externalId: existing.external_id,
      };
    }
    const completedAt = completedAtNow();
    let checkRun;
    try {
      const response = await github.rest.checks.update({
        ...safePayload,
        check_run_id: existing.id,
        completed_at: completedAt,
      });
      checkRun = validateSafeMutation(response, {
        checkRunId: existing.id,
        candidateSha,
        conclusion: "failure",
        externalId: safeExternalId,
        completedAt,
      });
    } catch (cause) {
      await ensureFailureBeforeThrow({
        github,
        owner,
        repo,
        checkRunId: existing.id,
        safePayload,
        candidateSha,
        safeExternalId,
        cause,
      });
    }
    checkRunId = checkRun.id;
    operation = "updated";
  }

  if (conclusion === "failure") {
    return { operation, checkRunId, externalId: safeExternalId };
  }

  const completedAt = completedAtNow();
  const finalExpected = {
    candidateSha,
    conclusion: "success",
    externalId: finalExternalId,
  };
  let response;
  try {
    response = await github.rest.checks.update({
      ...finalPayload,
      check_run_id: checkRunId,
      completed_at: completedAt,
    });
  } catch (cause) {
    const recovered = await restoreFailureOrRecoverSuccess({
      github,
      owner,
      repo,
      checkRunId,
      safePayload,
      candidateSha,
      safeExternalId,
      finalExpected,
      cause,
    });
    return { operation, checkRunId: recovered.id, externalId: finalExternalId };
  }

  try {
    const confirmed = await confirmFinalSuccess(
      github,
      owner,
      repo,
      checkRunId,
      finalExpected,
      response,
    );
    if (confirmed) return { operation, checkRunId: confirmed.id, externalId: finalExternalId };
    throw new Error("final success Check Run response could not be confirmed");
  } catch (cause) {
    const recovered = await restoreFailureOrRecoverSuccess({
      github,
      owner,
      repo,
      checkRunId,
      safePayload,
      candidateSha,
      safeExternalId,
      finalExpected,
      cause,
    });
    return { operation, checkRunId: recovered.id, externalId: finalExternalId };
  }
}
