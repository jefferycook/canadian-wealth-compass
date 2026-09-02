import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdviceGatePayload } from "@/lib/planning/advice-gate";
import type { PlanOutput } from "@/lib/planning/summary";
import type { ValidityReason } from "@/lib/planning/types";

type ProjectionValidity = Pick<PlanOutput, "validity" | "validityReasons">;

/** Presentation-only deduplication; the engine remains the source of each reason. */
export function uniqueValidityReasons(reasons: readonly ValidityReason[]): ValidityReason[] {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    if (seen.has(reason.code)) return false;
    seen.add(reason.code);
    return true;
  });
}

/** Presentation-only union of server-owned per-run gates. */
export function combinePresentedAdviceGates(
  gates: readonly (AdviceGatePayload | undefined)[],
): AdviceGatePayload {
  const present = gates.filter((gate): gate is AdviceGatePayload => gate != null);
  const adviceBlockers = [...new Set(present.flatMap((gate) => gate.adviceBlockers))];
  const adviceReasons = uniqueValidityReasons(present.flatMap((gate) => gate.adviceReasons));
  return {
    adviceWithheld: present.some((gate) => gate.adviceWithheld),
    adviceBlockers,
    adviceReasons,
  };
}

/** Shared limitation shown wherever projection-derived advice is suppressed. */
export function AdviceGateDisclosure({
  gate,
  title = "Projection-derived advice withheld",
}: {
  gate: AdviceGatePayload;
  title?: string;
}) {
  if (!gate.adviceWithheld) return null;

  return (
    <Card className="border-destructive/50" data-advice-withheld="true">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm font-medium">
          These projection figures are available for context, but they are not advice-grade.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {uniqueValidityReasons(gate.adviceReasons).map((reason) => (
          <p key={reason.code}>{reason.detail}</p>
        ))}
      </CardContent>
    </Card>
  );
}

/** Automatic-selection status is result-level and intentionally not validity. */
export function AutoSelectionDisclosure({
  output,
}: {
  output: Pick<PlanOutput, "autoSelectionStatus" | "autoSelectionNote">;
}) {
  if (!output.autoSelectionStatus) return null;

  const withheld = output.autoSelectionStatus === "WITHHELD";
  return (
    <Card
      className={withheld ? "border-destructive/50" : undefined}
      data-auto-selection-status={output.autoSelectionStatus}
    >
      <CardHeader>
        <CardTitle className="text-base">
          {withheld ? "Automatic selection withheld" : "Automatic selection limitation"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {output.autoSelectionNote ? <p>{output.autoSelectionNote}</p> : null}
      </CardContent>
    </Card>
  );
}

/**
 * The one shared validity surface for projection-derived results. It receives
 * only engine-produced validity metadata and therefore cannot re-derive legal
 * or model status from client inputs.
 */
export function ProjectionValidityDisclosure({ output }: { output: ProjectionValidity }) {
  if (output.validity === "OK") return null;

  const reasons = uniqueValidityReasons(output.validityReasons);
  const withheld = output.validity === "WITHHELD";

  return (
    <Card
      className={withheld ? "border-destructive/50" : undefined}
      data-projection-validity={output.validity}
    >
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Projection limitations</CardTitle>
        <p className="text-sm font-medium">
          {withheld
            ? "Withheld — these figures are not fit for use."
            : "Approximate — review these limitations before using the figures."}
        </p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {reasons.map((reason) => (
          <p key={reason.code}>{reason.detail}</p>
        ))}
      </CardContent>
    </Card>
  );
}
