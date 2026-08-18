import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { money } from "@/components/plan/fields";
import { strategyLabel, type PlanOutput } from "@/lib/planning/summary";

const compact = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}k`;

function Stat({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  note?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p
          className={
            "tabular mt-1 text-2xl font-semibold " +
            (tone === "bad" ? "text-destructive" : tone === "good" ? "text-primary" : "")
          }
        >
          {value}
        </p>
        {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

export function PlanResults({ output }: { output: PlanOutput }) {
  const { summary, chart } = output;
  const lasts = summary.depletionAge == null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Money lasts to"
          value={lasts ? `Age ${summary.endAge}+` : `Age ${summary.depletionAge}`}
          tone={lasts ? "good" : "bad"}
          note={
            lasts
              ? "Your plan funds every year of the projection."
              : "Savings run out before the end of the projection."
          }
        />
        <Stat label="Lifetime tax" value={money(summary.lifetimeTax)} />
        <Stat
          label="OAS clawed back"
          value={money(summary.lifetimeOasClawback)}
          note={
            summary.lifetimeOasClawback > 0
              ? "Recovery tax triggered in at least one year."
              : "No recovery tax in any year."
          }
        />
        <Stat
          label="Estate after tax"
          value={money(summary.afterTaxEstate)}
          note={`At age ${summary.endAge}, net of tax on death.`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Withdrawal order used: {strategyLabel(summary.strategy)}
            {summary.autoSelected ? " (chosen automatically)" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {summary.shortfallYears > 0
            ? `The plan falls short of your spending target in ${summary.shortfallYears} year${summary.shortfallYears === 1 ? "" : "s"}. Try retiring later, spending less, or starting CPP later.`
            : "Every year of the projection funds your spending target in full."}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where your money sits, year by year</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="age" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickFormatter={compact} tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip
                formatter={(v: number, n: string) => [money(v), n]}
                labelFormatter={(l) => `Age ${l}`}
              />
              <Area
                type="monotone"
                dataKey="registered"
                name="Registered"
                stackId="1"
                stroke="var(--chart-1)"
                fill="var(--chart-1)"
                fillOpacity={0.7}
              />
              <Area
                type="monotone"
                dataKey="nonreg"
                name="Non-registered"
                stackId="1"
                stroke="var(--chart-2)"
                fill="var(--chart-2)"
                fillOpacity={0.7}
              />
              <Area
                type="monotone"
                dataKey="tfsa"
                name="TFSA"
                stackId="1"
                stroke="var(--chart-3)"
                fill="var(--chart-3)"
                fillOpacity={0.7}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spending funded vs. target</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="age" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={compact} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip
                  formatter={(v: number, n: string) => [money(v), n]}
                  labelFormatter={(l) => `Age ${l}`}
                />
                <Line
                  type="monotone"
                  dataKey="spendTarget"
                  name="Target"
                  stroke="var(--chart-4)"
                  dot={false}
                  strokeDasharray="4 4"
                />
                <Line
                  type="monotone"
                  dataKey="afterTax"
                  name="Funded"
                  stroke="var(--chart-1)"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tax paid each year</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="age" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={compact} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip
                  formatter={(v: number) => money(v)}
                  labelFormatter={(l) => `Age ${l}`}
                />
                <Bar dataKey="tax" name="Tax" fill="var(--chart-2)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Year-by-year detail</CardTitle>
        </CardHeader>
        <CardContent className="max-h-96 overflow-auto p-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-secondary text-left">
              <tr>
                <th className="p-3 font-medium">Age</th>
                <th className="p-3 font-medium">Year</th>
                <th className="p-3 text-right font-medium">Portfolio</th>
                <th className="p-3 text-right font-medium">Spending funded</th>
                <th className="p-3 text-right font-medium">Tax</th>
                <th className="p-3 text-right font-medium">Net worth</th>
              </tr>
            </thead>
            <tbody>
              {chart.map((r) => (
                <tr key={r.age} className="border-t">
                  <td className="p-3">{r.age}</td>
                  <td className="p-3">{r.year}</td>
                  <td className="tabular p-3 text-right">{money(r.portfolio)}</td>
                  <td
                    className={
                      "tabular p-3 text-right " + (r.shortfall > 1 ? "text-destructive" : "")
                    }
                  >
                    {money(r.afterTax)}
                  </td>
                  <td className="tabular p-3 text-right">{money(r.tax)}</td>
                  <td className="tabular p-3 text-right">{money(r.netWorth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
