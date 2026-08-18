import { Calculator, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import {
  DateField,
  MonthlyMoneyField,
  NumberField,
  SelectField,
  TextField,
  ageFromDob,
  money,
} from "@/components/plan/fields";
import { annualFromMonthly, monthlyFromAnnual } from "@/lib/planning/units";
import { BenefitEstimator } from "@/components/plan/BenefitEstimator";
import { monthlyMortgagePayment } from "@/lib/planning/estimates";
import type { PersonDraft, PlanDraft } from "@/lib/planning/draft";
import { accountTypeLabel } from "@/lib/planning/draft";
import { RETURN_PRESETS, emptyPerson } from "@/lib/planning/defaults";
import { getProvince, getTaxYear, provinceKeys } from "@/lib/planning/taxYears";
import { UNLOCK_RULES } from "@/lib/planning/registered";
import type {
  AccountInput,
  AccountType,
  HardAssetInput,
  JurisdictionKey,
  LiabilityInput,

  LumpSumInput,
  OtherIncomeInput,
  OwnerKey,
  PlanType,
  ProvinceKey,
} from "@/lib/planning/types";

export const WIZARD_STEPS = [
  { key: "household", title: "About you", blurb: "Where you live and who the plan covers." },
  { key: "income", title: "Income", blurb: "Work income, CPP, OAS and workplace pensions." },
  {
    key: "other",
    title: "Other income",
    blurb: "Rent, bonuses, inheritances and anything else that comes in.",
  },
  { key: "accounts", title: "Savings", blurb: "RRSPs, TFSAs, LIRAs and investment accounts." },
  { key: "property", title: "Property & debt", blurb: "Your home, other assets and what you owe." },
  { key: "spending", title: "Spending", blurb: "What you spend now and what retirement has to fund." },
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

/** Starting points for the hard assets people actually own. */
const ASSET_PRESETS: { label: string; name: string; apr: number; taxable: boolean }[] = [
  { label: "home", name: "Home", apr: 0.03, taxable: false },
  { label: "cottage or rental", name: "Cottage", apr: 0.03, taxable: true },
  { label: "vehicle", name: "Vehicle", apr: -0.15, taxable: false },
  { label: "boat or RV", name: "Boat", apr: -0.08, taxable: false },
  { label: "other asset", name: "Other asset", apr: 0, taxable: true },
];

/** A stored fraction shown as a percentage, without losing typed decimals. */
const pct = (v: number) => Number((v * 100).toFixed(4));

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function newAccount(owner: OwnerKey, type: AccountType = "RRSP"): AccountInput {
  return {
    id: uid(),
    name: "",
    type,
    owner,
    bal: 0,
    eq: 60,
    acb: 0,
    conv: 0,
    unlock: 0,
    juris: "ON",
    retOverride: null,
    contrib: 0,
    contribEnd: 0,
    wd: 0,
    wdStart: 0,
    wdEnd: 0,
    mix: { int: 0.3, div: 0.3, cg: 0.4 },
  };
}

/** The return an account is assumed to earn, given its mix or its override. */
function effectiveReturn(a: AccountInput, draft: PlanDraft): number {
  if (a.retOverride != null) return a.retOverride;
  const eq = Math.max(0, Math.min(100, a.eq)) / 100;
  return eq * draft.eqRet + (1 - eq) * draft.fiRet;
}

function presetKeyOf(a: AccountInput): string {
  if (a.retOverride == null) return "blend";
  const hit = RETURN_PRESETS.find((p) => Math.abs(p.rate - a.retOverride!) < 0.0001);
  return hit ? hit.key : "custom";
}

const RETURN_OPTIONS = [
  { value: "blend", label: "From my equity mix" },
  ...RETURN_PRESETS.map((p) => ({ value: p.key as string, label: p.label })),
  { value: "custom", label: "Custom rate" },
];

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
            hint="Today's dollars, before tax, until retirement. This is the one figure entered per year — everything else is monthly."
            prefix="$"
            suffix="/yr"
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
          <MonthlyMoneyField
            label="CPP at 65 (per month)"
            hint="From My Service Canada, or use the estimator above."
            annualValue={p.cpp.amt}
            onChangeAnnual={(v) =>
              onChange(patchPerson(draft, i, { cpp: { ...p.cpp, amt: v } }))
            }
          />
          <NumberField
            label="Start CPP at age"
            hint="60 to 70. Later means a permanently larger benefit."
            value={p.cpp.age}
            min={60}
            max={70}
            onChange={(v) => onChange(patchPerson(draft, i, { cpp: { ...p.cpp, age: v } }))}
          />
          <MonthlyMoneyField
            label="OAS at 65 (per month)"
            annualValue={p.oas.amt}
            onChangeAnnual={(v) =>
              onChange(patchPerson(draft, i, { oas: { ...p.oas, amt: v } }))
            }
          />
          <NumberField
            label="Start OAS at age"
            hint="65 to 70."
            value={p.oas.age}
            min={65}
            max={70}
            onChange={(v) => onChange(patchPerson(draft, i, { oas: { ...p.oas, age: v } }))}
          />
          <MonthlyMoneyField
            label="Workplace pension (per month)"
            hint="Defined-benefit pension only."
            annualValue={p.pen.amt}
            onChangeAnnual={(v) =>
              onChange(patchPerson(draft, i, { pen: { ...p.pen, amt: v } }))
            }
          />
          <NumberField
            label="Pension starts at age"
            value={p.pen.age}
            min={45}
            max={75}
            onChange={(v) => onChange(patchPerson(draft, i, { pen: { ...p.pen, age: v } }))}
          />
          <MonthlyMoneyField
            label="Bridge benefit (per month)"
            hint="Some pensions pay a top-up until 65."
            annualValue={p.bridge.amt}
            onChangeAnnual={(v) =>
              onChange(patchPerson(draft, i, { bridge: { ...p.bridge, amt: v } }))
            }
          />
          {p.bridge.amt ? (
            <NumberField
              label="Bridge ends at age"
              hint="Usually 65, when CPP and OAS begin."
              value={p.bridge.end}
              min={55}
              max={71}
              onChange={(v) =>
                onChange(patchPerson(draft, i, { bridge: { ...p.bridge, end: v } }))
              }
            />
          ) : null}

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

const JURISDICTIONS = Object.entries(UNLOCK_RULES).map(([value, r]) => ({
  value: value as JurisdictionKey,
  label: r.name,
}));

/**
 * The account detail most people never touch — but which changes the answer
 * materially when it applies: when contributions stop, when a plan converts,
 * which pension law governs locked-in money, scheduled withdrawals, and how a
 * taxable account's return is taxed.
 */
function AdvancedAccountFields({
  account: a,
  update,
}: {
  account: AccountInput;
  update: (id: string, patch: Partial<AccountInput>) => void;
}) {
  const locked = a.type === "LIRA" || a.type === "LIF";
  const mix = a.mix ?? { int: 0.3, div: 0.3, cg: 0.4 };
  const setMix = (patch: Partial<typeof mix>) => update(a.id, { mix: { ...mix, ...patch } });

  return (
    <Collapsible>
      <CollapsibleTrigger className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        More detail for this account
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Contribute until age"
          hint="Leave blank to contribute until retirement."
          value={a.contribEnd || null}
          min={18}
          max={95}
          onChange={(v) => update(a.id, { contribEnd: v ?? 0 })}
        />
        {a.type === "RRSP" || locked || a.type === "DCPP" ? (
          <NumberField
            label="Convert at age"
            hint={
              a.type === "RRSP"
                ? "Blank converts to a RRIF at 71, as the rules require."
                : "Blank converts at retirement."
            }
            value={a.conv || null}
            min={50}
            max={71}
            onChange={(v) => update(a.id, { conv: v ?? 0 })}
          />
        ) : null}
        {locked ? (
          <SelectField<JurisdictionKey>
            label="Pension jurisdiction"
            hint="Where the pension was earned — it governs unlocking and LIF limits, not where you live."
            value={a.juris}
            onChange={(v) => update(a.id, { juris: v })}
            options={JURISDICTIONS}
          />
        ) : null}
        <MonthlyMoneyField
          label="Scheduled withdrawal (per month)"
          hint="A withdrawal you take regardless of what the plan needs."
          annualValue={a.wd || null}
          onChangeAnnual={(v) => update(a.id, { wd: v ?? 0 })}
        />
        {a.wd ? (
          <>
            <NumberField
              label="Withdrawals start at age"
              value={a.wdStart || null}
              min={18}
              max={100}
              onChange={(v) => update(a.id, { wdStart: v ?? 0 })}
            />
            <NumberField
              label="Withdrawals stop at age"
              value={a.wdEnd || null}
              min={18}
              max={100}
              onChange={(v) => update(a.id, { wdEnd: v ?? 0 })}
            />
          </>
        ) : null}
        {a.type === "NONREG" ? (
          <>
            <NumberField
              label="Return that is interest"
              hint="Taxed at your full rate each year."
              suffix="%"
              value={pct(mix.int)}
              onChange={(v) => setMix({ int: (v ?? 0) / 100 })}
            />
            <NumberField
              label="Return that is eligible dividends"
              suffix="%"
              value={pct(mix.div)}
              onChange={(v) => setMix({ div: (v ?? 0) / 100 })}
            />
            <NumberField
              label="Return that is capital gains"
              hint="Only realized gains are taxed, at half inclusion."
              suffix="%"
              value={pct(mix.cg)}
              onChange={(v) => setMix({ cg: (v ?? 0) / 100 })}
            />
          </>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
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
            <CardTitle className="text-base">{a.name || accountTypeLabel(a.type)}</CardTitle>
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
            <TextField
              label="Account name"
              placeholder={accountTypeLabel(a.type)}
              hint="Leave it blank and we'll use the account type."
              value={a.name}
              onChange={(v) => update(a.id, { name: v })}
            />
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
            <SelectField
              label="Expected return"
              hint={`Assumed total return: ${(effectiveReturn(a, draft) * 100).toFixed(2)}%.`}
              value={presetKeyOf(a)}
              onChange={(k) => {
                if (k === "blend") return update(a.id, { retOverride: null });
                if (k === "custom")
                  return update(a.id, { retOverride: effectiveReturn(a, draft) });
                const preset = RETURN_PRESETS.find((p) => p.key === k);
                if (preset) update(a.id, { retOverride: preset.rate, eq: preset.eq });
              }}
              options={RETURN_OPTIONS}
            />
            {a.retOverride != null ? (
              <NumberField
                label="Return for this account"
                suffix="%"
                step={0.1}
                value={pct(a.retOverride)}
                onChange={(v) => update(a.id, { retOverride: (v ?? 0) / 100 })}
              />
            ) : null}
            <MonthlyMoneyField
              label="Contribution (per month)"
              hint="What you put into this account each month."
              annualValue={a.contrib || null}
              onChangeAnnual={(v) => update(a.id, { contrib: v ?? 0 })}
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
            <div className="sm:col-span-2">
              <AdvancedAccountFields account={a} update={update} />
            </div>
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

  // Assets are entered as calendar years; the engine works in Person A's ages.
  const me = draft.people[0];
  const meAge = me?.curAge ?? ageFromDob(me?.dob ?? null);
  const nowYear = new Date().getFullYear();
  const toYear = (age: number) => (meAge == null || !age ? null : nowYear + (age - meAge));
  const toAge = (year: number | null) =>
    year == null || meAge == null ? 0 : Math.max(0, Math.round(meAge + (year - nowYear)));

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
                label="Purchase price"
                hint="What you paid, including improvements. Used to work out the gain if a sale is taxable."
                prefix="$"
                value={h.acb || null}
                onChange={(v) => updateAsset(h.id!, { acb: v ?? 0 })}
              />
              <NumberField
                label="Expected growth"
                suffix="%"
                step={0.1}
                value={pct(h.apr)}
                onChange={(v) => updateAsset(h.id!, { apr: (v ?? 0) / 100 })}
              />
              <NumberField
                label="Costs associated with sale"
                hint="Commission, legal and closing costs in today's dollars. Taken off the proceeds and the taxable gain."
                prefix="$"
                value={h.sellCost || null}
                onChange={(v) => updateAsset(h.id!, { sellCost: v ?? 0 })}
              />
              <NumberField
                label="Future purchase date"
                hint={
                  meAge == null
                    ? "Enter your date of birth on the Household step first."
                    : "Calendar year you plan to buy. Leave blank if you already own it."
                }
                placeholder="Year"
                min={nowYear}
                value={toYear(h.buyAge ?? 0)}
                onChange={(v) => updateAsset(h.id!, { buyAge: toAge(v) })}
              />
              {h.buyAge ? (
                <NumberField
                  label="Purchase cost at that date"
                  hint="Today's dollars. It comes out of the plan in the year you buy."
                  prefix="$"
                  value={h.buyCost || null}
                  onChange={(v) => updateAsset(h.id!, { buyCost: v ?? 0 })}
                />
              ) : null}
              <NumberField
                label="Future sale date"
                hint={
                  meAge == null
                    ? "Enter your date of birth on the Household step first."
                    : "Calendar year you plan to sell. Proceeds go into non-registered savings."
                }
                placeholder="Year"
                min={nowYear}
                value={toYear(h.sale || 0)}
                onChange={(v) => updateAsset(h.id!, { sale: toAge(v) })}
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
        <div className="flex flex-wrap gap-2">
          {ASSET_PRESETS.map((preset) => (
            <Button
              key={preset.name}
              variant="secondary"
              onClick={() =>
                onChange({
                  ...draft,
                  hardAssets: [
                    ...draft.hardAssets,
                    {
                      id: uid(),
                      name: preset.name,
                      val: 0,
                      apr: preset.apr,
                      sale: 0,
                      dsAge: 0,
                      dsPct: 0,
                      taxable: preset.taxable,
                      acb: 0,
                    },
                  ],
                })
              }
            >
              <Plus className="mr-2 size-4" /> Add {preset.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Vehicles, boats and trailers lose value each year — the growth rate starts negative so
          your net worth reflects that. A principal residence is not taxable on sale; a cottage,
          rental or collectible is.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg">Mortgages and other debt</h3>
        {draft.liabilities.map((l) => {
          const monthly = monthlyFromAnnual(l.pay || null);
          const suggested = monthlyMortgagePayment(l.bal, l.rate, l.amortYears ?? 0);
          return (
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
                  hint="The rate on your renewal or loan agreement."
                  suffix="%"
                  step={0.01}
                  value={pct(l.rate)}
                  onChange={(v) => updateLiab(l.id!, { rate: (v ?? 0) / 100 })}
                />
                <NumberField
                  label="Amortization remaining"
                  hint="Years left to pay it off."
                  suffix="yrs"
                  step={1}
                  min={0}
                  max={40}
                  value={l.amortYears ?? null}
                  onChange={(v) => updateLiab(l.id!, { amortYears: v ?? 0 })}
                />
                <MonthlyMoneyField
                  label="Payment (per month)"
                  hint="Principal and interest only — not property tax or insurance."
                  step={10}
                  annualValue={l.pay || null}
                  onChangeAnnual={(v) => updateLiab(l.id!, { pay: v ?? 0 })}
                />
                <div className="flex flex-col justify-end gap-1">
                  <Button
                    variant="outline"
                    type="button"
                    disabled={!suggested}
                    onClick={() =>
                      updateLiab(l.id!, {
                        pay: Math.round(annualFromMonthly(suggested) ?? 0),
                      })
                    }
                  >
                    <Calculator className="mr-2 size-4" />
                    {suggested
                      ? `Use ${money(suggested)}/mo`
                      : "Calculate payment"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {suggested
                      ? "Level payment that clears the balance over the amortization, at Canadian semi-annual compounding."
                      : "Enter a balance, rate and amortization to calculate the payment."}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
        <Button
          variant="secondary"
          onClick={() =>
            onChange({
              ...draft,
              liabilities: [
                ...draft.liabilities,
                { id: uid(), name: "Mortgage", bal: 0, rate: 0.05, pay: 0, amortYears: 25 },
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
      <SectionCard title="What you spend today">
        <MonthlyMoneyField
          label="Household spending (per month)"
          hint="Everything the household actually spends now, after tax — housing, food, cars, travel, the lot. Debt payments are counted separately."
          step={100}
          annualValue={draft.currentSpend ?? null}
          onChangeAnnual={(v) => onChange({ ...draft, currentSpend: v })}
        />
      </SectionCard>

      <SectionCard title="Retirement spending">
        <MonthlyMoneyField
          label="Retirement spending after tax (per month)"
          hint="Today's dollars, for the whole household. Everything the plan has to fund."
          step={100}
          annualValue={draft.spendNeed}
          onChangeAnnual={(v) => onChange({ ...draft, spendNeed: v })}
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

function ownerOptions(draft: PlanDraft): { value: OwnerKey; label: string }[] {
  return [
    { value: "A", label: draft.people[0]?.firstName || "You" },
    ...(draft.people.length > 1
      ? [{ value: "B" as OwnerKey, label: draft.people[1]?.firstName || "Spouse" }]
      : []),
    { value: "JOINT", label: "Joint" },
  ];
}

const LUMP_DESTINATIONS: { value: AccountType; label: string }[] = [
  { value: "NONREG", label: "Non-registered savings" },
  { value: "TFSA", label: "TFSA" },
  { value: "RRSP", label: "RRSP" },
];

function ToggleRow({
  title,
  note,
  checked,
  onChange,
}: {
  title: string;
  note?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function OtherIncomeStep({ draft, onChange }: StepProps) {
  const owners = ownerOptions(draft);
  const updateStream = (i: number, patch: Partial<OtherIncomeInput>) =>
    onChange({
      ...draft,
      otherIncome: draft.otherIncome.map((x, j) => (i === j ? { ...x, ...patch } : x)),
    });
  const updateLump = (i: number, patch: Partial<LumpSumInput>) =>
    onChange({
      ...draft,
      lumpSums: draft.lumpSums.map((x, j) => (i === j ? { ...x, ...patch } : x)),
    });

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div>
          <h3 className="text-lg">Recurring income</h3>
          <p className="text-sm text-muted-foreground">
            Rent, a side business, support payments, an annuity — anything that arrives year after
            year. Say when it starts and when it stops.
          </p>
        </div>

        {draft.otherIncome.map((s, i) => (
          <Card key={s.id ?? i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">{s.name || "Recurring income"}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove income"
                onClick={() =>
                  onChange({
                    ...draft,
                    otherIncome: draft.otherIncome.filter((_, j) => j !== i),
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="What is it?"
                placeholder="Rental income"
                value={s.name}
                onChange={(v) => updateStream(i, { name: v })}
              />
              <MonthlyMoneyField
                label="Amount per month"
                hint="Today's dollars, before tax."
                annualValue={s.amt || null}
                onChangeAnnual={(v) => updateStream(i, { amt: v ?? 0 })}
              />
              <SelectField<OwnerKey>
                label="Whose income is it?"
                value={s.owner}
                onChange={(v) => updateStream(i, { owner: v })}
                options={owners}
              />
              <NumberField
                label="Starts at age"
                hint="The owner's age when it begins."
                value={s.start || null}
                onChange={(v) => updateStream(i, { start: v ?? 0 })}
              />
              <NumberField
                label="Stops at age"
                hint="Leave blank if it never stops."
                value={s.end || null}
                onChange={(v) => updateStream(i, { end: v ?? 0 })}
              />
              <div className="grid gap-3">
                <ToggleRow
                  title="Taxable"
                  note="Rent and business income are; a tax-free benefit is not."
                  checked={s.taxable}
                  onChange={(c) => updateStream(i, { taxable: c })}
                />
                <ToggleRow
                  title="Rises with inflation"
                  note="Off keeps it flat in today's dollars."
                  checked={s.indexed}
                  onChange={(c) => updateStream(i, { indexed: c })}
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
              otherIncome: [
                ...draft.otherIncome,
                {
                  id: uid(),
                  name: "",
                  amt: 0,
                  owner: "A",
                  start: 0,
                  end: 0,
                  taxable: true,
                  indexed: true,
                },
              ],
            })
          }
        >
          <Plus className="mr-2 size-4" /> Add recurring income
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-lg">One-time amounts</h3>
          <p className="text-sm text-muted-foreground">
            A bonus, an inheritance, a severance package, the sale of a business. It lands once, in
            the year you choose, and goes into the account you pick.
          </p>
        </div>

        {draft.lumpSums.map((l, i) => (
          <Card key={l.id ?? i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">{l.name || "One-time amount"}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove amount"
                onClick={() =>
                  onChange({ ...draft, lumpSums: draft.lumpSums.filter((_, j) => j !== i) })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="What is it?"
                placeholder="Inheritance"
                value={l.name}
                onChange={(v) => updateLump(i, { name: v })}
              />
              <NumberField
                label="Amount"
                hint="Today's dollars."
                prefix="$"
                value={l.amt || null}
                onChange={(v) => updateLump(i, { amt: v ?? 0 })}
              />
              <SelectField<"A" | "B">
                label="Whose is it?"
                value={l.owner}
                onChange={(v) => updateLump(i, { owner: v })}
                options={owners
                  .filter((o) => o.value !== "JOINT")
                  .map((o) => ({ value: o.value as "A" | "B", label: o.label }))}
              />
              <NumberField
                label="Arrives at age"
                value={l.age || null}
                onChange={(v) => updateLump(i, { age: v ?? 0 })}
              />
              <SelectField<AccountType>
                label="Where does it go?"
                value={l.dest}
                onChange={(v) => updateLump(i, { dest: v })}
                options={LUMP_DESTINATIONS}
              />
              <ToggleRow
                title="Taxable"
                note="An inheritance is not taxable to you; a bonus or severance is."
                checked={l.taxable}
                onChange={(c) => updateLump(i, { taxable: c })}
              />
            </CardContent>
          </Card>
        ))}

        <Button
          variant="secondary"
          onClick={() =>
            onChange({
              ...draft,
              lumpSums: [
                ...draft.lumpSums,
                {
                  id: uid(),
                  name: "",
                  age: 0,
                  amt: 0,
                  dest: "NONREG",
                  owner: "A",
                  taxable: false,
                },
              ],
            })
          }
        >
          <Plus className="mr-2 size-4" /> Add a one-time amount
        </Button>
      </div>
    </div>
  );
}

function AssumptionsStep({ draft, onChange }: StepProps) {
  // The rate the whole portfolio is assumed to earn, weighted by balance.
  const total = draft.accounts.reduce((t, a) => t + Math.max(0, a.bal), 0);
  const blended = total
    ? draft.accounts.reduce((t, a) => t + Math.max(0, a.bal) * effectiveReturn(a, draft), 0) / total
    : null;
  const simpleBlend = 0.6 * draft.eqRet + 0.4 * draft.fiRet;

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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your assumed total rate of return</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="tabular text-3xl font-semibold">
            {((blended ?? simpleBlend) * 100).toFixed(2)}%
          </p>
          <p className="text-sm text-muted-foreground">
            {blended != null
              ? "Weighted across every account by its balance, using each account's own return where you set one."
              : `A 60/40 blend of your equity and fixed-income assumptions. Add account balances and this becomes the weighted rate for your actual portfolio.`}
          </p>
          {blended != null ? (
            <ul className="space-y-1 pt-1 text-sm">
              {draft.accounts.map((a) => (
                <li key={a.id} className="flex justify-between border-t pt-1">
                  <span>{a.name || accountTypeLabel(a.type)}</span>
                  <span className="tabular">{(effectiveReturn(a, draft) * 100).toFixed(2)}%</span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

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
    case "other":
      return <OtherIncomeStep {...props} />;
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
