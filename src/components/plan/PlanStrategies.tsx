/**
 * Strategies workspace.
 *
 * Every number shown here came back from a real engine re-run of the same
 * plan under a different withdrawal order. React only subtracts two
 * engine-produced metric objects so a difference can be displayed.
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { compareStrategiesFn, runScenarioFn } from "@/lib/plans.functions";
import type { PlanDraft } from "@/lib/planning/draft";
import type { ScenarioPatch, StrategyCard } from "@/lib/planning/scenario";
import { money, perMonth } from "@/lib/planning/units";
import {
  ComparisonTable,
  CompareChart,
  DeltaChip,
  METRICS,
  YearLedger,
} from "@/components/plan/scenario-ui";
import {
  AdviceGateDisclosure,
  combinePresentedAdviceGates,
} from "@/components/plan/ProjectionValidityDisclosure";

export function StrategiesWorkspace({
  draft,
  patch,
  onApplyToScenario,
}: {
  draft: PlanDraft;
  patch: ScenarioPatch;
  onApplyToScenario: (p: ScenarioPatch) => void;
}) {
  const compare = useServerFn(compareStrategiesFn);
  const runOne = useServerFn(runScenarioFn);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["strategy-comparison", draft],
    queryFn: () => compare({ data: { draft } }),
  });

  const preview = useMutation({
    mutationFn: (p: ScenarioPatch) => runOne({ data: { draft, patch: p } }),
  });

  if (q.isPending) return <p className="text-muted-foreground">Running every withdrawal order…</p>;
  if (!q.data) return <p className="text-destructive">The comparison could not be run.</p>;

  const { current, cards, adviceGate, autoRule, currentSeries } = q.data;
  const chipKeys = ["lifetimeTax", "estate", "sustainable", "shortfallYears"];
  const currentSelectionWithheld = current.metrics.autoSelectionStatus === "WITHHELD";
  const previewAdviceGate = preview.data
    ? combinePresentedAdviceGates([current.adviceGate, preview.data.adviceGate])
    : undefined;

  return (
    <div className="space-y-8">
      <AdviceGateDisclosure gate={adviceGate} title="Strategy comparison withheld" />
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">
            {currentSelectionWithheld
              ? "Automatic selection withheld"
              : current.metrics.autoSelected
                ? "Current Auto selection"
                : "Current withdrawal order"}
            <Badge variant="secondary" className="ml-2">
              {current.label}
            </Badge>
          </CardTitle>
          <p className="flex gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            {currentSelectionWithheld
              ? current.metrics.autoSelectionNote
              : current.metrics.autoSelected
                ? autoRule
                : "You chose this order yourself. The cards below re-run the same plan under each supported order."}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Lifetime tax" value={money(current.metrics.lifetimeTax)} />
          <Stat label="Estate after income tax" value={money(current.metrics.afterTaxEstate)} />
          <Stat
            label="Funding"
            value={
              current.metrics.shortfallYears === 0
                ? "Funded every year"
                : `${current.metrics.shortfallYears} short years, from age ${current.metrics.firstShortfallAge}`
            }
          />
          <Stat
            label="Sustainable retirement spending"
            value={perMonth(current.metrics.sustainableSpend)}
          />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg">Supported withdrawal orders</h3>
          <p className="text-sm text-muted-foreground">
            {adviceGate.adviceWithheld
              ? "Each card is its own full re-run. Raw figures remain visible for context; rankings, favourable comparisons and differences are withheld."
              : "Each card is its own full re-run. Differences are shown against your current run — no card is labelled optimal, because lifetime tax, estate and spending capacity are different objectives."}
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {cards.map((c) => (
            <StrategyCardView
              key={String(c.key)}
              card={c}
              current={current}
              chipKeys={chipKeys}
              busy={preview.isPending && previewKey === String(c.key)}
              adviceWithheld={adviceGate.adviceWithheld}
              onPreview={() => {
                setPreviewKey(String(c.key));
                preview.mutate({ ...patch, strategy: c.key });
              }}
            />
          ))}
        </div>
      </section>

      {preview.data ? (
        <section className="space-y-4">
          <h3 className="text-lg">Preview</h3>
          {previewAdviceGate ? (
            <AdviceGateDisclosure
              gate={previewAdviceGate}
              title="Strategy preview comparison withheld"
            />
          ) : null}
          <Card>
            <CardContent className="p-0">
              <ComparisonTable
                left={current.metrics}
                right={preview.data.metrics}
                leftLabel="Current"
                rightLabel="Previewed"
                adviceGate={previewAdviceGate}
              />
            </CardContent>
          </Card>
          {!previewAdviceGate?.adviceWithheld ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Total portfolio over time</CardTitle>
              </CardHeader>
              <CardContent>
                <CompareChart
                  baseline={currentSeries}
                  scenario={preview.data.series}
                  baselineLabel="Current"
                  scenarioLabel="Previewed"
                />
              </CardContent>
            </Card>
          ) : null}
          <YearLedger output={preview.data.output} title="Previewed run — year by year" />
          {!previewAdviceGate?.adviceWithheld ? (
            <Button
              onClick={() =>
                onApplyToScenario({
                  ...patch,
                  strategy: preview.data!.metrics.strategy,
                })
              }
            >
              Apply to scenario
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Your baseline plan is untouched. Applying here only updates the working scenario used on
            the What if page.
          </p>
        </section>
      ) : null}
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

function StrategyCardView({
  card,
  current,
  chipKeys,
  busy,
  adviceWithheld,
  onPreview,
}: {
  card: StrategyCard;
  current: StrategyCard;
  chipKeys: string[];
  busy: boolean;
  adviceWithheld: boolean;
  onPreview: () => void;
}) {
  const specs = METRICS.filter((s) => chipKeys.includes(s.key));
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">
          {card.label}
          {card.current ? (
            <Badge variant="secondary" className="ml-2">
              In use
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid gap-2 text-sm">
          {specs.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{s.label}</dt>
              <dd className="flex items-center gap-2">
                <span className="tabular">{s.value(card.metrics)}</span>
                {card.current ? null : (
                  <DeltaChip
                    spec={s}
                    delta={s.raw(card.metrics) - s.raw(current.metrics)}
                    withheld={adviceWithheld}
                  />
                )}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Ending assets</dt>
            <dd className="tabular">{money(card.metrics.endingAssets)}</dd>
          </div>
        </dl>
        <Button variant="outline" size="sm" onClick={onPreview} disabled={busy || adviceWithheld}>
          {adviceWithheld ? "Preview unavailable" : busy ? "Running…" : "Preview"}
        </Button>
      </CardContent>
    </Card>
  );
}
