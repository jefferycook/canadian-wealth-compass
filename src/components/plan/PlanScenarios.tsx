/**
 * Saved scenarios workspace.
 *
 * A saved scenario is a name plus the canonical ScenarioPatch. Nothing here
 * stores a result: every number shown comes back from a fresh server-side
 * engine run of `baseline draft + patch`. The baseline plan is only ever
 * changed by the explicit, confirmed "Make this my baseline" action.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Pencil, RotateCcw, Save, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  compareScenarios,
  createScenario,
  deleteScenario,
  duplicateScenario,
  listScenarios,
  promoteScenarioToBaseline,
  updateScenario,
  type SavedScenario,
} from "@/lib/plans.functions";
import type { PlanDraft } from "@/lib/planning/draft";
import type { ScenarioPatch } from "@/lib/planning/scenario";
import { METRICS } from "@/components/plan/scenario-ui";

export function ScenariosWorkspace({
  planId,
  draft,
  patch,
  onOpenScenario,
  onReset,
}: {
  planId: string;
  draft: PlanDraft;
  patch: ScenarioPatch;
  onOpenScenario: (p: ScenarioPatch) => void;
  onReset: () => void;
}) {
  const qc = useQueryClient();
  const couple = draft.people.length > 1;

  const list = useServerFn(listScenarios);
  const create = useServerFn(createScenario);
  const update = useServerFn(updateScenario);
  const remove = useServerFn(deleteScenario);
  const clone = useServerFn(duplicateScenario);
  const compare = useServerFn(compareScenarios);
  const promote = useServerFn(promoteScenarioToBaseline);

  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmBaseline, setConfirmBaseline] = useState<SavedScenario | null>(null);

  const scenarios = useQuery({
    queryKey: ["scenarios", planId],
    queryFn: () => list({ data: { planId } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["scenarios", planId] });
  const refreshAll = () => {
    refresh();
    qc.invalidateQueries({ queryKey: ["scenario-compare", planId] });
  };

  const saveNew = useMutation({
    mutationFn: () => create({ data: { planId, name: newName, patch } }),
    onSuccess: () => {
      setNewName("");
      toast.success("Scenario saved. Your baseline plan is unchanged.");
      refreshAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const overwrite = useMutation({
    mutationFn: (id: string) => update({ data: { id, patch } }),
    onSuccess: () => {
      toast.success("Scenario updated.");
      refreshAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: (v: { id: string; name: string }) => update({ data: v }),
    onSuccess: () => {
      setRenaming(null);
      refreshAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (_r, id) => {
      setSelected((s) => s.filter((x) => x !== id));
      toast.success("Scenario deleted. Your plan is unchanged.");
      refreshAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dup = useMutation({
    mutationFn: (id: string) => clone({ data: { id } }),
    onSuccess: () => refreshAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  const makeBaseline = useMutation({
    mutationFn: (id: string) =>
      promote({ data: { planId, scenarioId: id, confirm: true as const } }),
    onSuccess: (r) => {
      setConfirmBaseline(null);
      qc.invalidateQueries();
      toast.success(
        r.unsupported.length
          ? "Baseline updated. Some scenario-only settings could not be written to the plan."
          : "This scenario is now your baseline plan.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const comparison = useQuery({
    queryKey: ["scenario-compare", planId, selected],
    queryFn: () => compare({ data: { planId, scenarioIds: selected } }),
    enabled: selected.length > 0,
  });

  const rows = scenarios.data ?? [];
  const dirty = useMemo(() => Object.keys(patch).length > 0, [patch]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Working scenario</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The changes you set on the What if, Strategies and Opportunities tabs. Saving keeps them
            beside your plan — it never changes your baseline answers.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newName}
              placeholder="Name this scenario"
              className="h-9 w-64"
              aria-label="Scenario name"
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!dirty || saveNew.isPending}
              onClick={() => saveNew.mutate()}
            >
              <Save className="mr-2 size-4" /> Save as scenario
            </Button>
            <Button size="sm" variant="outline" disabled={!dirty} onClick={onReset}>
              <RotateCcw className="mr-2 size-4" /> Reset working scenario
            </Button>
            {!dirty ? (
              <span className="text-xs text-muted-foreground">
                No changes set yet — matches your baseline.
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved scenarios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {scenarios.isPending ? (
            <p className="text-sm text-muted-foreground">Loading your scenarios…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing saved yet. Set some changes, then save them here.
            </p>
          ) : (
            rows.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
              >
                <Checkbox
                  checked={selected.includes(s.id)}
                  disabled={!s.patch}
                  aria-label={`Compare ${s.name}`}
                  onCheckedChange={(v) =>
                    setSelected((cur) => (v ? [...cur, s.id] : cur.filter((x) => x !== s.id)))
                  }
                />
                {renaming?.id === s.id ? (
                  <>
                    <Input
                      value={renaming.name}
                      className="h-8 w-56"
                      aria-label="New scenario name"
                      onChange={(e) => setRenaming({ id: s.id, name: e.target.value })}
                    />
                    <Button size="sm" onClick={() => rename.mutate(renaming)}>
                      Save name
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="font-medium">{s.name}</span>
                    <Badge variant="secondary">v{s.schemaVersion}</Badge>
                    {s.error ? <Badge variant="destructive">Cannot be opened</Badge> : null}
                    <span className="text-xs text-muted-foreground">
                      Updated {new Date(s.updatedAt).toLocaleDateString()}
                    </span>
                    <div className="ml-auto flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!s.patch}
                        onClick={() => {
                          onOpenScenario(s.patch ?? {});
                          toast.success(`Opened “${s.name}”.`);
                        }}
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!dirty || overwrite.isPending}
                        onClick={() => overwrite.mutate(s.id)}
                      >
                        Update with working changes
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Rename ${s.name}`}
                        onClick={() => setRenaming({ id: s.id, name: s.name })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Duplicate ${s.name}`}
                        onClick={() => dup.mutate(s.id)}
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!s.patch}
                        onClick={() => setConfirmBaseline(s)}
                      >
                        <Star className="mr-2 size-4" /> Make this my baseline
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${s.name}`}
                        onClick={() => del.mutate(s.id)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                    {s.error ? (
                      <p className="w-full text-xs text-destructive">{s.error}</p>
                    ) : null}
                  </>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {selected.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Baseline vs saved scenarios</CardTitle>
          </CardHeader>
          <CardContent>
            {comparison.isPending ? (
              <p className="text-sm text-muted-foreground">Re-running each scenario…</p>
            ) : comparison.data ? (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-left">
                    <tr>
                      <th className="p-3 font-medium">Measure</th>
                      <th className="p-3 text-right font-medium">Baseline</th>
                      {comparison.data.scenarios.map((s) => (
                        <th key={s.id} className="p-3 text-right font-medium">
                          {s.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map((m) => (
                      <tr key={m.key} className="border-t">
                        <td className="p-3">{m.label}</td>
                        <td className="tabular p-3 text-right">
                          {m.value(comparison.data!.baseline)}
                        </td>
                        {comparison.data!.scenarios.map((s) => (
                          <td key={s.id} className="tabular p-3 text-right">
                            {m.value(s.metrics)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="border-t">
                      <td className="p-3">First retirement age</td>
                      <td className="tabular p-3 text-right">
                        {comparison.data.baseline.retirementAge ?? "—"}
                      </td>
                      {comparison.data.scenarios.map((s) => (
                        <td key={s.id} className="tabular p-3 text-right">
                          {s.metrics.retirementAge ?? "—"}
                        </td>
                      ))}
                    </tr>
                    {couple ? (
                      <tr className="border-t">
                        <td className="p-3">Both retired by age</td>
                        <td className="tabular p-3 text-right">
                          {comparison.data.baseline.lastRetirementAge ?? "—"}
                        </td>
                        {comparison.data.scenarios.map((s) => (
                          <td key={s.id} className="tabular p-3 text-right">
                            {s.metrics.lastRetirementAge ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                {comparison.data.skipped.map((s) => (
                  <p key={s.id} className="mt-3 text-xs text-destructive">
                    {s.name}: {s.error}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-destructive">These scenarios could not be run.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog
        open={confirmBaseline != null}
        onOpenChange={(o) => !o && setConfirmBaseline(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make “{confirmBaseline?.name}” your baseline?</AlertDialogTitle>
            <AlertDialogDescription>
              This writes the scenario&apos;s answers into your plan, replacing the current ones.
              Saved scenarios stay where they are. This cannot be undone automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my current plan</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmBaseline && makeBaseline.mutate(confirmBaseline.id)}
            >
              Yes, make it my baseline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
