import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  DateField,
  NumberField,
  SelectField,
  TextField,
  ageFromDob,
  money,
} from "@/components/plan/fields";
import type { PersonDraft, PlanDraft } from "@/lib/planning/draft";
import { emptyPerson } from "@/lib/planning/defaults";
import { getProvince, getTaxYear, provinceKeys } from "@/lib/planning/taxYears";
import type {
  AccountInput,
  AccountType,
  HardAssetInput,
  LiabilityInput,
  OwnerKey,
  PlanType,
  ProvinceKey,
} from "@/lib/planning/types";

export const WIZARD_STEPS = [
  { key: "household", title: "About you", blurb: "Where you live and who the plan covers." },
  { key: "income", title: "Income", blurb: "Work income, CPP, OAS and workplace pensions." },
  { key: "accounts", title: "Savings", blurb: "RRSPs, TFSAs, LIRAs and investment accounts." },
  { key: "property", title: "Property & debt", blurb: "Your home, other assets and what you owe." },
  { key: "spending", title: "Spending", blurb: "What retirement needs to pay for." },
  { key: "assumptions", title: "Assumptions", blurb: "Returns, inflation and horizon." },
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"];

const YEAR = getTaxYear(new Date().getFullYear());

const PROVINCE_OPTIONS = provinceKeys(YEAR)
  .filter((k) => k !== "CUSTOM")
  .map((k) => ({ value: k, label: getProvince(YEAR, k).name }));

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "RRSP", label: "RRSP" },
  { value: "RRIF", label: "RRIF" },
  { value: "TFSA", label: "TFSA" },
  { value: "NONREG", label: "Non-registered" },
  { value: "LIRA", label: "LIRA (locked-in)" },
  { value: "LIF", label: "LIF" },
  { value: "DCPP", label: "Defined-contribution pension" },
];

const PLAN_TYPES: { value: PlanType; label: string }[] = [
  { value: "single", label: "Just me" },
  { value: "married", label: "Married" },
  { value: "commonlaw", label: "Common-law" },
  { value: "partners", label: "Partners (not spouses for tax)" },
];

/** A stored fraction shown as a percentage, without losing typed decimals. */
const pct = (v: number) => Number((v * 100).toFixed(4));

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function newAccount(owner: OwnerKey, type: AccountType = "RRSP"): AccountInput {
  return {
    id: uid(),
    name: type === "NONREG" ? "Investment account" : type,
    type,
    owner,
    bal: 0,
    eq: 60,
    acb: 0,
    conv: 0,
    unlock: 0,
    juris: "ON",
    contrib: 0,
    contribEnd: 0,
    wd: 0,
    wdStart: 0,
    wdEnd: 0,
    mix: { int: 0.3, div: 0.3, cg: 0.4 },
  };
}

interface StepProps {
  draft: PlanDraft;
  onChange: (next: PlanDraft) => void;
}

function patchPerson(
  draft: PlanDraft,
  index: number,
  patch: Partial<PersonDraft>,
): PlanDraft {
  const people = draft.people.map((p, i) => (i === index ? { ...p, ...patch } : p));
  return { ...draft, people };
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

function HouseholdStep({ draft, onChange }: StepProps) {
  const hasSpouse = draft.people.length > 1;
  return (
    <div className="space-y-4">
      <SectionCard title="Household">
        <SelectField<ProvinceKey>
          label="Province of residence"
          hint="Sets the provincial tax tables used all the way through."
          value={draft.tax.provinceKey}
          onChange={(v) => onChange({ ...draft, tax: { ...draft.tax, provinceKey: v } })}
          options={PROVINCE_OPTIONS}
          placeholder="Choose your province"
        />
        <SelectField<PlanType>
          label="Who does this plan cover?"
          value={draft.planType}
          onChange={(v) => {
            const wantsSpouse = v !== "single";
            const people =
              wantsSpouse && draft.people.length === 1
                ? [...draft.people, emptyPerson("B")]
                : !wantsSpouse
                  ? draft.people.slice(0, 1)
                  : draft.people;
            onChange({ ...draft, planType: v, people });
          }}
          options={PLAN_TYPES}
        />
      </SectionCard>

      {draft.people.map((p, i) => (
        <SectionCard key={p.id} title={i === 0 ? "You" : "Your spouse or partner"}>
          <TextField
            label="First name"
            value={p.firstName}
            placeholder="Optional"
            onChange={(v) => onChange(patchPerson(draft, i, { firstName: v }))}
          />
          <DateField
            label="Date of birth"
            hint={
              p.curAge != null
                ? `Age ${p.curAge} today. Drives CPP, OAS, RRIF and LIF timing.`
                : "Drives CPP, OAS, RRIF conversion and LIF timing."
            }
            value={p.dob}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(v) =>
              onChange(patchPerson(draft, i, { dob: v, curAge: ageFromDob(v) }))
            }
          />

          <NumberField
            label="Retirement age"
            hint="Leave blank if already retired."
            value={p.retAge}
            min={40}
            max={100}
            onChange={(v) => onChange(patchPerson(draft, i, { retAge: v }))}
          />
          <NumberField
            label="Plan to age"
            hint="Life expectancy for survivor modelling. Blank means not modelled."
            value={p.deathAge}
            min={60}
            max={110}
            onChange={(v) => onChange(patchPerson(draft, i, { deathAge: v }))}
          />
        </SectionCard>
      ))}

      {!hasSpouse ? null : (
        <p className="text-sm text-muted-foreground">
          Spouses are modelled together: pension income splitting, spousal rollovers on death and
          the CPP survivor&apos;s pension are all applied automatically.
        </p>
      )}
    </div>
  );
}

function IncomeStep({ draft, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      {draft.people.map((p, i) => (
        <SectionCard key={p.id} title={p.firstName || (i === 0 ? "You" : "Your spouse")}>
          <NumberField
            label="Employment income (per year)"
            hint="Today's dollars, before tax, until retirement."
            prefix="$"
            value={p.employ}
            onChange={(v) => onChange(patchPerson(draft, i, { employ: v }))}
          />
          <div className="flex items-end sm:col-span-1">
            <BenefitEstimator
              person={p}
              taxYear={draft.taxYear}
              inflation={draft.inflation}
              onApply={({ cpp, oas }) =>
                onChange(
                  patchPerson(draft, i, {
                    cpp: { ...p.cpp, amt: cpp, age: p.cpp.age ?? 65 },
                    oas: { ...p.oas, amt: oas, age: p.oas.age ?? 65 },
                  }),
                )
              }
            />
          </div>
          <NumberField
            label="CPP at 65 (per year)"
            hint="From My Service Canada, or use the estimator above."
            prefix="$"
            value={p.cpp.amt}
            onChange={(v) => onChange(patchPerson(draft, i, { cpp: { ...p.cpp, amt: v } }))}
          />
          <NumberField
            label="Start CPP at age"
            hint="60 to 70. Later means a permanently larger benefit."
            value={p.cpp.age}
            min={60}
            max={70}
            onChange={(v) => onChange(patchPerson(draft, i, { cpp: { ...p.cpp, age: v } }))}
          />
          <NumberField
            label="OAS at 65 (per year)"
            prefix="$"
            value={p.oas.amt}
            onChange={(v) => onChange(patchPerson(draft, i, { oas: { ...p.oas, amt: v } }))}
          />
          <NumberField
            label="Start OAS at age"
            hint="65 to 70."
            value={p.oas.age}
            min={65}
            max={70}
            onChange={(v) => onChange(patchPerson(draft, i, { oas: { ...p.oas, age: v } }))}
          />
          <NumberField
            label="Workplace pension (per year)"
            hint="Defined-benefit pension only."
            prefix="$"
            value={p.pen.amt}
            onChange={(v) => onChange(patchPerson(draft, i, { pen: { ...p.pen, amt: v } }))}
          />
          <NumberField
            label="Pension starts at age"
            value={p.pen.age}
            min={45}
            max={75}
            onChange={(v) => onChange(patchPerson(draft, i, { pen: { ...p.pen, age: v } }))}
          />
          <NumberField
            label="Bridge benefit (per year)"
            hint="Some pensions pay a top-up until 65."
            prefix="$"
            value={p.bridge.amt}
            onChange={(v) => onChange(patchPerson(draft, i, { bridge: { ...p.bridge, amt: v } }))}
          />
          <NumberField
            label="TFSA room available"
            prefix="$"
            value={p.tfsaRoom}
            onChange={(v) => onChange(patchPerson(draft, i, { tfsaRoom: v }))}
          />
          <NumberField
            label="RRSP room available"
            prefix="$"
            value={p.rrspRoom}
            onChange={(v) => onChange(patchPerson(draft, i, { rrspRoom: v }))}
          />
        </SectionCard>
      ))}
    </div>
  );
}

function AccountsStep({ draft, onChange }: StepProps) {
  const owners: { value: OwnerKey; label: string }[] = [
    { value: "A", label: draft.people[0]?.firstName || "You" },
    ...(draft.people.length > 1
      ? ([{ value: "B", label: draft.people[1]?.firstName || "Spouse" }] as const)
      : []),
    { value: "JOINT", label: "Joint" },
  ];

  const update = (id: string, patch: Partial<AccountInput>) =>
    onChange({
      ...draft,
      accounts: draft.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });

  return (
    <div className="space-y-4">
      {draft.accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add each account you hold. Registered, locked-in and taxable money are treated very
          differently, so keeping them separate is what makes the projection accurate.
        </p>
      ) : null}

      {draft.accounts.map((a) => (
        <Card key={a.id}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">{a.name || a.type}</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove account"
              onClick={() =>
                onChange({ ...draft, accounts: draft.accounts.filter((x) => x.id !== a.id) })
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nickname" value={a.name} onChange={(v) => update(a.id, { name: v })} />
            <SelectField<AccountType>
              label="Account type"
              value={a.type}
              onChange={(v) => update(a.id, { type: v })}
              options={ACCOUNT_TYPES}
            />
            <SelectField<OwnerKey>
              label="Owner"
              value={a.owner}
              onChange={(v) => update(a.id, { owner: v })}
              options={owners}
            />
            <NumberField
              label="Current balance"
              prefix="$"
              value={a.bal || null}
              onChange={(v) => update(a.id, { bal: v ?? 0 })}
            />
            <NumberField
              label="Equity allocation"
              hint="The rest is treated as fixed income."
              suffix="%"
              min={0}
              max={100}
              value={a.eq}
              onChange={(v) => update(a.id, { eq: v ?? 0 })}
            />
            <NumberField
              label="Annual contribution"
              prefix="$"
              value={a.contrib || null}
              onChange={(v) => update(a.id, { contrib: v ?? 0 })}
            />
            {a.type === "NONREG" ? (
              <NumberField
                label="Adjusted cost base"
                hint="What you paid. Used for capital-gains tax on withdrawals."
                prefix="$"
                value={a.acb || null}
                onChange={(v) => update(a.id, { acb: v ?? 0 })}
              />
            ) : null}
            {a.type === "LIRA" || a.type === "LIF" ? (
              <NumberField
                label="Unlock on conversion"
                hint="Ontario allows 50% to be unlocked into an RRSP at conversion."
                suffix="%"
                min={0}
                max={100}
                value={a.unlock || null}
                onChange={(v) => update(a.id, { unlock: v ?? 0 })}
              />
            ) : null}
          </CardContent>
        </Card>
      ))}

      <Button
        variant="secondary"
        onClick={() => onChange({ ...draft, accounts: [...draft.accounts, newAccount("A")] })}
      >
        <Plus className="mr-2 size-4" /> Add an account
      </Button>
    </div>
  );
}

function PropertyStep({ draft, onChange }: StepProps) {
  const updateAsset = (id: string, patch: Partial<HardAssetInput>) =>
    onChange({
      ...draft,
      hardAssets: draft.hardAssets.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    });
  const updateLiab = (id: string, patch: Partial<LiabilityInput>) =>
    onChange({
      ...draft,
      liabilities: draft.liabilities.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-lg">Property and other assets</h3>
        {draft.hardAssets.map((h) => (
          <Card key={h.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">{h.name || "Asset"}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove asset"
                onClick={() =>
                  onChange({
                    ...draft,
                    hardAssets: draft.hardAssets.filter((x) => x.id !== h.id),
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="What is it?"
                value={h.name}
                onChange={(v) => updateAsset(h.id!, { name: v })}
              />
              <NumberField
                label="Current value"
                prefix="$"
                value={h.val || null}
                onChange={(v) => updateAsset(h.id!, { val: v ?? 0 })}
              />
              <NumberField
                label="Expected growth"
                suffix="%"
                step={0.1}
                value={pct(h.apr)}
                onChange={(v) => updateAsset(h.id!, { apr: (v ?? 0) / 100 })}
              />
              <NumberField
                label="Downsize or sell at your age"
                hint="Leave blank to keep it for life."
                value={h.dsAge || null}
                onChange={(v) => updateAsset(h.id!, { dsAge: v ?? 0 })}
              />
              <NumberField
                label="Percent freed by downsizing"
                suffix="%"
                min={0}
                max={100}
                value={h.dsPct || null}
                onChange={(v) => updateAsset(h.id!, { dsPct: v ?? 0 })}
              />
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Gain is taxable</p>
                  <p className="text-xs text-muted-foreground">
                    Off for a principal residence.
                  </p>
                </div>
                <Switch
                  checked={h.taxable}
                  onCheckedChange={(c) => updateAsset(h.id!, { taxable: c })}
                />
              </div>
            </CardContent>
          </Card>
        ))}
        <Button
          variant="secondary"
          onClick={() =>
            onChange({
              ...draft,
              hardAssets: [
                ...draft.hardAssets,
                {
                  id: uid(),
                  name: "Home",
                  val: 0,
                  apr: 0.03,
                  sale: 0,
                  dsAge: 0,
                  dsPct: 0,
                  taxable: false,
                  acb: 0,
                },
              ],
            })
          }
        >
          <Plus className="mr-2 size-4" /> Add property
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg">Debts</h3>
        {draft.liabilities.map((l) => (
          <Card key={l.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">{l.name || "Debt"}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove debt"
                onClick={() =>
                  onChange({
                    ...draft,
                    liabilities: draft.liabilities.filter((x) => x.id !== l.id),
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="What is it?"
                value={l.name}
                onChange={(v) => updateLiab(l.id!, { name: v })}
              />
              <NumberField
                label="Balance owing"
                prefix="$"
                value={l.bal || null}
                onChange={(v) => updateLiab(l.id!, { bal: v ?? 0 })}
              />
              <NumberField
                label="Interest rate"
                suffix="%"
                step={0.1}
                value={pct(l.rate)}
                onChange={(v) => updateLiab(l.id!, { rate: (v ?? 0) / 100 })}
              />
              <NumberField
                label="Annual payment"
                prefix="$"
                value={l.pay || null}
                onChange={(v) => updateLiab(l.id!, { pay: v ?? 0 })}
              />
            </CardContent>
          </Card>
        ))}
        <Button
          variant="secondary"
          onClick={() =>
            onChange({
              ...draft,
              liabilities: [
                ...draft.liabilities,
                { id: uid(), name: "Mortgage", bal: 0, rate: 0.05, pay: 0 },
              ],
            })
          }
        >
          <Plus className="mr-2 size-4" /> Add debt
        </Button>
      </div>
    </div>
  );
}

function SpendingStep({ draft, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <SectionCard title="Retirement spending">
        <NumberField
          label="Annual spending after tax"
          hint="Today's dollars, for the whole household. Everything the plan has to fund."
          prefix="$"
          value={draft.spendNeed}
          onChange={(v) => onChange({ ...draft, spendNeed: v })}
        />
        <NumberField
          label="Survivor spending"
          hint="Share of household spending a surviving spouse still needs."
          suffix="%"
          min={0}
          max={100}
          value={Math.round(draft.survivorPct * 100)}
          onChange={(v) => onChange({ ...draft, survivorPct: (v ?? 60) / 100 })}
        />
      </SectionCard>

      <div className="space-y-3">
        <h3 className="text-lg">One-off expenses</h3>
        <p className="text-sm text-muted-foreground">
          A new roof, a wedding, a car, a big trip. Entered in today&apos;s dollars against your
          age when they land.
        </p>
        {draft.expenses.map((e, i) => (
          <Card key={e.id ?? i}>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-4">
              <TextField
                label="What"
                value={e.name}
                onChange={(v) =>
                  onChange({
                    ...draft,
                    expenses: draft.expenses.map((x, j) => (i === j ? { ...x, name: v } : x)),
                  })
                }
              />
              <NumberField
                label="At your age"
                value={e.age || null}
                onChange={(v) =>
                  onChange({
                    ...draft,
                    expenses: draft.expenses.map((x, j) => (i === j ? { ...x, age: v ?? 0 } : x)),
                  })
                }
              />
              <NumberField
                label="Amount"
                prefix="$"
                value={e.amt || null}
                onChange={(v) =>
                  onChange({
                    ...draft,
                    expenses: draft.expenses.map((x, j) => (i === j ? { ...x, amt: v ?? 0 } : x)),
                  })
                }
              />
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove expense"
                  onClick={() =>
                    onChange({ ...draft, expenses: draft.expenses.filter((_, j) => j !== i) })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        <Button
          variant="secondary"
          onClick={() =>
            onChange({
              ...draft,
              expenses: [...draft.expenses, { id: uid(), name: "", age: 0, amt: 0 }],
            })
          }
        >
          <Plus className="mr-2 size-4" /> Add a one-off expense
        </Button>
      </div>
    </div>
  );
}

function AssumptionsStep({ draft, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <SectionCard title="Modelling assumptions">
        <NumberField
          label="Inflation"
          suffix="%"
          step={0.1}
          value={pct(draft.inflation)}
          onChange={(v) => onChange({ ...draft, inflation: (v ?? 2.1) / 100 })}
        />
        <NumberField
          label="Equity return"
          suffix="%"
          step={0.1}
          value={pct(draft.eqRet)}
          onChange={(v) => onChange({ ...draft, eqRet: (v ?? 6.5) / 100 })}
        />
        <NumberField
          label="Fixed-income return"
          suffix="%"
          step={0.1}
          value={pct(draft.fiRet)}
          onChange={(v) => onChange({ ...draft, fiRet: (v ?? 3.5) / 100 })}
        />
        <NumberField
          label="Project to age"
          value={draft.endAge}
          min={70}
          max={110}
          onChange={(v) => onChange({ ...draft, endAge: v ?? 95 })}
        />
        <SelectField
          label="Withdrawal order"
          hint="Automatic tests every order and keeps the one that lasts longest and leaves the most after tax."
          value={draft.strategy}
          onChange={(v) => onChange({ ...draft, strategy: v })}
          options={[
            { value: "auto", label: "Choose the best automatically" },
            { value: "nonreg_reg_tfsa", label: "Non-registered → registered → TFSA" },
            { value: "reg_nonreg_tfsa", label: "Registered → non-registered → TFSA" },
            { value: "tfsa_nonreg_reg", label: "TFSA → non-registered → registered" },
            { value: "prorata", label: "Proportional across accounts" },
          ]}
        />
      </SectionCard>
      <p className="text-sm text-muted-foreground">
        Tax brackets, credits, CPP and OAS maximums, RRIF minimums and LIF maximums all come from
        the {draft.taxYear} statutory tables and are never entered by hand.
      </p>
    </div>
  );
}

export function PlanWizard({
  step,
  draft,
  onChange,
}: {
  step: WizardStepKey;
  draft: PlanDraft;
  onChange: (next: PlanDraft) => void;
}) {
  const props = { draft, onChange };
  switch (step) {
    case "household":
      return <HouseholdStep {...props} />;
    case "income":
      return <IncomeStep {...props} />;
    case "accounts":
      return <AccountsStep {...props} />;
    case "property":
      return <PropertyStep {...props} />;
    case "spending":
      return <SpendingStep {...props} />;
    case "assumptions":
      return <AssumptionsStep {...props} />;
  }
}

export function totalSavings(draft: PlanDraft) {
  return money(draft.accounts.reduce((s, a) => s + (a.bal || 0), 0));
}
