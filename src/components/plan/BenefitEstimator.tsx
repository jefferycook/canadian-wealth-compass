import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NumberField, SelectField, money } from "@/components/plan/fields";
import type { PersonDraft } from "@/lib/planning/draft";
import {
  CPP_LEVEL_LABELS,
  estimateCppAt65,
  estimateOasAt65,
  indexedAmount,
  yearsUntilAge,
  type CppEarningsLevel,
} from "@/lib/planning/estimates";

const LEVELS: { value: CppEarningsLevel; label: string }[] = (
  Object.keys(CPP_LEVEL_LABELS) as CppEarningsLevel[]
).map((k) => ({ value: k, label: CPP_LEVEL_LABELS[k] }));

/**
 * Lets someone who has never looked up their My Service Canada estimate get a
 * defensible figure from their earnings history and years in Canada. The
 * numbers themselves come from the rules layer, never from this component.
 */
export function BenefitEstimator({
  person,
  taxYear,
  inflation,
  onApply,
}: {
  person: PersonDraft;
  taxYear: number;
  inflation: number;
  onApply: (v: { cpp: number; oas: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<CppEarningsLevel>("average");
  const [residence, setResidence] = useState<number | null>(40);

  const cpp = estimateCppAt65(level, taxYear);
  const oas = estimateOasAt65(residence ?? 40, taxYear);

  const cppYears = yearsUntilAge(person.dob, person.cpp.age ?? 65);
  const oasYears = yearsUntilAge(person.dob, person.oas.age ?? 65);
  const cppFuture = cppYears == null ? null : indexedAmount(cpp, inflation, cppYears);
  const oasFuture = oasYears == null ? null : indexedAmount(oas, inflation, oasYears);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" type="button">
          <Sparkles className="mr-2 size-4" /> Estimate CPP &amp; OAS for me
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Estimate CPP and OAS</DialogTitle>
          <DialogDescription>
            Based on your date of birth and the current statutory maximums. Amounts are entered in
            today&apos;s dollars — both benefits are indexed, and the projection raises them with
            inflation every year until they start.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <SelectField
            label="Your CPP contribution history"
            hint="The average case is the published average new pension taken at 65."
            value={level}
            onChange={(v) => setLevel(v)}
            options={LEVELS}
          />
          <NumberField
            label="Years living in Canada after age 18 (by 65)"
            hint="40 years earns full OAS; less is prorated in fortieths."
            min={0}
            max={40}
            value={residence}
            onChange={setResidence}
          />

          <div className="rounded-lg border p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">CPP at 65 (today&apos;s dollars)</span>
              <span className="tabular font-medium">{money(cpp)}/yr</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">OAS at 65 (today&apos;s dollars)</span>
              <span className="tabular font-medium">{money(oas)}/yr</span>
            </div>
            {cppFuture != null && oasFuture != null ? (
              <p className="mt-3 text-xs text-muted-foreground">
                In the year these start, that is roughly {money(cppFuture)} of CPP and{" "}
                {money(oasFuture)} of OAS in the dollars of the day, at{" "}
                {(inflation * 100).toFixed(1)}% inflation.
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Add your date of birth to see what these are likely to be worth when they start.
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            An estimate only. Your exact CPP entitlement depends on your full contribution record —
            check My Service Canada Account when you can.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply({ cpp, oas });
              setOpen(false);
            }}
          >
            Use these amounts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
