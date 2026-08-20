/**
 * Shared presentation pieces for the scenario workspaces.
 *
 * These components display numbers the engine returned. The only arithmetic
 * here is subtracting two engine-produced metric objects so a difference can
 * be shown — no financial value is derived in React.
 */

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { money, monthlyDisplay, perMonth } from "@/lib/planning/units";
import type { ScenarioMetrics, ScenarioSeriesPoint } from "@/lib/planning/scenario";
import type { PlanOutput } from "@/lib/planning/summary";

export const compact = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}k`;

/** Metric rows shared by every comparison surface. "better" drives colour only. */
export interface MetricSpec {
  key: string;
  label: string;
  /** Formatted display value. */
  value: (m: ScenarioMetrics) => string;
  /** Raw comparable number, for the difference chip. */
  raw: (m: ScenarioMetrics) => number;
  /** Which direction is favourable for this objective. */
  better: "up" | "down";
  /** How to render a difference. */
  format: (n: number) => string;
  unit?: string;
}

export const METRICS: MetricSpec[] = [
  {
    key: "fundedToAge",
    label: "Spending funded to",
    value: (m) => (m.firstShortfallAge == null ? `Age ${m.fundedToAge}+` : `Age ${m.fundedToAge}`),
    raw: (m) => m.fundedToAge,
    better: "up",
    format: (n) => `${n > 0 ? "+" : ""}${n} yrs`,
  },
  {
    key: "sustainable",
    label: "Sustainable retirement spending",
    value: (m) => perMonth(m.sustainableSpend),
    raw: (m) => monthlyDisplay(m.sustainableSpend),
    better: "up",
    format: (n) => `${n > 0 ? "+" : ""}${money(n)} / month`,
  },
  {
    key: "portfolioAtRetirement",
    label: "Portfolio at retirement",
    value: (m) => money(m.portfolioAtRetirement),
    raw: (m) => m.portfolioAtRetirement,
    better: "up",
    format: (n) => `${n > 0 ? "+" : ""}${money(n)}`,
  },
  {
    key: "lifetimeTax",
    label: "Lifetime tax",
    value: (m) => money(m.lifetimeTax),
    raw: (m) => m.lifetimeTax,
    better: "down",
    format: (n) => `${n > 0 ? "+" : ""}${money(n)}`,
  },
  {
    key: "estate",
    label: "Estate after income tax",
    value: (m) => money(m.afterTaxEstate),
    raw: (m) => m.afterTaxEstate,
    better: "up",
    format: (n) => `${n > 0 ? "+" : ""}${money(n)}`,
  },
  {
    key: "shortfallYears",
    label: "Years not fully funded",
    value: (m) => String(m.shortfallYears),
    raw: (m) => m.shortfallYears,
    better: "down",
    format: (n) => `${n > 0 ? "+" : ""}${n} yrs`,
  },
  {
    key: "endingAssets",
    label: "Ending assets",
    value: (m) => money(m.endingAssets),
    raw: (m) => m.endingAssets,
    better: "up",
    format: (n) => `${n > 0 ? "+" : ""}${money(n)}`,
  },
];

export function DeltaChip({ spec, delta }: { spec: MetricSpec; delta: number }) {
  if (Math.round(delta) === 0) return <Badge variant="secondary">No change</Badge>;
  const good = spec.better === "up" ? delta > 0 : delta < 0;
  return (
    <Badge variant={good ? "default" : "destructive"} className="gap-1 tabular">
      {delta > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {spec.format(Math.round(delta))}
    </Badge>
  );
}

export function MetricStrip({
  metrics,
  baseline,
  keys,
}: {
  metrics: ScenarioMetrics;
  baseline?: ScenarioMetrics | undefined;
  keys?: string[] | undefined;
}) {
  const specs = keys ? METRICS.filter((s) => keys.includes(s.key)) : METRICS;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {specs.map((s) => (
        <Card key={s.key}>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="tabular mt-1 text-xl font-semibold">{s.value(metrics)}</p>
            {baseline ? (
              <div className="mt-2">
                <DeltaChip spec={s} delta={s.raw(metrics) - s.raw(baseline)} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** CURRENT | PROPOSED, straight from two engine runs. */
export function ComparisonTable({
  left,
  right,
  leftLabel = "Current plan",
  rightLabel = "Proposed plan",
}: {
  left: ScenarioMetrics;
  right: ScenarioMetrics;
  leftLabel?: string;
  rightLabel?: string;
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-left">
          <tr>
            <th className="p-3 font-medium">Measure</th>
            <th className="p-3 text-right font-medium">{leftLabel}</th>
            <th className="p-3 text-right font-medium">{rightLabel}</th>
            <th className="p-3 text-right font-medium">Difference</th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((s) => (
            <tr key={s.key} className="border-t">
              <td className="p-3">{s.label}</td>
              <td className="tabular p-3 text-right">{s.value(left)}</td>
              <td className="tabular p-3 text-right">{s.value(right)}</td>
              <td className="p-3 text-right">
                <DeltaChip spec={s} delta={s.raw(right) - s.raw(left)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Two real projection series, overlaid. */
export function CompareChart({
  baseline,
  scenario,
  baselineLabel = "Baseline",
  scenarioLabel = "What if",
  field = "portfolio",
}: {
  baseline: ScenarioSeriesPoint[];
  scenario: ScenarioSeriesPoint[];
  baselineLabel?: string;
  scenarioLabel?: string;
  field?: "portfolio" | "netWorth";
}) {
  const data = baseline.map((b, i) => ({
    age: b.age,
    base: b[field],
    scen: scenario[i]?.[field] ?? null,
  }));
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="age" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} fontSize={12} />
          <Tooltip
            formatter={(v: number, n: string) => [money(v), n]}
            labelFormatter={(l) => `Age ${l}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="base"
            name={baselineLabel}
            stroke="var(--muted-foreground)"
            strokeDasharray="5 4"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="scen"
            name={scenarioLabel}
            stroke="var(--chart-1)"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The engine's own year-by-year ledger, collapsed until asked for. */
export function YearLedger({ output, title = "Year-by-year detail" }: { output: PlanOutput; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Show"} <ChevronDown className={"ml-1 size-4 " + (open ? "rotate-180" : "")} />
        </Button>
      </CardHeader>
      {open ? (
        <CardContent className="max-h-96 overflow-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-secondary text-left">
              <tr>
                <th className="p-2 font-medium">Age</th>
                <th className="p-2 text-right font-medium">Portfolio</th>
                <th className="p-2 text-right font-medium">Spending target / mo</th>
                <th className="p-2 text-right font-medium">Funded / mo</th>
                <th className="p-2 text-right font-medium">Tax</th>
                <th className="p-2 text-right font-medium">Net worth</th>
              </tr>
            </thead>
            <tbody>
              {output.years.map((y) => (
                <tr key={y.age} className={"border-t " + (y.fundingShortfall ? "bg-destructive/10" : "")}>
                  <td className="p-2">{y.age}</td>
                  <td className="tabular p-2 text-right">{money(y.portfolio)}</td>
                  <td className="tabular p-2 text-right">{money(monthlyDisplay(y.spendTarget))}</td>
                  <td className="tabular p-2 text-right">{money(monthlyDisplay(y.afterTax))}</td>
                  <td className="tabular p-2 text-right">{money(y.tax)}</td>
                  <td className="tabular p-2 text-right">{money(y.netWorth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      ) : null}
    </Card>
  );
}
