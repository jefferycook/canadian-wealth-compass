import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { money } from "@/components/plan/fields";
import type {
  GoalProgress,
  NetWorthView,
  Recommendation,
  StrategyRow,
} from "@/lib/planning/analysis";

const compact = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}k`;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
        {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function NetWorthPanel({ view }: { view: NetWorthView }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Net worth today"
          value={money(view.today.netWorth)}
          note={`Age ${view.today.age}`}
        />
        <Stat
          label="Projected peak"
          value={money(view.peak.netWorth)}
          note={`At age ${view.peak.age}`}
        />
        <Stat
          label="At the end of the plan"
          value={money(view.final.netWorth)}
          note={`Age ${view.final.age}, before tax on death`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Net worth over time</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={view.series} margin={{ left: 8, right: 8 }}>
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
              <Area
                type="monotone"
                dataKey="property"
                name="Property & other assets"
                stackId="1"
                stroke="var(--chart-4)"
                fill="var(--chart-4)"
                fillOpacity={0.5}
              />
              <Line
                type="monotone"
                dataKey="netWorth"
                name="Net worth"
                stroke="var(--foreground)"
                dot={false}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What makes up your net worth today</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Registered savings (RRSP, RRIF, LIRA, LIF)", view.today.registered],
                ["TFSA", view.today.tfsa],
                ["Non-registered investments", view.today.nonreg],
                ["Property and other assets", view.today.property],
                ["Debt", -view.today.debt],
              ].map(([label, amount]) => (
                <tr key={label as string} className="border-t">
                  <td className="p-3">{label}</td>
                  <td className="tabular p-3 text-right">{money(amount as number)}</td>
                </tr>
              ))}
              <tr className="border-t bg-secondary font-medium">
                <td className="p-3">Net worth</td>
                <td className="tabular p-3 text-right">{money(view.today.netWorth)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function StrategyPanel({ rows }: { rows: StrategyRow[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The same plan, run once for every withdrawal order. Ranked by the years that fall short
        first, then by what is left after tax.
      </p>
      <Card>
        <CardContent className="overflow-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="p-3 font-medium">Withdrawal order</th>
                <th className="p-3 text-right font-medium">Years short</th>
                <th className="p-3 text-right font-medium">Spending funded to</th>
                <th className="p-3 text-right font-medium">Lifetime tax</th>
                <th className="p-3 text-right font-medium">OAS lost</th>
                <th className="p-3 text-right font-medium">Estate after tax</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="p-3">
                    {r.label}
                    {r.chosen ? (
                      <Badge variant="secondary" className="ml-2">
                        In use
                      </Badge>
                    ) : null}
                  </td>
                  <td
                    className={
                      "tabular p-3 text-right " + (r.shortfallYears > 0 ? "text-destructive" : "")
                    }
                  >
                    {r.shortfallYears}
                  </td>
                  <td className="tabular p-3 text-right">
                    {r.firstShortfallAge == null ? "Full plan" : `Age ${r.firstShortfallAge}`}
                  </td>
                  <td className="tabular p-3 text-right">{money(r.lifetimeTax)}</td>
                  <td className="tabular p-3 text-right">{money(r.oasClawback)}</td>
                  <td className="tabular p-3 text-right">
                    {money(r.afterTaxEstate)}
                    {r.estateDelta !== 0 ? (
                      <span
                        className={
                          "ml-2 text-xs " +
                          (r.estateDelta > 0 ? "text-primary" : "text-muted-foreground")
                        }
                      >
                        {r.estateDelta > 0 ? "+" : ""}
                        {money(r.estateDelta)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Change the order under Assumptions, or leave it on automatic to keep the best one.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function RecommendationsPanel({ items }: { items: Recommendation[] }) {
  const icon = (s: Recommendation["severity"]) =>
    s === "high" ? (
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
    ) : s === "medium" ? (
      <Lightbulb className="mt-0.5 size-5 shrink-0 text-primary" />
    ) : (
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
    );

  return (
    <div className="space-y-4">
      {items.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex gap-3 pt-6">
            {icon(r.severity)}
            <div className="space-y-1">
              <p className="font-medium">{r.title}</p>
              <p className="text-sm text-muted-foreground">{r.detail}</p>
              {r.impact ? <p className="text-sm font-medium">{r.impact}</p> : null}
            </div>
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">
        These are generated from your own numbers, not general advice, and they are not a
        substitute for tax or legal advice.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function GoalPanel({ goal }: { goal: GoalProgress }) {
  const pct = Math.round(Math.min(1, goal.fundedRatio) * 100);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {goal.onTrack ? "You are on track" : "There is a gap to close"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={pct} />
          <p className="text-sm text-muted-foreground">
            {goal.onTrack
              ? `Your savings cover the plan with room to spare — about ${pct}% of what is strictly needed is already in place.`
              : `You hold roughly ${pct}% of the capital this plan needs today. The shortfall is about ${money(Math.max(0, goal.requiredToday - goal.currentSavings))}.`}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Saved today"
          value={money(goal.currentSavings)}
          note="Across every investment account"
        />
        <Stat
          label="Needed today"
          value={money(goal.requiredToday)}
          note="To fund every year of the plan"
        />
        <Stat
          label="Savings at retirement"
          value={money(goal.projectedAtRetirement)}
          note={
            goal.retirementAge != null
              ? `Projected at age ${goal.retirementAge}`
              : "No retirement age set"
          }
        />
        <Stat
          label="Years to retirement"
          value={goal.yearsToRetirement == null ? "—" : String(goal.yearsToRetirement)}
          note={goal.firstShortfallAge != null ? `First shortfall at ${goal.firstShortfallAge}` : ""}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where retirement income comes from</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Spending target in the first year of retirement</span>
            <span className="tabular">{money(goal.annualSpendTarget)}</span>
          </div>
          <div className="flex justify-between">
            <span>CPP, OAS and workplace pensions</span>
            <span className="tabular">{money(goal.guaranteedIncomeAtRetirement)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-medium">
            <span>Left for your savings to cover</span>
            <span className="tabular">
              {money(Math.max(0, goal.annualSpendTarget - goal.guaranteedIncomeAtRetirement))}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
