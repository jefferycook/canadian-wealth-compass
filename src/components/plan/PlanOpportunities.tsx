/**
 * Planning opportunities to test.
 *
 * Cards are grouped by theme, never sorted by dollar impact. Each preview is a
 * real engine re-run of that single change against the baseline draft.
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { planOpportunities, runScenarioFn } from "@/lib/plans.functions";
import type { PlanDraft } from "@/lib/planning/draft";
import type { Opportunity } from "@/lib/planning/opportunities";
import type { ScenarioMetrics, ScenarioPatch } from "@/lib/planning/scenario";
import { money, perMonth } from "@/lib/planning/units";
import { ComparisonTable } from "@/components/plan/scenario-ui";

export function OpportunitiesWorkspace({
  draft,
  baseline,
  patch,
  onApplyToScenario,
}: {
  draft: PlanDraft;
  baseline: ScenarioMetrics | undefined;
  patch: ScenarioPatch;
  onApplyToScenario: (p: ScenarioPatch) => void;
}) {
  const fetchOpps = useServerFn(planOpportunities);
  const q = useQuery({
    queryKey: ["opportunities", draft],
    queryFn: () => fetchOpps({ data: { draft } }),
  });

  if (q.isPending) return <p className="text-muted-foreground">Looking at your plan…</p>;
  if (!q.data) return <p className="text-destructive">Opportunities could not be built.</p>;

  const themes = [...new Set(q.data.map((o) => o.theme))];

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg">Planning opportunities to test</h3>
        <p className="text-sm text-muted-foreground">
          These are changes worth testing, not ranked advice. Lifetime tax, estate, spending
          capacity and timing are different objectives — the largest number is not automatically
          the best choice for you.
        </p>
      </div>

      {baseline ? (
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-4">
            <Stat
              label="Spending funded to"
              value={
                baseline.firstShortfallAge == null
                  ? `Age ${baseline.fundedToAge}+`
                  : `Age ${baseline.fundedToAge}`
              }
            />
            <Stat label="Sustainable spending" value={perMonth(baseline.sustainableSpend)} />
            <Stat label="Lifetime tax" value={money(baseline.lifetimeTax)} />
            <Stat label="Estate after income tax" value={money(baseline.afterTaxEstate)} />
          </CardContent>
        </Card>
      ) : null}

      {themes.map((theme) => (
        <section key={theme} className="space-y-4">
          <h4 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {theme}
          </h4>
          {q.data
            .filter((o) => o.theme === theme)
            .map((o) => (
              <OpportunityCard
                key={o.id}
                opportunity={o}
                draft={draft}
                baseline={baseline}
                patch={patch}
                onApplyToScenario={onApplyToScenario}
              />
            ))}
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        Every figure comes from re-running your own plan. Deltas are shown per objective and are
        never combined into a single score. This is not tax or legal advice.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function OpportunityCard({
  opportunity,
  draft,
  baseline,
  patch,
  onApplyToScenario,
}: {
  opportunity: Opportunity;
  draft: PlanDraft;
  baseline: ScenarioMetrics | undefined;
  patch: ScenarioPatch;
  onApplyToScenario: (p: ScenarioPatch) => void;
}) {
  const runOne = useServerFn(runScenarioFn);
  const [shown, setShown] = useState(false);
  const preview = useMutation({
    mutationFn: (p: ScenarioPatch) => runOne({ data: { draft, patch: p } }),
    onSuccess: () => setShown(true),
  });

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {opportunity.title}
          <Badge variant={opportunity.patch ? "default" : "secondary"}>
            {opportunity.patch ? "Quantified opportunity" : "Informational"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <span className="font-medium">Why this may help: </span>
          <span className="text-muted-foreground">{opportunity.why}</span>
        </p>
        <p>
          <span className="font-medium">Proposed change: </span>
          <span className="text-muted-foreground">{opportunity.change}</span>
        </p>
        <p>
          <span className="font-medium">Trade-offs: </span>
          <span className="text-muted-foreground">{opportunity.tradeoffs}</span>
        </p>

        {opportunity.patch ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              disabled={preview.isPending}
              onClick={() => preview.mutate(opportunity.patch!)}
            >
              {preview.isPending ? "Running…" : "Preview this change"}
            </Button>
            {shown ? (
              <Button size="sm" variant="ghost" onClick={() => setShown(false)}>
                Undo preview
              </Button>
            ) : null}
          </div>
        ) : null}

        {shown && preview.data && baseline ? (
          <div className="space-y-3 pt-2">
            <ComparisonTable
              left={baseline}
              right={preview.data.metrics}
              leftLabel="Current plan"
              rightLabel="Proposed plan"
            />
            <Button
              size="sm"
              onClick={() => onApplyToScenario({ ...patch, ...opportunity.patch })}
            >
              Apply to scenario
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
