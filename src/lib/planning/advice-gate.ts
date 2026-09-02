/**
 * Server-owned presentation gate for projection-derived advice.
 *
 * The component registry remains the only status authority. Client code gets
 * this small payload and never attempts to infer legal or model status from
 * plan inputs.
 */

import {
  adviceBlockers,
  ComponentStatusTracker,
  type ComponentId,
  type ComponentStatusEntry,
  type ValidityReason,
} from "./types";

export interface AdviceGatePayload {
  adviceWithheld: boolean;
  adviceBlockers: ComponentId[];
  adviceReasons: ValidityReason[];
}

/** Build the authoritative advice gate from the engine's component statuses. */
export function adviceGateFromStatuses(
  statuses: readonly ComponentStatusEntry[],
): AdviceGatePayload {
  const entries = [...statuses];
  const blockers = adviceBlockers(entries);
  const tracker = new ComponentStatusTracker();
  tracker.merge(entries);

  return {
    adviceWithheld: blockers.length > 0,
    adviceBlockers: blockers.map((entry) => entry.component),
    adviceReasons: tracker.reasons(),
  };
}

/** Combine already-authoritative per-run payloads for a comparison surface. */
export function combineAdviceGates(gates: readonly AdviceGatePayload[]): AdviceGatePayload {
  const adviceBlockers = [...new Set(gates.flatMap((gate) => gate.adviceBlockers))];
  const seen = new Set<string>();
  const adviceReasons = gates
    .flatMap((gate) => gate.adviceReasons)
    .filter((reason) => {
      if (seen.has(reason.code)) return false;
      seen.add(reason.code);
      return true;
    });

  return {
    adviceWithheld: gates.some((gate) => gate.adviceWithheld),
    adviceBlockers,
    adviceReasons,
  };
}
