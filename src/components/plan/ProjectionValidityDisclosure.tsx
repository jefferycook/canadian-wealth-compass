import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
