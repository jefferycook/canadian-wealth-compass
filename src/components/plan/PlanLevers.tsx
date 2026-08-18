/**
 * "What if I..." — the recommendations the client can actually move.
 *
 * Every slider re-runs the projection on the server and reports what it does
 * to the plan on its own, plus what all of them together do. No planning rule
 * lives here: this component only collects slider positions and renders the
 * numbers the engine returns.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Loader2, PiggyBank } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SliderField, money } from "@/components/plan/fields";
import { monthlyDisplay, perMonthWithYear } from "@/lib/planning/units";
import { simulatePlan } from "@/lib/plans.functions";
import type { PlanDraft } from "@/lib/planning/draft";
import type {
  CashflowView,
  LeverKey,
  LeverSettings,
  PlanScore,
  SavingAdvice,
} from "@/lib/planning/levers";

const NEUTRAL: LeverSettings = {
  extraMonthlySaving: 0,
  savingAccount: "TFSA",
  retireDeferYears: 0,
  preRetSpendCutMonthly: 0,
  retSpendCutMonthly: 0,
  cppAge: null,
  oasAge: null,
};

const LEVER_TITLES: Record<LeverKey, string> = {
  extraMonthlySaving: "Save more each month",
  retireDeferYears: "Work a little longer",
  preRetSpendCutMonthly: "Spend less before retirement",
  retSpendCutMonthly: "Spend less in retirement",
  cppAge: "Start CPP later",
  oasAge: "Start OAS later",
};

function Delta({ value }: { value: number }) {
  if (Math.abs(value) < 0.002) return <Badge variant="secondary">No change</Badge>;
  const up = value > 0;
  return (
    <Badge variant={up ? "default" : "destructive"} className="gap-1">
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {up ? "+" : ""}
      {(value * 100).toFixed(1)}% progress
    </Badge>
  );
}

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

function ScoreLine({ label, score }: { label: string; score: PlanScore }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="tabular font-medium">
          {money(score.sustainableMonthly)}/mo · {(score.progress * 100).toFixed(0)}% of goal
        </span>
      </div>
      <Progress value={Math.min(100, score.progress * 100)} />
    </div>
  );
}

export function LeversPanel({
  draft,
  score,
  cashflow,
  advice,
}: {
  draft: PlanDraft;
  score: PlanScore;
  cashflow: CashflowView;
  advice: SavingAdvice;
}) {
  const [levers, setLevers] = useState<LeverSettings>({
    ...NEUTRAL,
    savingAccount: advice.type,
  });
  const simulate = useServerFn(simulatePlan);

  const touched = useMemo(
    () =>
      levers.extraMonthlySaving > 0 ||
      levers.retireDeferYears > 0 ||
      levers.preRetSpendCutMonthly > 0 ||
      levers.retSpendCutMonthly > 0 ||
      levers.cppAge != null ||
      levers.oasAge != null,
    [levers],
  );

  const sim = useQuery({
    queryKey: ["levers", draft, levers],
    queryFn: () => simulate({ data: { draft, levers } }),
    enabled: touched,
    placeholderData: (prev) => prev,
  });

  const set = (patch: Partial<LeverSettings>) => setLevers((l) => ({ ...l, ...patch }));
  const deltaFor = (key: LeverKey) =>
    sim.data?.perLever.find((p) => p.key === key)?.progressDelta ?? 0;

  const combined = sim.data?.combined ?? score;
  const cppNow = draft.people[0]?.cpp.age ?? 65;
  const oasNow = draft.people[0]?.oas.age ?? 65;
  const suggestedSaving = Math.max(0, cashflow.surplusMonthly ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Monthly ability in retirement"
          value={`${money(score.sustainableMonthly)}/mo`}
          note="What the plan can pay you, after tax, every year without running out."
        />
        <Stat
          label="Your retirement goal"
          value={`${money(monthlyDisplay(score.spendTarget))}/mo`}
          note={`Today you are at ${(score.progress * 100).toFixed(0)}% of it.`}
        />
        <Stat
          label="Surplus cash flow"
          value={
            cashflow.surplusMonthly == null ? "—" : `${money(cashflow.surplusMonthly)}/mo`
          }
          note={
            cashflow.surplusMonthly == null
              ? "Add your current household spending to see what's left over."
              : `${money(cashflow.afterTaxIncome)} after tax less spending and contributions.`
          }
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PiggyBank className="size-4" /> Put surplus savings in your {advice.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{advice.reason}</p>
          {advice.roomAvailable > 0 ? (
            <p className="text-sm">
              Room available: <span className="tabular font-medium">{money(advice.roomAvailable)}</span>
            </p>
          ) : null}
          {suggestedSaving > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                set({ extraMonthlySaving: suggestedSaving, savingAccount: advice.type })
              }
            >
              Use my whole surplus — {money(suggestedSaving)}/mo
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">All of these changes together</CardTitle>
          {sim.isFetching ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <ScoreLine label="Your plan today" score={score} />
          <ScoreLine label="With these changes" score={combined} />
          <div className="grid gap-3 pt-1 text-sm sm:grid-cols-3">
            <p>
              Sustainable spending{" "}
              <span className="tabular font-medium">{money(combined.sustainableSpend)}</span>/yr
            </p>
            <p>
              Lifetime tax <span className="tabular font-medium">{money(combined.lifetimeTax)}</span>
            </p>
            <p>
              Estate after tax{" "}
              <span className="tabular font-medium">{money(combined.afterTaxEstate)}</span>
            </p>
          </div>
          {touched ? (
            <Button variant="ghost" size="sm" onClick={() => setLevers({ ...NEUTRAL, savingAccount: advice.type })}>
              Reset the sliders
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">{LEVER_TITLES.extraMonthlySaving}</CardTitle>
            <Delta value={deltaFor("extraMonthlySaving")} />
          </CardHeader>
          <CardContent>
            <SliderField
              label={`Into your ${advice.label}`}
              value={levers.extraMonthlySaving}
              onChange={(v) => set({ extraMonthlySaving: v })}
              min={0}
              max={5000}
              step={50}
              format={(v) => `${money(v)}/mo`}
              hint="On top of the contributions your accounts already make."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">{LEVER_TITLES.retireDeferYears}</CardTitle>
            <Delta value={deltaFor("retireDeferYears")} />
          </CardHeader>
          <CardContent>
            <SliderField
              label="Delay retirement by"
              value={levers.retireDeferYears}
              onChange={(v) => set({ retireDeferYears: v })}
              min={0}
              max={10}
              format={(v) => (v === 1 ? "1 year" : `${v} years`)}
              hint="More earning years, fewer years to fund, and bigger CPP."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">{LEVER_TITLES.preRetSpendCutMonthly}</CardTitle>
            <Delta value={deltaFor("preRetSpendCutMonthly")} />
          </CardHeader>
          <CardContent>
            <SliderField
              label="Cut today's spending by"
              value={levers.preRetSpendCutMonthly}
              onChange={(v) => set({ preRetSpendCutMonthly: v })}
              min={0}
              max={4000}
              step={50}
              format={(v) => `${money(v)}/mo`}
              hint="Whatever you stop spending stays invested."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">{LEVER_TITLES.retSpendCutMonthly}</CardTitle>
            <Delta value={deltaFor("retSpendCutMonthly")} />
          </CardHeader>
          <CardContent>
            <SliderField
              label="Cut retirement spending by"
              value={levers.retSpendCutMonthly}
              onChange={(v) => set({ retSpendCutMonthly: v })}
              min={0}
              max={4000}
              step={50}
              format={(v) => `${money(v)}/mo`}
              hint="This lowers the goal as well as the draw, so progress moves quickly."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">{LEVER_TITLES.cppAge}</CardTitle>
            <Delta value={deltaFor("cppAge")} />
          </CardHeader>
          <CardContent>
            <SliderField
              label="Start CPP at"
              value={levers.cppAge ?? cppNow}
              onChange={(v) => set({ cppAge: v })}
              min={60}
              max={70}
              format={(v) => `age ${v}`}
              hint={`Your plan currently starts it at ${cppNow}. Each year after 65 adds 8.4% for life.`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">{LEVER_TITLES.oasAge}</CardTitle>
            <Delta value={deltaFor("oasAge")} />
          </CardHeader>
          <CardContent>
            <SliderField
              label="Start OAS at"
              value={levers.oasAge ?? oasNow}
              onChange={(v) => set({ oasAge: v })}
              min={65}
              max={70}
              format={(v) => `age ${v}`}
              hint={`Your plan currently starts it at ${oasNow}. Deferring adds 7.2% a year, to 36% at 70.`}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
