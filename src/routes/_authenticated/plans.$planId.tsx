import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PlanResults } from "@/components/plan/PlanResults";
import {
  GoalPanel,
  NetWorthPanel,
  RecommendationsPanel,
  StrategyPanel,
} from "@/components/plan/PlanInsights";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlanWizard, WIZARD_STEPS, type WizardStepKey } from "@/components/plan/PlanWizard";
import { isPlanReady, missingRequiredInputs } from "@/lib/planning/defaults";
import type { PlanDraft } from "@/lib/planning/draft";
import { LeversPanel } from "@/components/plan/PlanLevers";
import { analyzePlan, getPlan, savePlan } from "@/lib/plans.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/plans/$planId")({
  head: () => ({
    meta: [
      { title: "Plan builder — Northbound Retirement Planning" },
      {
        name: "description",
        content:
          "Answer six short steps and see a year-by-year Canadian retirement projection with full federal and provincial tax.",
      },
      { property: "og:title", content: "Plan builder — Northbound" },
      {
        property: "og:description",
        content: "A year-by-year Canadian retirement projection built from your own numbers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl">We couldn&apos;t open this plan</h1>
      <p className="mt-2 text-muted-foreground">{error.message}</p>
      <Link to="/plans" className="mt-6 inline-block underline">
        Back to your plans
      </Link>
    </main>
  ),
  component: PlanBuilder,
});

function PlanBuilder() {
  const { planId } = Route.useParams();
  const fetchPlan = useServerFn(getPlan);
  const persist = useServerFn(savePlan);
  const analyze = useServerFn(analyzePlan);

  const planQuery = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => fetchPlan({ data: { id: planId } }),
  });

  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [name, setName] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (planQuery.data && draft === null) {
      setDraft(planQuery.data.draft);
      setName(planQuery.data.name);
    }
  }, [planQuery.data, draft]);

  const saveMutation = useMutation({
    mutationFn: (payload: { draft: PlanDraft; name: string }) =>
      persist({
        data: {
          id: planId,
          name: payload.name,
          draft: payload.draft,
          isComplete: isPlanReady(payload.draft),
        },
      }),
    onSuccess: () => setSaved(true),
    onError: () => toast.error("Changes could not be saved."),
  });

  /** Autosave: the client should never lose answers by navigating away. */
  function update(next: PlanDraft, nextName = name) {
    setDraft(next);
    setName(nextName);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveMutation.mutate({ draft: next, name: nextName }), 700);
  }

  const gaps = useMemo(() => (draft ? missingRequiredInputs(draft) : []), [draft]);
  const ready = gaps.length === 0;

  const results = useQuery({
    queryKey: ["analysis", planId, draft],
    queryFn: () => analyze({ data: { draft: draft! } }),
    enabled: Boolean(draft) && ready,
  });

  if (!draft) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-muted-foreground">Loading your plan…</main>
    );
  }

  const step = WIZARD_STEPS[stepIndex]!;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/plans" className="text-sm text-muted-foreground hover:underline">
            ← Plans
          </Link>
          <Input
            value={name}
            aria-label="Plan name"
            className="h-9 w-56 font-medium"
            onChange={(e) => update(draft, e.target.value)}
          />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {saved ? (
            <>
              <Check className="size-3.5" /> Saved
            </>
          ) : (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Saving…
            </>
          )}
        </p>
      </div>

      <nav className="mb-8 flex flex-wrap gap-2">
        {WIZARD_STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setStepIndex(i)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              i === stepIndex
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-secondary",
            )}
          >
            {i + 1}. {s.title}
          </button>
        ))}
      </nav>

      <div className="mb-2">
        <h1 className="text-2xl">{step.title}</h1>
        <p className="text-muted-foreground">{step.blurb}</p>
      </div>

      <div className="mt-6">
        <PlanWizard step={step.key as WizardStepKey} draft={draft} onChange={(d) => update(d)} />
      </div>

      <div className="mt-8 flex justify-between">
        <Button
          variant="outline"
          disabled={stepIndex === 0}
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
        >
          <ArrowLeft className="mr-2 size-4" /> Back
        </Button>
        <Button
          disabled={stepIndex === WIZARD_STEPS.length - 1}
          onClick={() => setStepIndex((i) => Math.min(WIZARD_STEPS.length - 1, i + 1))}
        >
          Next <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>

      <section className="mt-14">
        <h2 className="mb-4 text-2xl">Your projection</h2>
        {!ready ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">A few more answers needed</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : results.isPending ? (
          <p className="text-muted-foreground">Running the projection…</p>
        ) : results.data ? (
          <Tabs defaultValue="projection">
            <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
              <TabsTrigger value="projection">Projection</TabsTrigger>
              <TabsTrigger value="networth">Net worth</TabsTrigger>
              <TabsTrigger value="goal">Goal progress</TabsTrigger>
              <TabsTrigger value="strategies">Strategies</TabsTrigger>
              <TabsTrigger value="advice">Recommendations</TabsTrigger>
              <TabsTrigger value="whatif">What if</TabsTrigger>
            </TabsList>
            <TabsContent value="projection">
              <PlanResults output={results.data.output} />
            </TabsContent>
            <TabsContent value="networth">
              <NetWorthPanel view={results.data.netWorth} />
            </TabsContent>
            <TabsContent value="goal">
              <GoalPanel goal={results.data.goal} />
            </TabsContent>
            <TabsContent value="strategies">
              <StrategyPanel rows={results.data.strategies} />
            </TabsContent>
            <TabsContent value="advice">
              <RecommendationsPanel items={results.data.recommendations} />
            </TabsContent>
            <TabsContent value="whatif">
              <LeversPanel
                draft={draft}
                score={results.data.score}
                cashflow={results.data.cashflow}
                advice={results.data.advice}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <p className="text-destructive">The projection could not be run.</p>
        )}
      </section>
    </main>
  );
}
