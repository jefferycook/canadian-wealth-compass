/**
 * Typed plan inputs for the Canadian retirement & tax projection engine.
 *
 * These types are the contract that replaced the original tool's DOM scraping.
 * The engine is pure: it reads a `PlanInputs` object and returns a
 * `ProjectionResult`. Nothing here touches the browser, storage, or network.
 */

import type { PersonRoomYear } from "./room";

/* ------------------------------------------------------------------ */
/* VALID-1 — rule status, component status and result validity         */
/* ------------------------------------------------------------------ */

/**
 * The verification status of a rule or rule component. This is the single
 * definition in the codebase; `registered.ts` imports it from here.
 */
export type RuleStatus = "VERIFIED" | "APPROXIMATE" | "UNSUPPORTED";

export type ResultValidity = "OK" | "APPROXIMATE" | "WITHHELD";

export interface ValidityReason {
  /** Stable machine-readable identifier. Tests assert this, never the prose. */
  code: string;
  /** Client-facing sentence. */
  detail: string;
}

interface ComponentStatusDefinition {
  /** Status used unless the point of use supplies a rule-record status. */
  status: RuleStatus;
  substitutive: boolean;
  group?: "cppSurvivor";
  /** Existing hard gate that may replace an automatic ordering with a fallback. */
  blocksAutomaticSelection?: boolean;
  /** Every non-VERIFIED use must have one centrally registered reason. */
  reason?: ValidityReason;
}

const CPP_SURVIVOR_REASON: ValidityReason = {
  code: "CPP_SURVIVOR_REDUCTION_APPROXIMATE",
  detail:
    "The CPP survivor's pension uses a simplified combined-maximum reduction " +
    "rather than the statutory component-level calculation, and the statutory " +
    "base-portion cap is not applied. Because the split of the CPP entitlement " +
    "into its base and enhanced portions is not available to this plan, the " +
    "statutory amount may be higher or lower than the figure shown, potentially " +
    "materially. This figure is shown for planning context and is not used to " +
    "generate recommendations.",
};

/**
 * Authoritative locked-in status-source schema. The component registry and the
 * `UnlockRule` status-bearing fields are both derived from these keys, so a new
 * production rule-status source cannot be added to one without appearing in
 * the other.
 */
export const LOCKED_IN_STATUS_SOURCES = {
  unlockEntitlement: {
    component: "lockedIn.unlockEntitlement",
    definition: {
      status: "VERIFIED",
      substitutive: false,
      reason: {
        code: "LOCKED_IN_UNLOCK_ENTITLEMENT_NOT_VERIFIED",
        detail:
          "An unlocking entitlement that participates in this projection is not " +
          "regulator-verified. An approximate entitlement is modelled as disclosed; " +
          "an unavailable entitlement is refused without substituting another " +
          "jurisdiction's rule. Projection-derived recommendations are suppressed.",
      },
    },
  },
  destinationVehicle: {
    component: "lockedIn.destinationVehicle",
    definition: {
      status: "VERIFIED",
      substitutive: false,
      reason: {
        code: "LOCKED_IN_DESTINATION_VEHICLE_NOT_VERIFIED",
        detail:
          "A destination vehicle used for unlocked pension money is not " +
          "regulator-verified. It participates only when a transfer is modelled; " +
          "projection-derived recommendations are suppressed while it is used.",
      },
    },
  },
  lifMaximum: {
    component: "lockedIn.lifMaximum",
    definition: {
      status: "VERIFIED",
      substitutive: false,
      reason: {
        code: "LIF_MAXIMUM_NOT_VERIFIED",
        detail:
          "A LIF maximum that participates in this projection is not regulator-verified. " +
          "An available approximate maximum is enforced as disclosed; when the maximum " +
          "is unavailable, additional LIF withdrawals are refused without substituting " +
          "another jurisdiction's rule. Projection-derived recommendations are suppressed.",
      },
    },
  },
} as const satisfies Record<
  string,
  { component: string; definition: ComponentStatusDefinition }
>;

export type LockedInStatusSourceKey = keyof typeof LOCKED_IN_STATUS_SOURCES;

type LockedInComponentStatusRegistry = {
  [K in LockedInStatusSourceKey as (typeof LOCKED_IN_STATUS_SOURCES)[K]["component"]]:
    (typeof LOCKED_IN_STATUS_SOURCES)[K]["definition"];
};

const LOCKED_IN_COMPONENT_STATUS_REGISTRY = Object.fromEntries(
  Object.values(LOCKED_IN_STATUS_SOURCES).map((source) => [
    source.component,
    source.definition,
  ]),
) as LockedInComponentStatusRegistry;

/**
 * VALID-2's single typed registry for every engine component that can affect
 * validity or advice. Projection results are generated from this object, so a
 * component cannot be added to one manually maintained list while being
 * omitted from another.
 */
export const COMPONENT_STATUS_REGISTRY = {
  "cpp.survivorOwnPensionUnadjusted": {
    status: "VERIFIED",
    substitutive: false,
    group: "cppSurvivor",
  },
  "cpp.survivorIndexationBasis": {
    status: "VERIFIED",
    substitutive: false,
    group: "cppSurvivor",
  },
  "cpp.survivorPayabilityPredicate": {
    status: "VERIFIED",
    substitutive: false,
    group: "cppSurvivor",
  },
  "cpp.survivorBranchRates": {
    status: "VERIFIED",
    substitutive: false,
    group: "cppSurvivor",
  },
  "cpp.survivorReduction": {
    status: "APPROXIMATE",
    substitutive: false,
    group: "cppSurvivor",
    blocksAutomaticSelection: true,
    reason: CPP_SURVIVOR_REASON,
  },
  "cpp.survivorBaseCap": {
    status: "UNSUPPORTED",
    substitutive: false,
    group: "cppSurvivor",
    blocksAutomaticSelection: true,
    reason: CPP_SURVIVOR_REASON,
  },
  "rrif.establishmentYearAmbiguousStart": {
    status: "APPROXIMATE",
    substitutive: false,
    blocksAutomaticSelection: true,
    reason: {
      code: "RRIF_ESTABLISHMENT_DATE_UNKNOWN",
      detail:
        "A registered account already met its conversion condition in the first " +
        "year of this plan, and the plan does not record the date the fund was " +
        "entered into. The projection assumes the fund was entered into before the " +
        "projection began and charges a minimum withdrawal for that first year. " +
        "That is the conservative assumption: a fund actually entered into during " +
        "the first year would have no minimum amount for that year, so the " +
        "mandatory withdrawal and the tax on it may be overstated in year one.",
    },
  },
  "rrif.transferRetention": {
    status: "UNSUPPORTED",
    substitutive: true,
    blocksAutomaticSelection: true,
    reason: {
      code: "RRIF_TRANSFER_RETENTION_NOT_ENFORCED",
      detail:
        "The plan models a transfer out of a fund that left it short of the " +
        "minimum amount it was required to pay for that year. Federal law requires " +
        "the transferring fund to retain enough to make that payment, so a carrier " +
        "would have restricted the transfer instead. The projection from that year " +
        "forward describes a transaction that is not permitted, and its figures are " +
        "not fit to advise on.",
    },
  },
  ...LOCKED_IN_COMPONENT_STATUS_REGISTRY,
  "taxYear.derived": {
    status: "APPROXIMATE",
    substitutive: false,
    reason: {
      code: "TAX_YEAR_DERIVED",
      detail:
        "At least one projected year uses an indexed tax-year record rather than a " +
        "published table. Projection-derived recommendations are suppressed for " +
        "figures that depend on those derived values.",
    },
  },
  "estate.afterTaxHaircut": {
    status: "APPROXIMATE",
    substitutive: false,
    reason: {
      code: "ESTATE_AFTER_TAX_HAIRCUT_APPROXIMATE",
      detail:
        "Automatic withdrawal ordering used an approximate after-tax estate haircut " +
        "to compare strategies. Projection-derived recommendations are suppressed " +
        "while that comparison rule is engaged.",
    },
  },
  "rrif.ageBasisWholeYear": {
    status: "APPROXIMATE",
    substitutive: false,
    reason: {
      code: "RRIF_AGE_BASIS_WHOLE_YEAR",
      detail:
        "An RRIF minimum or LIF maximum factor uses the projection's whole-year age " +
        "proxy rather than a date-of-birth-derived statutory age. Projection-derived " +
        "recommendations are suppressed while that lookup participates.",
    },
  },
  "payroll.employeePremiums": {
    status: "UNSUPPORTED",
    substitutive: false,
    reason: {
      code: "PAYROLL_PREMIUMS_NOT_MODELLED",
      detail:
        "Employee CPP, CPP2 and EI premiums are not deducted; spendable cash is " +
        "therefore overstated, and projection-derived recommendations are suppressed " +
        "while employment income is present.",
    },
  },
} as const satisfies Record<string, ComponentStatusDefinition>;

export type ComponentId = keyof typeof COMPONENT_STATUS_REGISTRY;

export interface ComponentStatusSource {
  component: ComponentId;
  status: RuleStatus;
}

/** Build a fixed or runtime-status source only from the authoritative registry. */
export function componentStatusSource(
  component: ComponentId,
  status?: RuleStatus,
): ComponentStatusSource {
  const definition = (COMPONENT_STATUS_REGISTRY as Record<string, ComponentStatusDefinition>)[
    component
  ];
  if (!definition) throw new Error(`Unregistered component status: ${String(component)}`);
  return { component, status: status ?? definition.status };
}

/** Resolve a locked-in rule field through the authoritative source schema. */
export function lockedInStatusSource(
  source: LockedInStatusSourceKey,
  status: RuleStatus,
): ComponentStatusSource {
  return componentStatusSource(LOCKED_IN_STATUS_SOURCES[source].component, status);
}

/**
 * The status of one rule component that participated in producing a figure.
 *
 * This is deliberately NOT `recordStatus()` from `registered.ts`, which is the
 * locked-in unlocking reducer and is keyed by pension jurisdiction. This
 * structure is per-figure and jurisdiction-independent.
 */
export interface ComponentStatusEntry {
  /** Stable identifier, e.g. "cpp.survivorReduction". Tests assert this. */
  component: ComponentId;
  status: RuleStatus;
  /**
   * True when the component participated in producing a figure in this run.
   * A component that never engaged neither affects validity nor blocks advice.
   */
  engaged: boolean;
  /**
   * True when an UNSUPPORTED component was handled by SUBSTITUTING another
   * jurisdiction's rule or a stand-in value. False when it is simply an omitted
   * limb whose absence is declared.
   *
   * §13.2's requirement to refuse and withhold is about substitution. A declared
   * omission is disclosed, not substituted, so it does not force WITHHELD.
   */
  substitutive: boolean;
}

const RULE_STATUS_RANK: Record<RuleStatus, number> = {
  VERIFIED: 0,
  APPROXIMATE: 1,
  UNSUPPORTED: 2,
};

/**
 * Registry-backed accumulator for one row or one full run. An engaged
 * non-VERIFIED status without a registered reason throws immediately, which is
 * the runtime half of VALID-2's coverage guard.
 */
export class ComponentStatusTracker {
  private readonly observed = new Map<ComponentId, RuleStatus>();
  private readonly engaged = new Map<ComponentId, RuleStatus>();

  observe(component: ComponentId, status: RuleStatus): void {
    const definition = (COMPONENT_STATUS_REGISTRY as Record<string, ComponentStatusDefinition>)[
      component
    ];
    if (!definition) throw new Error(`Unregistered component status: ${String(component)}`);
    if (status !== "VERIFIED" && !definition.reason) {
      throw new Error(`Non-VERIFIED component has no registered reason: ${component}`);
    }
    const previous = this.observed.get(component);
    if (!previous || RULE_STATUS_RANK[status] > RULE_STATUS_RANK[previous]) {
      this.observed.set(component, status);
    }
  }

  engage(component: ComponentId, status?: RuleStatus): void {
    const definition = (COMPONENT_STATUS_REGISTRY as Record<string, ComponentStatusDefinition>)[
      component
    ];
    if (!definition) throw new Error(`Unregistered component status: ${String(component)}`);
    const next = status ?? definition.status;
    this.observe(component, next);
    const previous = this.engaged.get(component);
    if (!previous || RULE_STATUS_RANK[next] > RULE_STATUS_RANK[previous]) {
      this.engaged.set(component, next);
    }
  }

  /** Engage a point-of-use rule only when its actual status is non-VERIFIED. */
  engageIfNonVerified(component: ComponentId, status: RuleStatus): void {
    this.observe(component, status);
    if (status !== "VERIFIED") this.engage(component, status);
  }

  engageGroup(group: NonNullable<ComponentStatusDefinition["group"]>): void {
    for (const component of Object.keys(COMPONENT_STATUS_REGISTRY) as ComponentId[]) {
      const definition = COMPONENT_STATUS_REGISTRY[component] as ComponentStatusDefinition;
      if (definition.group === group) this.engage(component);
    }
  }

  merge(entries: ComponentStatusEntry[]): void {
    for (const entry of entries) {
      this.observe(entry.component, entry.status);
      if (entry.engaged) this.engage(entry.component, entry.status);
    }
  }

  entries(): ComponentStatusEntry[] {
    return (Object.keys(COMPONENT_STATUS_REGISTRY) as ComponentId[]).map((component) => {
      const definition = COMPONENT_STATUS_REGISTRY[component];
      return {
        component,
        status: this.engaged.get(component) ?? this.observed.get(component) ?? definition.status,
        engaged: this.engaged.has(component),
        substitutive: definition.substitutive,
      };
    });
  }

  reasons(): ValidityReason[] {
    const seen = new Set<string>();
    const reasons: ValidityReason[] = [];
    for (const entry of this.entries()) {
      if (!entry.engaged || entry.status === "VERIFIED") continue;
      const reason = (COMPONENT_STATUS_REGISTRY[entry.component] as ComponentStatusDefinition).reason;
      if (!reason || seen.has(reason.code)) continue;
      seen.add(reason.code);
      reasons.push(reason);
    }
    return reasons;
  }
}

/**
 * Record one typed production status source at its point of use. Observation is
 * run-level; an actually used non-VERIFIED source is engaged in both the row
 * and the full run, so row validity and advice gating cannot diverge.
 */
export function recordComponentStatusUse(
  rowTracker: ComponentStatusTracker,
  runTracker: ComponentStatusTracker,
  source: ComponentStatusSource,
  used: boolean,
): void {
  runTracker.observe(source.component, source.status);
  if (!used || source.status === "VERIFIED") return;
  rowTracker.engage(source.component, source.status);
  runTracker.engage(source.component, source.status);
}

/**
 * Status-backed disclosures can be added only through `addForStatus`, which
 * records the same authoritative source before retaining the display string.
 * Plain notices are reserved for refusals where no figure was produced.
 */
export class ComponentDisclosureCollector {
  private readonly disclosures = new Set<string>();

  addForStatus(
    rowTracker: ComponentStatusTracker,
    runTracker: ComponentStatusTracker,
    source: ComponentStatusSource,
    used: boolean,
    detail: string,
  ): void {
    recordComponentStatusUse(rowTracker, runTracker, source, used);
    if (used && source.status !== "VERIFIED") this.disclosures.add(detail);
  }

  addRefusal(detail: string): void {
    this.disclosures.add(detail);
  }

  values(): string[] {
    return [...this.disclosures];
  }
}

/** Add one result-level component while preserving the registry's full shape. */
export function engageResultComponent(
  entries: ComponentStatusEntry[],
  component: ComponentId,
  status?: RuleStatus,
): ComponentStatusEntry[] {
  const tracker = new ComponentStatusTracker();
  tracker.merge(entries);
  tracker.engage(component, status);
  return tracker.entries();
}

const VALIDITY_RANK: Record<ResultValidity, number> = {
  OK: 0,
  APPROXIMATE: 1,
  WITHHELD: 2,
};

/** The more severe of two validity levels: OK < APPROXIMATE < WITHHELD. */
export function worstValidity(a: ResultValidity, b: ResultValidity): ResultValidity {
  return VALIDITY_RANK[a] >= VALIDITY_RANK[b] ? a : b;
}

/**
 * The §2.3 mapping from engaged component statuses to a row's own validity.
 *   1. engaged UNSUPPORTED and substitutive -> WITHHELD
 *   2. otherwise any engaged non-VERIFIED   -> APPROXIMATE
 *   3. otherwise                            -> OK
 */
export function validityFromComponents(
  entries: ComponentStatusEntry[],
): ResultValidity {
  const engaged = entries.filter((e) => e.engaged);
  if (engaged.some((e) => e.status === "UNSUPPORTED" && e.substitutive)) return "WITHHELD";
  if (engaged.some((e) => e.status !== "VERIFIED")) return "APPROXIMATE";
  return "OK";
}

/** A figure may drive a recommendation only when every engaged component is VERIFIED. */
export function isAdviceGrade(status: RuleStatus): boolean {
  return status === "VERIFIED";
}

/** The engaged, non-VERIFIED components that block generated advice. */
export function adviceBlockers(
  entries: ComponentStatusEntry[],
): ComponentStatusEntry[] {
  return entries.filter((e) => e.engaged && !isAdviceGrade(e.status));
}

/**
 * Components that may change an automatic ordering to the legacy deterministic
 * fallback. VALID-2 coverage components suppress downstream recommendations
 * but do not change the selected projection, preserving numerical anchors.
 */
export function automaticSelectionBlockers(
  entries: ComponentStatusEntry[],
): ComponentStatusEntry[] {
  return adviceBlockers(entries).filter(
    (entry) =>
      (COMPONENT_STATUS_REGISTRY[entry.component] as ComponentStatusDefinition)
        .blocksAutomaticSelection === true,
  );
}




export type ProvinceKey =
  | "AB"
  | "BC"
  | "MB"
  | "NB"
  | "NL"
  | "NS"
  | "NT"
  | "NU"
  | "ON"
  | "PE"
  | "QC"
  | "SK"
  | "YT"
  | "CUSTOM";

/** Pension jurisdiction governing locked-in (LIRA/LIF) money. */
export type JurisdictionKey =
  | "ON"
  | "FED"
  | "AB"
  | "MB"
  | "NS"
  | "NB"
  | "BC"
  | "QC"
  /** Saskatchewan is UNSUPPORTED in Batch 0C (Erratum 4); saved plans must still load. */
  | "SK";

export type AccountType =
  | "RRSP"
  | "RRIF"
  | "LIRA"
  | "LIF"
  | "DCPP"
  /** Manitoba prescribed RRIF: RRIF minimums, no maximum, pension-eligible at 65+. */
  | "PRRIF"
  | "TFSA"
  | "NONREG";

/** 'A' and 'B' are the two people; 'JOINT' is owned together. */
export type OwnerKey = "A" | "B" | "JOINT";

export type PersonKey = "A" | "B";

/**
 * Relationship status. Married and common-law partners are spouses for
 * income-splitting, spousal rollovers and the CPP survivor's pension.
 * 'partners' get none of the three. 'single' is a one-person plan.
 */
export type PlanType = "single" | "married" | "commonlaw" | "partners";

export type WithdrawalStrategy =
  | "auto"
  | "nonreg_reg_tfsa"
  | "reg_nonreg_tfsa"
  | "tfsa_nonreg_reg"
  | "prorata";

/** A dated benefit stream entered as the age-65 entitlement. */
export interface BenefitInput {
  /** Annual amount in today's dollars, as the age-65 entitlement. */
  amt: number;
  /** Age the benefit starts. */
  age: number;
}

/**
 * Source classification for a bridge-style benefit.
 *
 * CRA treats bridging benefits as *temporary* benefits, distinct from RPP
 * lifetime retirement benefits, so a payment is not pension-income-credit
 * eligible merely because it is labelled "bridge" or paid by an RPP.
 * Only a stream classified as an RPP lifetime retirement benefit may be
 * affirmed as eligible; RCA/SERP/non-registered supplements never can be.
 */
export type BridgeSourceClass =
  | "RPP_BRIDGE"
  | "RPP_LIFETIME"
  | "RCA"
  | "SERP"
  | "NONREG"
  | "OTHER";

export interface BridgeInput {
  /** Annual bridge benefit in today's dollars. */
  amt: number;
  /** Age the bridge ends (usually 65, when CPP/OAS begin). */
  end: number;
  /**
   * Optional source classification. Absent on plans saved before this field
   * existed; absent is treated as "RPP_BRIDGE" (temporary, not eligible).
   */
  sourceClass?: BridgeSourceClass;
  /**
   * Explicit affirmation that the stream is an RPP lifetime retirement
   * benefit. Defaults to false; never inferred. Not yet user-facing — a future
   * batch must add the input and its disclosure text.
   */
  eligibleAffirmed?: boolean;
}

/**
 * A bridge stream enters the pension income credit and pension splitting only
 * when it is explicitly affirmed AND its source class permits affirmation.
 */
export function bridgeIsPensionEligible(b: BridgeInput | undefined): boolean {
  if (!b) return false;
  return b.eligibleAffirmed === true && b.sourceClass === "RPP_LIFETIME";
}


export interface PersonInput {
  id: PersonKey;
  firstName: string;
  lastName: string;
  /** Date of birth, ISO yyyy-mm-dd. Authoritative when a draft is normalized. */
  dob?: string;
  /** Runtime current age in whole years; persisted drafts may use it as a legacy fallback. */
  curAge: number;
  /** Retirement age. Use 999 for "already retired / never works". */
  retAge: number;
  /** Pre-retirement employment income, today's dollars. */
  employ: number;
  /** Age at death for survivor modelling. 0 = not modelled. */
  deathAge: number;
  cpp: BenefitInput;
  oas: BenefitInput;
  /** Defined-benefit workplace pension. */
  pen: BenefitInput;
  bridge: BridgeInput;
  gender?: string;
  /**
   * Current available TFSA contribution room at the plan start date, as shown
   * by CRA. Used verbatim in the plan-start year (Erratum 2) — it already
   * includes this year's dollar limit. Null means unknown, which is zero
   * verified capacity, never the annual limit and never unlimited.
   */
  tfsaRoom?: number | null;
  /** Current available RRSP *contribution room* at the plan start date. */
  rrspRoom?: number | null;
  /**
   * RRSP deduction limit from the Notice of Assessment. Optional; when absent
   * it is derived from the CRA identity
   * `deduction limit = contribution room + undeducted contributions`.
   */
  rrspDeductionLimitOpen?: number | null;
  /** Contributions already made but not yet deducted. */
  rrspUndeductedContributions?: number | null;
  /**
   * Pension adjustment for the plan-start year. Null means unknown; for a
   * pension-plan member a zero PA is only ever a disclosed estimate.
   */
  pensionAdjustment?: number | null;
  /** TFSA withdrawals in the year before the plan starts, if reported. */
  tfsaWithdrawalsPriorYear?: number | null;
  /** Earned income history, most recent last. Optional. */
  earnedIncomeHistory?: number[];

}

/** Non-registered return mix, as fractions summing to 1. */
export interface ReturnMix {
  int: number;
  div: number;
  cg: number;
}

export interface AccountInput {
  id: string;
  name: string;
  type: AccountType;
  owner: OwnerKey;
  /** Current balance. */
  bal: number;
  /** Equity allocation percent, 0-100. */
  eq: number;
  /** Adjusted cost base (non-registered). */
  acb: number;
  /** Explicit conversion age. 0 = auto (RRSP at 71, LIRA/DC at retirement). */
  conv: number;
  /** Percent of a LIRA/LIF to unlock into an RRSP. 0 = none. */
  unlock: number;
  juris: JurisdictionKey;
  /**
   * Expected return for this account as a fraction, overriding the blend
   * implied by the equity allocation. Null/undefined means "use the blend".
   */
  retOverride?: number | null;
  /** Annual contribution in today's dollars. */
  contrib: number;
  /** Contribute until this owner age. 0 = no end. */
  contribEnd: number;
  /** Scheduled annual withdrawal in today's dollars. */
  wd: number;
  wdStart: number;
  wdEnd: number;
  mix: ReturnMix;
  /**
   * Batch 0D (§6.1). Optional explicit distribution yields, as non-negative
   * fractions of the balance. When absent the legacy `mix` convention applies,
   * so saved plans need no migration. Non-eligible dividends are deliberately
   * absent: §6.2 remains an open gap in the verified rules layer.
   */
  yields?: {
    interest?: number | null;
    eligDiv?: number | null;
    cgDist?: number | null;
    roc?: number | null;
  } | null;
}

export interface ExpenseInput {
  /** Stable row id, used as a UI key. */
  id?: string;
  name: string;
  /** Person A's age when the expense lands. */
  age: number;
  /** Amount in today's dollars. */
  amt: number;
}

export interface OtherIncomeInput {
  /** Stable row id, used as a UI key. */
  id?: string;
  name: string;
  /** Annual amount in today's dollars. */
  amt: number;
  owner: OwnerKey;
  start: number;
  end: number;
  taxable: boolean;
  indexed: boolean;
}

export interface LumpSumInput {
  /** Stable row id, used as a UI key. */
  id?: string;
  name: string;
  /** Owner's age when it arrives. */
  age: number;
  amt: number;
  dest: AccountType;
  owner: PersonKey;
  taxable: boolean;
}

export interface HardAssetInput {
  /** Stable row id, used as a UI key. */
  id?: string;
  name: string;
  /** Current value. */
  val: number;
  /** Annual appreciation as a fraction (0.03 = 3%). */
  apr: number;
  /** Person A's age at full sale. 0 = never. */
  sale: number;
  /** Person A's age at a future purchase. 0 = already owned. */
  buyAge?: number;
  /** Purchase price in today's dollars, for a future purchase. */
  buyCost?: number;
  /** Person A's age at downsize. 0 = never. */
  dsAge: number;
  /** Percent of value freed by the downsize. */
  dsPct: number;
  /** Whether a gain on sale is taxable (a principal residence is not). */
  taxable: boolean;
  acb: number;
  /** Selling costs (commission, legal, staging) in today's dollars. */
  sellCost?: number;
}

export interface LiabilityInput {
  /** Stable row id, used as a UI key. */
  id?: string;
  name: string;
  bal: number;
  /** Annual interest rate as a fraction. */
  rate: number;
  /** Annual payment. The UI collects a monthly figure and multiplies by 12. */
  pay: number;
  /**
   * Years left to pay the loan off. Presentation only — the projection runs
   * off balance, rate and payment — but it lets the tool calculate a payment.
   */
  amortYears?: number;
}

/** Tax settings that the original tool exposed as editable advanced fields. */
export interface TaxSettings {
  provinceKey: ProvinceKey;
  /** Federal basic personal amount (maximum, before phase-out). */
  fedBPA: number;
  /** Provincial basic personal amount. */
  provBPA: number;
  /** OAS recovery-tax threshold. */
  oasThresh: number;
  /** LIF maximum reference rate, percent. */
  lifRate: number;
}

export interface PlanInputs {
  /** Tax year whose constants apply. */
  taxYear: number;
  planType: PlanType;
  /** Project to Person A's age. */
  endAge: number;
  /** Annual inflation as a fraction. */
  inflation: number;
  /**
   * Batch 0D. Annual indexation rate applied to statutory amounts in years
   * beyond the last published tax table. Null/absent = use `inflation`.
   */
  indexationRate?: number | null;
  /** Household after-tax spending need in retirement, today's dollars. */
  spendNeed: number;
  /**
   * Household after-tax spending today, while still working. Null means the
   * client has not said, and retirement spending is used throughout.
   */
  currentSpend?: number | null;
  /** Expected equity return as a fraction. */
  eqRet: number;
  /** Expected fixed-income return as a fraction. */
  fiRet: number;
  /** Share of a deceased's DB pension continuing to the survivor, as a fraction. */
  survivorPct: number;
  strategy: WithdrawalStrategy;
  tax: TaxSettings;
  people: PersonInput[];
  accounts: AccountInput[];
  expenses: ExpenseInput[];
  otherIncome: OtherIncomeInput[];
  lumpSums: LumpSumInput[];
  hardAssets: HardAssetInput[];
  liabilities: LiabilityInput[];
}

/* ------------------------------------------------------------------ */
/* Tax engine shapes                                                   */
/* ------------------------------------------------------------------ */

export interface IncomeComponents {
  ordinary: number;
  eligDiv: number;
  capGainsTaxable: number;
  /**
   * @deprecated Erratum 5 — legacy single scalar. Still accepted, and treated
   * as `pensionEligibleAnyAge`, so hand-built inputs keep their meaning.
   */
  pensionEligible?: number;
  /**
   * Erratum 5: RPP lifetime retirement benefits (plus a bridge affirmed as
   * RPP_LIFETIME). Credit-eligible at ANY age, for the pensioner and for a
   * transferee who receives it through a T1032 split.
   */
  pensionEligibleAnyAge?: number;
  /**
   * Erratum 5: RRIF / LIF / PRRIF cash. Already gated to 65+ for the holder by
   * Erratum 1; for a transferee it counts only if the TRANSFEREE is 65+.
   */
  pensionEligible65Plus?: number;
  oasReceived: number;
  age: number;
  /**
   * RRSP deduction claimed this year. A Division C style deduction: it reduces
   * both taxable income and the net-income base that credits and the OAS
   * recovery tax are measured against.
   */
  rrspDeduction?: number;
}


export interface TaxResult {
  tax: number;
  taxable: number;
  netIncome: number;
  oasClawback: number;
  /** Tax before the OAS recovery tax, used for marginal-rate probing. */
  marginalBase: number;
}

export interface HouseholdTaxResult {
  tax: number;
  perPerson: TaxResult[];
  /** Amount of pension income shifted between spouses. */
  splitAmt: number;
  /** Index of the person who transferred income, or -1. */
  dir: number;
}

/* ------------------------------------------------------------------ */
/* Projection output                                                   */
/* ------------------------------------------------------------------ */

export interface PerPersonRow {
  name: string;
  age: number;
  alive: boolean;
  taxable: number;
  tax: number;
}

export interface ProjectionRow {
  /** Years from the start of the projection. */
  off: number;
  /** Calendar year. */
  yr: number;
  /** Cumulative inflation factor at this offset. */
  infFac: number;
  ages: number[];
  /** Person A's age; the timeline reference. */
  age: number;
  balances: Record<string, number>;
  contribTotal: number;
  contribBy: Record<string, number>;
  totalPortfolio: number;
  assetTotal: number;
  liabTotal: number;
  netWorth: number;
  liabPay: number;
  cpp: number;
  oas: number;
  pen: number;
  employ: number;
  other: number;
  regWithdraw: number;
  tfsaWithdraw: number;
  nonregWithdraw: number;
  taxable: number;
  tax: number;
  oasClaw: number;
  splitAmt: number;
  anyDeceased: boolean;
  perPerson: PerPersonRow[];
  avgRate: number;
  margRate: number;
  afterTax: number;
  spendTarget: number;
  shortfall: number;
  /**
   * Plan-status flags. These are deliberately separate concepts:
   *
   * - `fundingShortfall` — after-tax resources could not fund the year's
   *   spending need. This is the plan-failure signal.
   * - `portfolioEmpty` — the investable portfolio is ~zero. A balance-sheet
   *   state, not by itself a failure.
   * - `portfolioExhausted` — investable assets existed earlier and have now
   *   been drawn to ~zero.
   */
  fundingShortfall: boolean;
  portfolioEmpty: boolean;
  portfolioExhausted: boolean;
  /** Total remaining in LIF accounts. */
  lifRemaining: number;
  /** True when a shortfall is driven by LIF maximum-withdrawal limits. */
  lifBound: boolean;
  /** Per-person TFSA/RRSP room ledger for this year (Batch 0B). */
  roomLedger: PersonRoomYear[];
  /** Total RRSP deduction claimed by the household this year. */
  rrspDeduction: number;
  /**
   * Batch 0D. After-tax cash above the spending target that was contributed
   * back to the portfolio (TFSA to room, then non-registered) instead of
   * disappearing. Typically a forced RRIF-minimum year.
   */
  surplusSwept: number;
  /**
   * Batch 0D. Taxable non-registered distributions accrued this year:
   * interest + eligible dividends + the taxable half of capital-gains
   * distributions and of any gain realized by return of capital. These accrue
   * in loss years too (§6.1).
   */
  distributionsTaxable: number;
  /** True when this year's tax table was derived by indexation, not published. */
  taxYearDerived: boolean;
  /** VALID-1: this row's validity, after forward propagation. */
  validity: ResultValidity;
  /** VALID-1: accumulated reasons, deduplicated by code. */
  validityReasons: ValidityReason[];
}

export interface AccountMeta {
  id: string;
  name: string;
  type: AccountType;
}

export interface ProjectionResult {
  rows: ProjectionRow[];
  acctMeta: AccountMeta[];
  opts: TaxSettings;
  taxYear: number;
  curAge: number;
  endAge: number;
  couple: boolean;
  people: PersonInput[];
  /**
   * False when the household holds no investable assets at any point in the
   * projection. An intake/information state, never a plan failure.
   */
  hadInvestableAssets: boolean;
  /** Distinct room/contribution disclosures raised anywhere in the run. */
  roomDisclosures: string[];
  /**
   * Locked-in (Batch 0C) disclosures: withheld calculations for UNSUPPORTED
   * jurisdictions and flagged APPROXIMATE numbers, gated at the point of use.
   */
  lockedInDisclosures: string[];
  /** Input-contract problems (e.g. the RRSP CRA identity failing). */
  roomValidationErrors: string[];
  /**
   * Batch 0D. Raised once when any projected year uses a tax table derived by
   * indexation rather than a published one — an APPROXIMATE input that must be
   * disclosed wherever those years' numbers are shown (§13).
   */
  taxYearDisclosures: string[];
  /** Batch 0D. Non-registered distribution/ACB notices (e.g. ROC through zero). */
  nonregDisclosures: string[];
  /**
   * Registry-backed rule components. VALID-2 includes the pre-existing VALID-1
   * components plus locked-in, derived-tax-year, estate, age-basis and payroll
   * coverage used by the advice gates.
   */
  componentStatuses: ComponentStatusEntry[];
  /**
   * Aggregation of row validity, for display only. Worst row, reasons
   * deduplicated by code. MUST NOT appear in any conditional anywhere in the
   * engine. Gating is always per component at the point of use.
   */
  validity: ResultValidity;
  validityReasons: ValidityReason[];
}


/** A projection plus the withdrawal strategy that produced it. */
export interface PlanResult extends ProjectionResult {
  /** The ordering actually used. */
  chosenStrategy: WithdrawalStrategy;
  /** True when "auto" picked the ordering rather than the user. */
  autoSelected: boolean;
  /**
   * Batch 0D (§7.8). The auto tie-break ranks orderings on an APPROXIMATE
   * after-tax estate (flat 38% / 8% haircuts), not a terminal-year return.
   * `"APPROXIMATE"` is present on an auto-selected result whose tie-break rests
   * on that approximation. `"WITHHELD"` is present when automatic selection was
   * suppressed — `autoSelected` is then false and `autoSelectionBlockers` names
   * the components responsible. Surfaced wherever the chosen strategy is shown.
   */
  autoSelectionStatus?: "APPROXIMATE" | "WITHHELD";
  autoSelectionNote?: string;
  /** Component identifiers that suppressed automatic selection. */
  autoSelectionBlockers?: string[];
}

/**
 * Scenario hooks. The original tool used these to run what-if variants
 * (fee drag, market shocks, delayed CPP, downsizing) without duplicating
 * the engine.
 */
export interface MarketShock {
  /** Person A's age when the shock begins. */
  age: number;
  /** Equity return during the shock, in percent. */
  pct: number;
  /** How many years it lasts. */
  years: number;
}

export interface GoalSave {
  amt: number;
  type: AccountType;
  /**
   * Required for engine-generated saving: room is per person, so an
   * engine-generated contribution must name whose ledger it uses. The engine
   * never manufactures an owner.
   */
  owner: PersonKey;
}


export interface ProjectionOverride {
  strategy?: WithdrawalStrategy;
  /**
   * Explicit projection start year. Optional. When omitted the projection uses
   * the current calendar year, exactly as before. Runtime-only: this is not
   * persisted with a plan, and saved plans require no migration.
   */
  startYear?: number;
  /** Replace the spending target outright. */
  spendSet?: number;
  /** Add to the spending target. */
  spendAdj?: number;
  /** Add to the pre-retirement (current) spending target. */
  currentSpendAdj?: number;
  /** Shift every retirement age by this many years. */
  retAdj?: number;
  /** Add to every account's return (e.g. -0.012 for fee drag). */
  retDelta?: number;
  /** Force this unlock percentage on all locked-in accounts. */
  unlockAll?: number;
  shocks?: MarketShock[];
  goalSave?: GoalSave;
  goalSaves?: GoalSave[];
  /** Mutate people before the run (e.g. change a CPP start age). */
  mods?: (people: PersonInput[]) => void;
  /** Mutate accounts before the run (e.g. change a conversion age). */
  acctMod?: (accounts: WorkingAccount[]) => void;
  /** Mutate hard assets before the run (e.g. add a downsize). */
  assetMod?: (assets: WorkingAsset[]) => void;
}

/** An account as mutated during a projection run. */
export interface WorkingAccount extends AccountInput {
  /** Blended expected return, derived from the equity allocation. */
  ret: number;
  /**
   * Cumulative fraction (0–1) of this locked-in account already unlocked.
   * Batch 0C: replaces the one-shot `_split` boolean so a partial unlock at 55
   * and a later full unlock at 65 are both representable. `_split` is still
   * read at load time for saved-plan compatibility.
   */
  unlockedFraction?: number;
  /** @deprecated Batch 0C legacy flag, migrated to `unlockedFraction` on load. */
  _split?: boolean;
  /** Id of the destination account created by an unlock from this account. */
  _unlockDestId?: string;
}

/** A hard asset as mutated during a projection run. */
export interface WorkingAsset extends HardAssetInput {
  sold: boolean;
  dsDone?: boolean;
}
