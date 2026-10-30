/**
 * CPP-5 experimental prototype tests.
 *
 * Every number here is ILLUSTRATIVE (ledger L24): invented round inputs whose
 * expected values were worked by hand from the statute text, not produced by the
 * module. They check algebra, units and branch gates. None is a Service Canada
 * figure, and passing them does not prove the statutory reading.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CPP5_LEDGER,
  calculateCpp5SurvivorPension,
  type Cpp5Computed,
  type Cpp5Input,
  type Cpp5Result,
  type IndexingMode,
  type MonthlyPensionableEarnings,
  type YearMonth,
} from "./cpp5-experimental";

const DIGITS = 9;

function table(from: number, to: number, value: (y: number) => number): Record<number, number> {
  const t: Record<number, number> = {};
  for (let y = from; y <= to; y++) t[y] = value(y);
  return t;
}

const FLAT_PI = table(1990, 2032, () => 100);
const FLAT_YMPE = table(1990, 2032, () => 72000); // MPEA 72,000 -> 25% x 1/12 = 1,500

/** Survivor born 1960-06 (reaches 65 in 2025-06); deceased died 2024-03. */
function input(over: {
  calc?: YearMonth;
  commencement?: YearMonth | null;
  own?: Partial<MonthlyPensionableEarnings>;
  deceased?: Partial<Cpp5Input["deceased"]>;
  survivor?: Partial<Cpp5Input["survivor"]>;
  pensionIndex?: Record<number, number>;
  ympe?: Record<number, number>;
  reductionYear?: number;
  indexing?: IndexingMode;
}): Cpp5Input {
  const commencement =
    over.commencement === undefined ? { year: 2020, month: 6 } : over.commencement;
  return {
    calculationMonth: over.calc ?? { year: 2026, month: 1 },
    deceased: {
      death: { year: 2024, month: 3 },
      earnings: { average: 4000, firstAdditional: 600, secondAdditional: 300 },
      retirementPensionPayableInDeathMonth: false,
      ...over.deceased,
    },
    survivor: {
      birth: { year: 1960, month: 6 },
      survivorPensionQualification: { year: 2024, month: 4 },
      disabilityPensionPayable: false,
      ownRetirementPension:
        commencement === null
          ? null
          : {
              plan: "CPP",
              commencement,
              earnings: { average: 2000, firstAdditional: 300, secondAdditional: 0, ...over.own },
            },
      ...over.survivor,
    },
    pensionIndex: over.pensionIndex ?? FLAT_PI,
    ympe: over.ympe ?? FLAT_YMPE,
    // Algebra tests opt in to the non-statutory telescoped mode; statutory mode is tested below.
    indexing: over.indexing ?? "HYPOTHETICAL_UNROUNDED",
    ...(over.reductionYear === undefined
      ? {}
      : { survivorPensionReductionYear: over.reductionYear }),
  };
}

function computed(r: Cpp5Result): Cpp5Computed {
  expect(r.kind, JSON.stringify(r)).toBe("COMPUTED");
  return r as Cpp5Computed;
}

function missingOf(r: Cpp5Result): readonly string[] | undefined {
  return "missing" in r ? r.missing : undefined;
}

function failed(r: Cpp5Result, kind: string, code?: string) {
  expect(r.kind, JSON.stringify(r)).toBe(kind);
  if (code !== undefined) expect((r as { code: string }).code).toBe(code);
}

describe("CPP-5 experimental: s.58(2)(c) algebra (ILLUSTRATIVE, flat PI)", () => {
  // Hand worksheet, PI flat, MPEA 72,000:
  // D = 25% 4000, 8.33% 600, 33.33% 300 = 1000, 49.98, 99.99
  // A = 60% D = 600, 29.988, 59.994 ; full = 689.982
  // R = 25% 2000, 8.33% 300, 33.33% 0 = 500, 24.99, 0
  // B = min(40% A, 40% R) = min(240,200)=200, min(11.9952,9.996)=9.996, min(23.9976,0)=0
  // A-B = 400, 19.992, 59.994 ; capRoom = 1500 - 500 = 1000 (not binding)
  // survivor = 479.986 ; reduction from full = 209.996 = sum B
  const r = computed(calculateCpp5SurvivorPension(input({})));

  it("computes each component separately with literal 8.33% / 33.33%", () => {
    expect(r.branch).toBe("S58_2_C");
    expect(r.deceasedPortions.base).toBeCloseTo(1000, DIGITS);
    expect(r.deceasedPortions.firstAdditional).toBeCloseTo(49.98, DIGITS);
    expect(r.deceasedPortions.secondAdditional).toBeCloseTo(99.99, DIGITS);
    expect(r.ownUnadjustedPortions!.firstAdditional).toBeCloseTo(24.99, DIGITS);
  });

  it("applies 40%-of-the-lesser per component", () => {
    expect(r.terms!.base.B).toBeCloseTo(200, DIGITS);
    expect(r.terms!.firstAdditional.B).toBeCloseTo(9.996, DIGITS);
    expect(r.terms!.secondAdditional.B).toBe(0);
    expect(r.survivorPension).toBeCloseTo(479.986, DIGITS);
    expect(r.fullAmount).toBeCloseTo(689.982, DIGITS);
  });

  it("labels the output unrounded and unconfirmed", () => {
    expect(r.amountBasis).toBe("UNROUNDED_BASIC_MONTHLY_AMOUNT");
    expect(r.officialFixtureStatus).toBe("MISSING_SERVICE_CANADA_CONFIRMATION");
    expect(r.precisionCaveats).toEqual(expect.arrayContaining(["L21", "L22", "L23"]));
  });
});

describe("CPP-5 experimental: s.46(5) trigger without a binding cap", () => {
  it("triggers on the 40% deduction alone (own pension at 60)", () => {
    const r = computed(calculateCpp5SurvivorPension(input({ reductionYear: 2026 })));
    expect(r.cap!.binding).toBe(false);
    expect(r.cap!.trim).toBe(0);
    expect(r.reductionFromFull).toBeCloseTo(209.996, DIGITS);
    // The PR #52 formula sum(A-B) - survivor gives 0 here; that is the wrong trigger.
    const sumAminusB =
      r.terms!.base.AminusB + r.terms!.firstAdditional.AminusB + r.terms!.secondAdditional.AminusB;
    expect(sumAminusB - r.survivorPension).toBeCloseTo(0, DIGITS);
    expect(r.s46_5.status).toBe("UNVERIFIED_RULE");
    if (r.s46_5.status !== "UNVERIFIED_RULE") return;
    expect(r.s46_5.triggered).toBe(true);
    expect(r.s46_5.factorDirection).toBe("DOWNWARD");
    expect(r.s46_5.candidateReduction).toBeCloseTo(209.996, DIGITS);
    expect(r.s46_5.blockers).toEqual(["L17", "L18", "L19"]);
  });

  it("does not fold the early-retirement factor into the survivor pension", () => {
    const at60 = computed(calculateCpp5SurvivorPension(input({})));
    const at65 = computed(
      calculateCpp5SurvivorPension(input({ commencement: { year: 2025, month: 6 } })),
    );
    expect(at60.survivorPension).toBeCloseTo(at65.survivorPension, DIGITS);
  });

  it("is not applicable when the survivor pension is not reduced", () => {
    const r = computed(
      calculateCpp5SurvivorPension(input({ own: { average: 0, firstAdditional: 0 } })),
    );
    expect(r.reductionFromFull).toBeCloseTo(0, DIGITS);
    expect(r.s46_5).toEqual({ status: "NOT_APPLICABLE", reason: "SURVIVOR_PENSION_NOT_REDUCED" });
  });
});

describe("CPP-5 experimental: own pension start 60 / 65 / 70", () => {
  it("start at 65: no adjustment factor, s.46(5) not applicable", () => {
    const r = computed(
      calculateCpp5SurvivorPension(input({ commencement: { year: 2025, month: 6 } })),
    );
    expect(r.s46_5).toEqual({ status: "NOT_APPLICABLE", reason: "COMMENCED_AT_65_NO_FACTOR" });
  });

  it("start at 70: s.58(1)(b) 60% before own pension is payable", () => {
    const r = computed(
      calculateCpp5SurvivorPension(input({ commencement: { year: 2030, month: 6 } })),
    );
    expect(r.branch).toBe("S58_1_B");
    expect(r.survivorPension).toBeCloseTo(689.982, DIGITS);
    expect(r.reductionFromFull).toBe(0);
    expect(r.s46_5).toEqual({ status: "NOT_APPLICABLE", reason: "NO_OWN_RETIREMENT_PENSION" });
  });

  it("start at 70: s.58(2)(c) once payable, upward factor only", () => {
    const r = computed(
      calculateCpp5SurvivorPension(
        input({ commencement: { year: 2030, month: 6 }, calc: { year: 2030, month: 7 } }),
      ),
    );
    expect(r.branch).toBe("S58_2_C");
    expect(r.cap!.capYear).toBe(2030);
    expect(r.survivorPension).toBeCloseTo(479.986, DIGITS);
    expect(r.s46_5).toEqual({ status: "NOT_APPLICABLE", reason: "UPWARD_FACTOR_ONLY" });
  });
});

describe("CPP-5 experimental: base-only cap", () => {
  it("binding: base limited, enhancement terms untouched", () => {
    // R_base = 25% 5600 = 1400; capRoom = 100; A-B base = 600 - min(240, 560) = 360 -> 100
    const r = computed(calculateCpp5SurvivorPension(input({ own: { average: 5600 } })));
    expect(r.cap!.capRoom).toBeCloseTo(100, DIGITS);
    expect(r.cap!.binding).toBe(true);
    expect(r.terms!.base.paid).toBeCloseTo(100, DIGITS);
    expect(r.cap!.trim).toBeCloseTo(260, DIGITS);
    expect(r.terms!.firstAdditional.paid).toBeCloseTo(19.992, DIGITS);
    expect(r.terms!.secondAdditional.paid).toBeCloseTo(59.994, DIGITS);
    expect(r.survivorPension).toBeCloseTo(179.986, DIGITS);
    // reduction = sum B (240 + 9.996 + 0) + trim 260
    expect(r.reductionFromFull).toBeCloseTo(509.996, DIGITS);
  });

  it("zero cap room boundary pays base 0 without any floor", () => {
    const r = computed(calculateCpp5SurvivorPension(input({ own: { average: 6000 } })));
    expect(r.cap!.capRoom).toBeCloseTo(0, DIGITS);
    expect(r.terms!.base.paid).toBeCloseTo(0, DIGITS);
    expect(r.survivorPension).toBeCloseTo(79.986, DIGITS);
  });

  it("negative cap room fails closed instead of max(0, cap - R)", () => {
    failed(
      calculateCpp5SurvivorPension(input({ own: { average: 6400 } })),
      "UNVERIFIED_RULE",
      "NEGATIVE_CAP_ROOM",
    );
  });

  it("MPEA averages the cap year and four previous YMPE values", () => {
    const ympe = {
      ...FLAT_YMPE,
      2019: 1_000_000, // outside the window, must be ignored
      2020: 60000,
      2021: 61200,
      2022: 62400,
      2023: 63600,
      2024: 64800,
    };
    // MPEA 62,400 -> cap 1,300; R_base = 25% 5000 = 1250; capRoom 50
    const r = computed(calculateCpp5SurvivorPension(input({ own: { average: 5000 }, ympe })));
    expect(r.cap!.capYear).toBe(2024);
    expect(r.cap!.mpea).toBeCloseTo(62400, DIGITS);
    expect(r.cap!.capAmount).toBeCloseTo(1300, DIGITS);
    expect(r.terms!.base.paid).toBeCloseTo(50, DIGITS);
  });

  it("MPEA uses three previous years when the cap year is 1998", () => {
    const ympe = {
      ...FLAT_YMPE,
      1994: 1_000_000,
      1995: 40000,
      1996: 44000,
      1997: 48000,
      1998: 52000,
    };
    const r = computed(
      calculateCpp5SurvivorPension(
        input({
          calc: { year: 2019, month: 2 },
          commencement: { year: 1998, month: 6 },
          own: { firstAdditional: 0 },
          deceased: {
            death: { year: 1998, month: 1 },
            earnings: { average: 4000, firstAdditional: 0, secondAdditional: 0 },
          },
          survivor: {
            birth: { year: 1933, month: 1 },
            survivorPensionQualification: { year: 1998, month: 2 },
          },
          ympe,
        }),
      ),
    );
    expect(r.cap!.capYear).toBe(1998);
    expect(r.cap!.mpea).toBeCloseTo(46000, DIGITS);
  });
});

describe("CPP-5 experimental: Pension Index units and direction", () => {
  const PI = {
    ...table(1990, 2019, () => 70),
    2020: 80,
    2021: 85,
    2022: 90,
    2023: 95,
    2024: 100,
    2025: 110,
    ...table(2026, 2032, () => 125),
  };

  it("indexes deceased, own and cap amounts to the calculation year", () => {
    // D x 125/100; R x 125/80; cap 1500 x 125/100 = 1875
    // A = 750, 37.485, 74.9925 ; R = 781.25, 39.046875, 0
    // B = 300, 14.994, 0 ; capRoom = 1093.75 ; total = 450 + 22.491 + 74.9925 = 547.4835
    const r = computed(calculateCpp5SurvivorPension(input({ pensionIndex: PI })));
    expect(r.deceasedPortions.base).toBeCloseTo(1250, DIGITS);
    expect(r.ownUnadjustedPortions!.base).toBeCloseTo(781.25, DIGITS);
    expect(r.cap!.capAmount).toBeCloseTo(1875, DIGITS);
    expect(r.survivorPension).toBeCloseTo(547.4835, DIGITS);
  });

  it("s.46(5)(b) ratio is PI(own commencement) / PI(reduction year), not its inverse", () => {
    const r = computed(
      calculateCpp5SurvivorPension(input({ pensionIndex: PI, reductionYear: 2026 })),
    );
    if (r.s46_5.status !== "UNVERIFIED_RULE") throw new Error("expected s.46(5) trigger");
    expect(r.s46_5.pensionIndexRatio).toBeCloseTo(0.64, DIGITS);
    const r2 = computed(
      calculateCpp5SurvivorPension(input({ pensionIndex: PI, reductionYear: 2024 })),
    );
    if (r2.s46_5.status !== "UNVERIFIED_RULE") throw new Error("expected s.46(5) trigger");
    expect(r2.s46_5.pensionIndexRatio).toBeCloseTo(0.8, DIGITS);
  });

  it("leaves the s.46(5)(b) ratio null without a reduction year", () => {
    const r = computed(calculateCpp5SurvivorPension(input({ pensionIndex: PI })));
    if (r.s46_5.status !== "UNVERIFIED_RULE") throw new Error("expected s.46(5) trigger");
    expect(r.s46_5.pensionIndexRatio).toBeNull();
  });

  it("applies the s.57(2)(c)(ii) / s.58(3.2)(b) ratio when a pension was payable at death", () => {
    // payable ratio PI(2024)/PI(2020) = 1.25, then x PI(2026)/PI(2024) = 1.25 -> 1000 x 1.5625
    const r = computed(
      calculateCpp5SurvivorPension(
        input({
          pensionIndex: PI,
          deceased: {
            retirementPensionPayableInDeathMonth: true,
            retirementPensionFirstPayableYear: 2020,
          },
        }),
      ),
    );
    expect(r.deceasedPortions.base).toBeCloseTo(1562.5, DIGITS);
    expect(r.deceasedPortions.secondAdditional).toBeCloseTo(99.99 * 1.5625, DIGITS);
  });

  it("DERIVED_MATH L05: unrounded roll-forward scales the whole pension by the PI ratio", () => {
    const base = {
      pensionIndex: PI,
      commencement: { year: 2023, month: 6 },
      survivor: { birth: { year: 1958, month: 6 } },
    };
    const y25 = computed(
      calculateCpp5SurvivorPension(input({ ...base, calc: { year: 2025, month: 1 } })),
    );
    const y26 = computed(
      calculateCpp5SurvivorPension(input({ ...base, calc: { year: 2026, month: 1 } })),
    );
    expect(y26.survivorPension / y25.survivorPension).toBeCloseTo(125 / 110, 12);
  });

  it("rejects a decreasing Pension Index (s.43(2))", () => {
    failed(
      calculateCpp5SurvivorPension(input({ pensionIndex: { ...PI, 2025: 99 } })),
      "INVALID_INPUT",
      "PENSION_INDEX_DECREASES",
    );
  });
});

describe("CPP-5 experimental: statutory indexing fails closed (Codex finding 1)", () => {
  // Independently worked from Reg. 62(2)-(3) text, not from the module:
  // PI death 100 -> event 110 -> calc 125 with a $1,000 portion.
  //   direct endpoint:  1000 x 125/100                      = 1250.00
  //   yearly sequence:  1000 x 1.100 = 1100.00; 125/110 = 1.13636... -> 1.136
  //                     1100 x 1.136 = 1249.60
  // The two differ by 0.40, so the endpoint form is not the statutory amount.
  const SEQUENCE_DIFFERS = 1000 * 1.1 * 1.136;
  it("documents why the telescoped endpoint is not the statutory dollar amount", () => {
    expect(SEQUENCE_DIFFERS).toBeCloseTo(1249.6, 9);
    expect(1000 * (125 / 100)).toBeCloseTo(1250, 9);
  });

  const STEP_PI = { ...table(1990, 2024, () => 100), 2025: 110, 2026: 125 };

  it("returns UNVERIFIED_RULE by default when any annual PI ratio is not 1", () => {
    const r = calculateCpp5SurvivorPension(input({ pensionIndex: STEP_PI, indexing: "STATUTORY" }));
    failed(r, "UNVERIFIED_RULE", "ANNUAL_INDEX_ROUNDING_UNRESOLVED");
  });

  it("defaults to the statutory mode when `indexing` is omitted", () => {
    const base = input({ pensionIndex: STEP_PI });
    const { indexing: _omit, ...rest } = base;
    failed(
      calculateCpp5SurvivorPension(rest),
      "UNVERIFIED_RULE",
      "ANNUAL_INDEX_ROUNDING_UNRESOLVED",
    );
  });

  it("still computes in statutory mode when the full annual series is flat", () => {
    const r = computed(calculateCpp5SurvivorPension(input({ indexing: "STATUTORY" })));
    expect(r.indexingBasis).toBe("UNITY_INDEX_SERIES");
    expect(r.survivorPension).toBeCloseTo(479.986, DIGITS);
  });

  it("flags a change in any intermediate year, including the cap and own-start intervals", () => {
    // Only the deceased interval is flat after 2024; the change is in 2021 (own start 2020-06).
    const pi = { ...table(1990, 2020, () => 100), ...table(2021, 2032, () => 101) };
    failed(
      calculateCpp5SurvivorPension(input({ pensionIndex: pi, indexing: "STATUTORY" })),
      "UNVERIFIED_RULE",
      "ANNUAL_INDEX_ROUNDING_UNRESOLVED",
    );
  });

  it("requires a complete year-by-year series; endpoints alone are insufficient", () => {
    const sparse = { 1998: 100, 2020: 100, 2024: 100, 2026: 100 };
    const r = calculateCpp5SurvivorPension(input({ pensionIndex: sparse, indexing: "STATUTORY" }));
    failed(r, "INSUFFICIENT_DATA");
    expect(missingOf(r)).toEqual(
      expect.arrayContaining(["pensionIndex[2025]", "pensionIndex[2021]"]),
    );
  });

  it("tags the opt-in telescoped mode as non-statutory", () => {
    const r = computed(calculateCpp5SurvivorPension(input({ pensionIndex: STEP_PI })));
    expect(r.indexingBasis).toBe("HYPOTHETICAL_UNROUNDED_NOT_STATUTORY");
    expect(r.deceasedPortions.base).toBeCloseTo(1250, DIGITS);
  });

  it("applies to the no-own-pension branch too", () => {
    failed(
      calculateCpp5SurvivorPension(
        input({
          commencement: null,
          survivor: { birth: { year: 1955, month: 6 } },
          pensionIndex: STEP_PI,
          indexing: "STATUTORY",
        }),
      ),
      "UNVERIFIED_RULE",
      "ANNUAL_INDEX_ROUNDING_UNRESOLVED",
    );
  });
});

describe("CPP-5 experimental: Pension Index never falls across gaps (Codex finding 2)", () => {
  const sparseDecrease = { 2020: 100, 2024: 100, 2026: 90 };
  it("rejects a decrease across a gap in a sparse table (both indexing modes)", () => {
    for (const indexing of ["STATUTORY", "HYPOTHETICAL_UNROUNDED"] as const) {
      const r = calculateCpp5SurvivorPension(
        input({ pensionIndex: { ...sparseDecrease, 1998: 100 }, ympe: FLAT_YMPE, indexing }),
      );
      failed(r, "INVALID_INPUT", "PENSION_INDEX_DECREASES");
    }
  });

  it("rejects the exact reported table", () => {
    failed(
      calculateCpp5SurvivorPension(input({ pensionIndex: sparseDecrease })),
      "INVALID_INPUT",
      "PENSION_INDEX_DECREASES",
    );
  });

  it("rejects a decrease regardless of object key insertion order", () => {
    const reversed: Record<number, number> = {};
    reversed[2026] = 90;
    reversed[2024] = 100;
    reversed[2020] = 100;
    failed(
      calculateCpp5SurvivorPension(input({ pensionIndex: reversed })),
      "INVALID_INPUT",
      "PENSION_INDEX_DECREASES",
    );
  });

  it("accepts a complete non-decreasing table and a sparse non-decreasing one", () => {
    computed(calculateCpp5SurvivorPension(input({ indexing: "STATUTORY" })));
    const sparseOk = { 1998: 90, 2020: 100, 2024: 100, 2026: 100 };
    const r = calculateCpp5SurvivorPension(
      input({ pensionIndex: sparseOk, indexing: "HYPOTHETICAL_UNROUNDED" }),
    );
    expect(r.kind).toBe("COMPUTED");
  });
});

describe("CPP-5 experimental: age 64 -> 65 transition", () => {
  it("month before 65 with own pension: s.58(2)(a) unsupported", () => {
    failed(
      calculateCpp5SurvivorPension(input({ calc: { year: 2025, month: 5 } })),
      "UNSUPPORTED",
      "S58_2_A_UNDER_65",
    );
  });

  it("month of 65: unverified rule", () => {
    failed(
      calculateCpp5SurvivorPension(input({ calc: { year: 2025, month: 6 } })),
      "UNVERIFIED_RULE",
      "AGE_65_TRANSITION_MONTH",
    );
  });

  it("month after 65: s.58(2)(c) computed", () => {
    const r = computed(calculateCpp5SurvivorPension(input({ calc: { year: 2025, month: 7 } })));
    expect(r.branch).toBe("S58_2_C");
  });

  it("under 65 without own pension: s.58(1)(a.1) unsupported", () => {
    failed(
      calculateCpp5SurvivorPension(input({ calc: { year: 2025, month: 1 }, commencement: null })),
      "UNSUPPORTED",
      "S58_1_A1_UNDER_65",
    );
  });
});

describe("CPP-5 experimental: fail-closed gates", () => {
  it("rejects a total-only pension statement (no inferred components)", () => {
    const i = input({});
    const bad = {
      ...i,
      survivor: {
        ...i.survivor,
        ownRetirementPension: {
          ...i.survivor.ownRetirementPension!,
          earnings: { totalMonthlyPension: 900 } as unknown as MonthlyPensionableEarnings,
        },
      },
    };
    const r = calculateCpp5SurvivorPension(bad);
    failed(r, "INSUFFICIENT_DATA", "MISSING_INPUT");
    expect(missingOf(r)).toEqual([
      "survivor.ownRetirementPension.earnings.average",
      "survivor.ownRetirementPension.earnings.firstAdditional",
      "survivor.ownRetirementPension.earnings.secondAdditional",
    ]);
  });

  it("reports a missing deceased component", () => {
    const i = input({});
    const r = calculateCpp5SurvivorPension({
      ...i,
      deceased: {
        ...i.deceased,
        earnings: { average: 4000, firstAdditional: 600 } as MonthlyPensionableEarnings,
      },
    });
    expect(missingOf(r)).toEqual(["deceased.earnings.secondAdditional"]);
  });

  it("reports missing Pension Index and YMPE years", () => {
    const pi = { ...FLAT_PI };
    delete pi[2026];
    const r = calculateCpp5SurvivorPension(input({ pensionIndex: pi }));
    failed(r, "INSUFFICIENT_DATA", "MISSING_INDEX_DATA");
    expect(missingOf(r)).toEqual(["pensionIndex[2026]"]);

    const ympe = { ...FLAT_YMPE };
    delete ympe[2021];
    const r2 = calculateCpp5SurvivorPension(input({ ympe }));
    expect(missingOf(r2)).toEqual(["ympe[2021]"]);
  });

  it("requires the first payable year when a pension was payable at death", () => {
    const r = calculateCpp5SurvivorPension(
      input({ deceased: { retirementPensionPayableInDeathMonth: true } }),
    );
    expect(missingOf(r)).toEqual(["deceased.retirementPensionFirstPayableYear"]);
  });

  it("excludes pre-2019 months and pre-1987 deaths", () => {
    failed(
      calculateCpp5SurvivorPension(
        input({
          calc: { year: 2018, month: 12 },
          survivor: { birth: { year: 1950, month: 1 } },
        }),
      ),
      "UNSUPPORTED",
      "PRE_2019_MONTH",
    );
    failed(
      calculateCpp5SurvivorPension(input({ deceased: { death: { year: 1986, month: 12 } } })),
      "UNSUPPORTED",
      "DEATH_BEFORE_1987",
    );
  });

  it("routes born-before-1933 or pre-1998 commencement to s.58(2)(d) unsupported", () => {
    failed(
      calculateCpp5SurvivorPension(
        input({
          commencement: { year: 1997, month: 1 },
          survivor: { birth: { year: 1932, month: 1 } },
        }),
      ),
      "UNSUPPORTED",
      "S58_2_D_OTHER",
    );
    failed(
      calculateCpp5SurvivorPension(
        input({
          commencement: { year: 1997, month: 12 },
          survivor: { birth: { year: 1935, month: 1 } },
        }),
      ),
      "UNSUPPORTED",
      "S58_2_D_OTHER",
    );
  });

  it("does not compute provincial, disability or pre-1974 deceased-pension cases", () => {
    const i = input({});
    failed(
      calculateCpp5SurvivorPension({
        ...i,
        survivor: {
          ...i.survivor,
          ownRetirementPension: { ...i.survivor.ownRetirementPension!, plan: "PROVINCIAL" },
        },
      }),
      "UNSUPPORTED",
      "PROVINCIAL_RETIREMENT_PENSION",
    );
    failed(
      calculateCpp5SurvivorPension(input({ survivor: { disabilityPensionPayable: true } })),
      "UNSUPPORTED",
      "DISABILITY_PENSION_PAYABLE",
    );
    failed(
      calculateCpp5SurvivorPension(
        input({
          deceased: {
            retirementPensionPayableInDeathMonth: true,
            retirementPensionFirstPayableYear: 1973,
          },
        }),
      ),
      "UNSUPPORTED",
      "DECEASED_PENSION_BEFORE_1974",
    );
    failed(
      calculateCpp5SurvivorPension(
        input({
          deceased: {
            retirementPensionPayableInDeathMonth: true,
            retirementPensionFirstPayableYear: 2025,
          },
        }),
      ),
      "INVALID_INPUT",
      "DECEASED_PENSION_AFTER_DEATH",
    );
  });

  it("rejects impossible dates and negative amounts", () => {
    failed(
      calculateCpp5SurvivorPension(
        input({ survivor: { survivorPensionQualification: { year: 2024, month: 3 } } }),
      ),
      "INVALID_INPUT",
      "QUALIFICATION_NOT_AFTER_DEATH",
    );
    failed(
      calculateCpp5SurvivorPension(input({ calc: { year: 2024, month: 3 } })),
      "INVALID_INPUT",
      "CALC_NOT_AFTER_DEATH",
    );
    failed(calculateCpp5SurvivorPension(input({ own: { average: -1 } })), "INVALID_INPUT");
    failed(
      calculateCpp5SurvivorPension(input({ calc: { year: 2026, month: 13 } })),
      "INVALID_INPUT",
    );
  });
});

describe("CPP-5 experimental: DERIVED_MATH identities over generated inputs", () => {
  it("A-B >= 60% A, paid <= A-B, reduction = sum B + trim, 0 <= survivor <= full", () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let computedCount = 0;
    let negativeCapCount = 0;
    for (let n = 0; n < 500; n++) {
      const r = calculateCpp5SurvivorPension(
        input({
          deceased: {
            earnings: {
              average: rnd() * 6000,
              firstAdditional: rnd() * 800,
              secondAdditional: rnd() * 400,
            },
          },
          own: {
            average: rnd() * 7000,
            firstAdditional: rnd() * 800,
            secondAdditional: rnd() * 400,
          },
        }),
      );
      if (r.kind !== "COMPUTED") {
        expect(r.kind).toBe("UNVERIFIED_RULE");
        negativeCapCount++;
        continue;
      }
      computedCount++;
      let sumB = 0;
      for (const t of Object.values(r.terms!)) {
        expect(t.AminusB).toBeGreaterThanOrEqual(0.6 * t.A - 1e-9);
        expect(t.paid).toBeLessThanOrEqual(t.AminusB + 1e-9);
        sumB += t.B;
      }
      expect(r.reductionFromFull).toBeCloseTo(sumB + r.cap!.trim, DIGITS);
      expect(r.survivorPension).toBeGreaterThanOrEqual(0);
      expect(r.survivorPension).toBeLessThanOrEqual(r.fullAmount + 1e-9);
    }
    expect(computedCount).toBeGreaterThan(0);
    expect(negativeCapCount).toBeGreaterThan(0);
  });
});

describe("CPP-5 experimental: ledger and isolation", () => {
  const LABELS = [
    "VERIFIED_STATUTE",
    "VERIFIED_REGULATION",
    "DERIVED_MATH",
    "ILLUSTRATIVE",
    "UNRESOLVED",
  ];
  const source = readFileSync(new URL("./cpp5-experimental.ts", import.meta.url), "utf8");

  it("every ledger entry is labelled and cited; every cited id exists", () => {
    const ids = new Set(CPP5_LEDGER.map((e) => e.id));
    expect(ids.size).toBe(CPP5_LEDGER.length);
    for (const e of CPP5_LEDGER) {
      expect(LABELS).toContain(e.label);
      expect(e.citation.length).toBeGreaterThan(0);
    }
    for (const [, id] of source.matchAll(/\[(L\d{2})\]/g)) expect(ids).toContain(id);
  });

  it("keeps the known legal gaps UNRESOLVED", () => {
    const unresolved = CPP5_LEDGER.filter((e) => e.label === "UNRESOLVED").map((e) => e.id);
    expect(unresolved).toEqual(["L14", "L15", "L17", "L19", "L21", "L22", "L23", "L25"]);
  });

  it("is not imported by any other source file", () => {
    const root = join(process.cwd(), "src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/cpp5-experimental\.(test\.)?ts$/.test(name)) {
          if (readFileSync(p, "utf8").includes("cpp5-experimental")) offenders.push(p);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
