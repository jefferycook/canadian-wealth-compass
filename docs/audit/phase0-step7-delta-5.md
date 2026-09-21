# Phase 0 Step 7 Delta 5 — production evidence repairs

## P12 ruleset evidence

GitHub omits `bypass_actors` from Ruleset A and Ruleset B when the caller lacks
ruleset write authority. An omitted value is recorded as `REDACTED`; it is never
interpreted as an empty list.

The full bypass configurations are independently owner/admin-attested in the
captured fixtures for exact Ruleset IDs and versions. Production P12 binds its
low-privilege view to those attestations by requiring the same normalized
`updated_at` instants, exact repository-owned metadata, `current_user_can_bypass
== "never"`, and the exact effective rules applied to `refs/heads/main`.
Runtime evidence records the admin attestation identity/version and a hash of
the production-visible metadata plus effective-rule projection.

If `bypass_actors` is visible, P12 validates it exactly. Ruleset A must expose no
bypass actors. Ruleset B must expose only Integration `4915565` in
`pull_request` mode. Unknown rule types, owners, sources, duplicates, or
parameters—including new pull-request parameters—fail closed until audited.

No Administration-write credential is added to the workflow. The exact-SHA,
Gate App, and Merger App authority separation is unchanged.

After P1-P13 and Merger App token minting, but before the merge PUT, the live
Merger App view must report `current_user_can_bypass` as `never` for Ruleset A
and `pull_requests_only` for Ruleset B at the exact admin-attested `updated_at`
versions. These supplemental read-only checks do not require `bypass_actors` to
be visible, and they do not replace the admin attestation or production-reader
predicates. A mismatch fails closed before any merge PUT.

## I7 Git working directory

The independent merge verifier now requires `--repo <directory>`, validates
that it names the Git working-tree root, and executes every Git subprocess in
that directory. The workflow passes `--repo phase0-trusted-source` explicitly.

## I6 rule-suite evidence

Rule-suite lookup uses the captured production fields `after_sha`, `actor_id`,
and `actor_name`. An exact suite must identify the Merger App and report `pass`
or `bypass`; contradictory exact evidence still fails closed. Endpoint
unavailability or absence after bounded retries is recorded as unavailable and
does not invalidate an already-proven merge because I6 remains optional,
non-authoritative post-merge evidence.
