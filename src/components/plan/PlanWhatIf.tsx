/**
 * What If workspace.
 *
 * Controls build a serializable ScenarioPatch. The patch is sent to the server
 * and run through the one scenario execution path: baseline, each change on
 * its own, and one combined run. React performs no financial arithmetic.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { simulateScenario } from "@/lib/plans.functions";
import type { PlanDraft } from "@/lib/planning/draft";
import type { ScenarioPatch } from "@/lib/planning/scenario";
import { money, monthlyDisplay, monthlyFromAnnual } from "@/lib/planning/units";
import { CompareChart, DeltaChip, METRICS, MetricStrip, YearLedger } from "@/components/plan/scenario-ui";

const STRATEGY_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto selection" },
  { value: "nonreg_reg_tfsa", label: "Non-registered → Registered → TFSA" },
  { value: "reg_nonreg_tfsa", label: "Registered → Non-registered → TFSA" },
  { value: "tfsa_nonreg_reg", label: "TFSA → Non-registered → Registered" },
  { value: "prorata", label: "Pro-rata across all accounts" },
];

export function WhatIfWorkspace({
  draft,
  patch,
  onChange,
}: {
  draft: PlanDraft;
  patch: ScenarioPatch;
  onChange: (p: ScenarioPatch) => void;
}) {
  const simulate = useServerFn(simulateScenario);
  const [expenseAge, setExpenseAge] = useState(70);

  const baseRetSpend = monthlyFromAnnual(draft.spendNeed) ?? 0;
  const baseCurSpend = monthlyFromAnnual(draft.currentSpend) ?? 0;
  // Mirrors extraSavingTargets() in scenario.ts; kept local so the engine
  // module never reaches the browser bundle. No arithmetic, just a filter.
  const savingOwners = useMemo(
    () =>
      [
        ...new Set(
          draft.accounts
            .filter((a) => a.type === "NONREG")
            .map((a) => a.owner)
            .filter((o): o is "A" | "B" => o === "A" || o === "B"),
        ),
      ],
    [draft.accounts],
  );



  const set = (p: Partial<ScenarioPatch>) => onChange({ ...patch, ...p });

  const q = useQuery({
    queryKey: ["scenario-set", draft, patch],
    queryFn: () => simulate({ data: { draft, patch } }),
  });

  const saleOptions = useMemo(
    () => draft.hardAssets.map((a, i) => ({ i, name: a.name || `Property ${i + 1}` })),
    [draft.hardAssets],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <p className="text-sm">
          <span className="font-medium">Baseline</span>{" "}
          <span className="text-muted-foreground">· Working scenario</span>
        </p>
        <Button variant="outline" size="sm" onClick={() => onChange({})}>
          <RotateCcw className="mr-2 size-4" /> Reset scenario
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ControlCard title="Timing">
          <SliderRow
            label="Retire later (everyone)"
            value={patch.retireDeferYears ?? 0}
            min={0}
            max={10}
            step={1}
            display={(v) => (v === 0 ? "No change" : `+${v} years`)}
            onChange={(v) => set({ retireDeferYears: v })}
          />
          {draft.people.map((p) => {
            const who = draft.people.length > 1 ? `${p.firstName || `Person ${p.id}`} — ` : "";
            return (
              <div key={p.id} className="space-y-5">
                <SliderRow
                  label={`${who}CPP start age`}
                  value={patch.cppAgeByPerson?.[p.id] ?? p.cpp.age ?? 65}
                  min={60}
                  max={70}
                  step={1}
                  display={(v) => `Age ${v}`}
                  onChange={(v) =>
                    set({ cppAgeByPerson: { ...(patch.cppAgeByPerson ?? {}), [p.id]: v } })
                  }
                />
                <SliderRow
                  label={`${who}OAS start age`}
                  value={patch.oasAgeByPerson?.[p.id] ?? p.oas.age ?? 65}
                  min={65}
                  max={70}
                  step={1}
                  display={(v) => `Age ${v}`}
                  onChange={(v) =>
                    set({ oasAgeByPerson: { ...(patch.oasAgeByPerson ?? {}), [p.id]: v } })
                  }
                />
                {p.retAge != null ? (
                  <SliderRow
                    label={`${who}Retirement age`}
                    value={patch.retireAgeByPerson?.[p.id] ?? p.retAge}
                    min={Math.max(45, (p.curAge ?? 45))}
                    max={80}
                    step={1}
                    display={(v) => `Age ${v}`}
                    onChange={(v) =>
                      set({ retireAgeByPerson: { ...(patch.retireAgeByPerson ?? {}), [p.id]: v } })
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </ControlCard>


        <ControlCard title="Spending">
          <SliderRow
            label="Retirement spending"
            value={patch.retSpendMonthly ?? baseRetSpend}
            min={0}
            max={Math.max(2000, Math.round(baseRetSpend * 2))}
            step={100}
            display={(v) => `${money(v)} / month`}
            onChange={(v) => set({ retSpendMonthly: v })}
          />
          <SliderRow
            label="Spending before retirement"
            value={patch.currentSpendMonthly ?? baseCurSpend}
            min={0}
            max={Math.max(2000, Math.round(baseCurSpend * 2))}
            step={100}
            display={(v) => `${money(v)} / month`}
            onChange={(v) => set({ currentSpendMonthly: v })}
          />
          <SliderRow
            label={`One-time future expense at age ${expenseAge}`}
            value={patch.oneTimeExpense?.amt ?? 0}
            min={0}
            max={200000}
            step={5000}
            display={(v) => (v === 0 ? "None" : money(v))}
            onChange={(v) =>
              set({ oneTimeExpense: v > 0 ? { age: expenseAge, amt: v } : null })
            }
          />
          <SliderRow
            label="Age the expense lands"
            value={expenseAge}
            min={50}
            max={95}
            step={1}
            display={(v) => `Age ${v}`}
            onChange={(v) => {
              setExpenseAge(v);
              if (patch.oneTimeExpense)
                set({ oneTimeExpense: { ...patch.oneTimeExpense, age: v } });
            }}
          />
        </ControlCard>

        <ControlCard title="Saving">
          {savingOwners.length > 0 ? (
            <>
              <SliderRow
                label="Extra saving (non-registered)"
                value={patch.extraMonthlySaving ?? 0}
                min={0}
                max={5000}
                step={50}
                display={(v) => (v === 0 ? "No change" : `${money(v)} / month`)}
                onChange={(v) => set({ extraMonthlySaving: v, savingAccount: "NONREG" })}
              />
              {savingOwners.length > 1 ? (
                <div className="space-y-2">
                  <Label>Whose account receives it</Label>
                  <Select
                    value={patch.savingOwner ?? ""}
                    onValueChange={(v) => set({ savingOwner: v as "A" | "B" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an account owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {savingOwners.map((o) => (
                        <SelectItem key={o} value={o}>
                          {draft.people.find((p) => p.id === o)?.firstName || `Person ${o}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(patch.extraMonthlySaving ?? 0) > 0 && !patch.savingOwner ? (
                    <p className="text-xs text-muted-foreground">
                      Both of you have a non-registered account, so choose whose account receives
                      the extra saving. Until you do, this change is not applied.
                    </p>
                  ) : null}
                </div>
              ) : null}

            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This plan has no non-registered account to receive extra saving, so there is nothing
              to test here yet.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Extra TFSA and RRSP saving is temporarily unavailable: the engine does not yet enforce
            contribution room, so a registered result could exceed what you are legally allowed to
            contribute. Only non-registered saving, which has no room limit, is offered for now.
          </p>
        </ControlCard>


        <ControlCard title="Assumptions">
          <SliderRow
            label="Equity return"
            value={Math.round((patch.eqRet ?? draft.eqRet) * 1000) / 10}
            min={0}
            max={12}
            step={0.1}
            display={(v) => `${v.toFixed(1)}%`}
            onChange={(v) => set({ eqRet: v / 100 })}
          />
          <SliderRow
            label="Fixed-income return"
            value={Math.round((patch.fiRet ?? draft.fiRet) * 1000) / 10}
            min={0}
            max={8}
            step={0.1}
            display={(v) => `${v.toFixed(1)}%`}
            onChange={(v) => set({ fiRet: v / 100 })}
          />
          <SliderRow
            label="Investment-return adjustment"
            value={patch.returnAdjustment ?? 0}
            min={-3}
            max={3}
            step={0.1}
            display={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} pp`}
            onChange={(v) => set({ returnAdjustment: v })}
          />
          <p className="text-xs text-muted-foreground">
            The engine models one net return per account, so this is an investment-return
            adjustment — it is not a fee calculation.
          </p>
          <SliderRow
            label="Inflation"
            value={Math.round((patch.inflation ?? draft.inflation) * 1000) / 10}
            min={0}
            max={6}
            step={0.1}
            display={(v) => `${v.toFixed(1)}%`}
            onChange={(v) => set({ inflation: v / 100 })}
          />
        </ControlCard>

        <ControlCard title="Strategy">
          <div className="space-y-2">
            <Label>Withdrawal order</Label>
            <Select
              value={String(patch.strategy ?? draft.strategy)}
              onValueChange={(v) => set({ strategy: v as NonNullable<ScenarioPatch["strategy"]> })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </ControlCard>

        {saleOptions.length > 0 ? (
          <ControlCard title="Property">
            <div className="space-y-2">
              <Label>Sell a property</Label>
              <Select
                value={patch.propertySale ? String(patch.propertySale.index) : "none"}
                onValueChange={(v) =>
                  set({
                    propertySale:
                      v === "none"
                        ? null
                        : { index: Number(v), saleAge: patch.propertySale?.saleAge ?? 75 },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No sale</SelectItem>
                  {saleOptions.map((o) => (
                    <SelectItem key={o.i} value={String(o.i)}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {patch.propertySale ? (
              <SliderRow
                label="Sale age"
                value={patch.propertySale.saleAge}
                min={50}
                max={95}
                step={1}
                display={(v) => `Age ${v}`}
                onChange={(v) =>
                  set({ propertySale: { ...patch.propertySale!, saleAge: v } })
                }
              />
            ) : null}
          </ControlCard>
        ) : null}
      </div>

      {q.isPending || !q.data ? (
        <p className="text-muted-foreground">Running the scenario…</p>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h3 className="text-lg">Combined scenario impact</h3>
            <p className="text-sm text-muted-foreground">
              One full run containing every change you selected, compared with your baseline.
            </p>
            <MetricStrip metrics={q.data.combined} baseline={q.data.baseline} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Baseline vs What if — total portfolio</CardTitle>
            </CardHeader>
            <CardContent>
              <CompareChart baseline={q.data.baselineSeries} scenario={q.data.combinedSeries} />
            </CardContent>
          </Card>

          {q.data.isolated.length > 0 ? (
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base">Isolated effect of each change</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Each row is its own separate re-run with only that change applied. These effects
                  do <span className="font-medium">not</span> add up to the combined impact above.
                </p>
              </CardHeader>
              <CardContent className="overflow-auto p-0">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-left">
                    <tr>
                      <th className="p-3 font-medium">Change</th>
                      <th className="p-3 text-right font-medium">Sustainable spending</th>
                      <th className="p-3 text-right font-medium">Lifetime tax</th>
                      <th className="p-3 text-right font-medium">Estate after tax</th>
                      <th className="p-3 text-right font-medium">Funding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.isolated.map((e) => (
                      <tr key={e.key} className="border-t">
                        <td className="p-3">{e.label}</td>
                        <td className="p-3 text-right">
                          <DeltaChip
                            spec={METRICS.find((m) => m.key === "sustainable")!}
                            delta={
                              monthlyDisplay(e.metrics.sustainableSpend) -
                              monthlyDisplay(q.data!.baseline.sustainableSpend)
                            }
                          />
                        </td>
                        <td className="p-3 text-right">
                          <DeltaChip
                            spec={METRICS.find((m) => m.key === "lifetimeTax")!}
                            delta={e.metrics.lifetimeTax - q.data!.baseline.lifetimeTax}
                          />
                        </td>
                        <td className="p-3 text-right">
                          <DeltaChip
                            spec={METRICS.find((m) => m.key === "estate")!}
                            delta={e.metrics.afterTaxEstate - q.data!.baseline.afterTaxEstate}
                          />
                        </td>
                        <td className="p-3 text-right">
                          {e.metrics.shortfallYears === 0 ? (
                            <Badge variant="secondary">Funded</Badge>
                          ) : (
                            `${e.metrics.shortfallYears} short years`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}

          <YearLedger output={q.data.combinedOutput} title="Scenario — year by year" />
          <p className="text-xs text-muted-foreground">
            Nothing on this page changes your saved plan. Your baseline stays exactly as you entered
            it until you explicitly make a scenario your baseline.
          </p>
        </div>
      )}
    </div>
  );
}

function ControlCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="tabular text-sm font-medium">{display(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v ?? min)}
      />
    </div>
  );
}
