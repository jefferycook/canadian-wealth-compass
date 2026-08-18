import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createPlan, deletePlan, listPlans } from "@/lib/plans.functions";

export const Route = createFileRoute("/_authenticated/plans/")({
  head: () => ({
    meta: [
      { title: "Your plans — Northbound Retirement Planning" },
      { name: "description", content: "Your saved Canadian retirement and tax plans." },
      { property: "og:title", content: "Your plans — Northbound" },
      { property: "og:description", content: "Your saved Canadian retirement and tax plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlansPage,
});

function PlansPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchPlans = useServerFn(listPlans);
  const create = useServerFn(createPlan);
  const remove = useServerFn(deletePlan);

  const plans = useQuery({ queryKey: ["plans"], queryFn: () => fetchPlans() });

  const createMutation = useMutation({
    /**
     * A stale access token in a long-open tab makes the server reject the call
     * as unauthorized. Refresh the session once and try again before telling
     * the person anything went wrong.
     */
    mutationFn: async () => {
      try {
        return await create({ data: { name: "My plan" } });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/unauthor|401|jwt|token/i.test(message)) throw err;
        const { data } = await supabase.auth.refreshSession();
        if (!data.session) throw new Error("Your session expired. Please sign in again.");
        return await create({ data: { name: "My plan" } });
      }
    },
    onSuccess: (row) => {
      void navigate({ to: "/plans/$planId", params: { planId: row.id } });
    },
    onError: (err) => {
      console.error("createPlan failed", err);
      toast.error(err instanceof Error ? err.message : "Could not create the plan.");
    },
  });


  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl">Your plans</h1>
          <p className="mt-1 text-muted-foreground">
            Build a plan, then branch it into scenarios to compare.
          </p>
        </div>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          <Plus className="mr-2 size-4" /> New plan
        </Button>
      </div>

      {plans.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (plans.data ?? []).length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Start your first plan</CardTitle>
            <CardDescription>
              Six short steps: where you live, your income, your savings, your property, your
              spending, and the assumptions. Nothing is pre-filled — every number is yours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => createMutation.mutate()}>Begin</Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {(plans.data ?? []).map((p) => (
            <li key={p.id}>
              <Card>
                <CardContent className="flex items-center justify-between py-5">
                  <Link
                    to="/plans/$planId"
                    params={{ planId: p.id }}
                    className="flex-1 hover:underline"
                  >
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.is_complete ? "Ready" : "In progress"} · updated{" "}
                      {new Date(p.updated_at).toLocaleDateString("en-CA")}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete plan"
                    onClick={() => deleteMutation.mutate(p.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
