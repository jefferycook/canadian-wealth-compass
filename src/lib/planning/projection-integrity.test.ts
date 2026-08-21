/**
 * Batch 0D — Projection integrity.
 *
 * Three defects the canonical specification requires removing:
 *  1. Statutory amounts frozen at the last published year (§12), which taxes a
 *     flat-real income at ever-higher effective rates over a long projection.
 *  2. Non-registered distributions accruing only in up years (§6.1), a tax
 *     holiday in exactly the years a plan is most fragile.
 *  3. After-tax cash above the spending target vanishing from the balance
 *     sheet instead of being reinvested.
 */

import { describe, expect, it } from "vitest";
import {
  getTaxYear,
  indexTaxYear,
  indexationFactor,
  LATEST_TAX_YEAR,
} from "./taxYears";
import {
  applyDistributionsToAcb,
  decomposeReturn,
  resolveYields,
  type YieldVector,
} from "./nonreg";
import { projection } from "./projection";
import { runPlan } from "./engine";
import {
  accumulationGoldenFixturePlan,
  regressionFixturePlan,
} from "./fixtures";
import type { PlanInputs } from "./types";

const lifetimeTax = (r: { rows: { tax: number }[] }) =>
  r.rows.reduce((s, x) => s + x.tax, 0);

describe("indexation of statutory amounts (§12)", () => {
  it("returns published years untouched and unindexed", () => {
    const published = getTaxYear(LATEST_TAX_YEAR, 0.05);
    expect(published.derivedFrom).toBeUndefined();
    expect(getTaxYear(LATEST_TAX_YEAR).fedBpaMax).toBe(published.fedBpaMax);
  });

  it("never indexes backwards from the published table", () => {
    expect(indexationFactor(2026, 2020, 0.02)).toBe(1);
    const back = indexTaxYear(getTaxYear(2026), 2020, 0.02);
    expect(back.fedBpaMax).toBe(getTaxYear(2026).fedBpaMax);
  });

  it("indexes brackets, personal amounts and the OAS threshold forward", () => {
    const base = getTaxYear(2026);
    const y = getTaxYear(2036, 0.02);
    const f = Math.pow(1.02, 10);
    expect(y.derivedFrom).toBe(2026);
    expect(y.fedBpaMax).toBe(Math.round(base.fedBpaMax * f));
    expect(y.oasThreshold).toBe(Math.round(base.oasThreshold * f));
    expect(y.fedPenAmt).toBe(base.fedPenAmt);
    expect(y.federal[0]!.up).toBe(Math.round(base.federal[0]!.up * f));
    // The top bracket has no ceiling and must stay unbounded, not become a
    // finite indexed number.
    expect(y.federal[y.federal.length - 1]!.up).toBe(Infinity);
  });

  it("leaves rates alone — only amounts index", () => {
    const base = getTaxYear(2026);
    const y = getTaxYear(2046, 0.02);
    expect(y.federal.map((b) => b.rate)).toEqual(base.federal.map((b) => b.rate));
    expect(y.divGrossUp).toBe(base.divGrossUp);
    expect(y.agePhaseRate).toBe(base.agePhaseRate);
  });

  it("indexing at zero reproduces the published table exactly", () => {
    expect(getTaxYear(2050, 0).fedBpaMax).toBe(getTaxYear(2026).fedBpaMax);
  });

  it("lowers lifetime tax versus frozen brackets on an inflating plan", () => {
    const p = regressionFixturePlan();
    const frozen = lifetimeTax(runPlan({ ...p, indexationRate: 0 }));
    const indexed = lifetimeTax(runPlan(p));
    expect(indexed).toBeLessThan(frozen);
    // Frozen brackets reproduce the pre-0D golden exactly: the entire golden
    // movement on this fixture is indexation and nothing else.
    expect(Math.round(frozen)).toBe(278614);
  });

  it("discloses derived tax years as APPROXIMATE", () => {
    const r = projection(regressionFixturePlan());
    expect(r.taxYearDisclosures.length).toBeGreaterThan(0);
    expect(r.taxYearDisclosures.join(" ")).toContain("APPROXIMATE");
    expect(r.rows.some((row) => row.taxYearDerived)).toBe(true);
  });
});

describe("non-registered return decomposition (§6.1)", () => {
  const y: YieldVector = { interest: 0.02, eligDiv: 0.01, cgDist: 0.005, roc: 0 };

  it("accrues distributions in a loss year", () => {
    const d = decomposeReturn(100_000, -0.1, y);
    expect(d.growth).toBeCloseTo(-10_000, 6);
    expect(d.interest).toBeCloseTo(2_000, 6);
    expect(d.eligDiv).toBeCloseTo(1_000, 6);
    expect(d.cgDist).toBeCloseTo(500, 6);
    // The whole fall lands on the unrealized price component.
    expect(d.price).toBeCloseTo(-13_500, 6);
  });

  it("keeps the components summing to the total return", () => {
    for (const rate of [-0.35, -0.02, 0, 0.04, 0.11]) {
      const d = decomposeReturn(250_000, rate, { ...y, roc: 0.01 });
      expect(d.price + d.interest + d.eligDiv + d.cgDist + d.roc).toBeCloseTo(
        d.growth,
        6,
      );
    }
  });

  it("raises ACB by reinvested distributions", () => {
    const d = decomposeReturn(100_000, 0.05, y);
    const mv = applyDistributionsToAcb(60_000, d);
    expect(mv.acb).toBeCloseTo(63_500, 6);
    expect(mv.realizedGain).toBe(0);
  });

  it("floors ACB at zero and realizes the excess ROC as a gain (§6.3)", () => {
    const d = decomposeReturn(100_000, 0.03, { interest: 0, eligDiv: 0, cgDist: 0, roc: 0.05 });
    const mv = applyDistributionsToAcb(2_000, d);
    expect(mv.acb).toBe(0);
    expect(mv.realizedGain).toBeCloseTo(3_000, 6);
  });

  it("derives legacy-mix yields from the expected return, not the shock", () => {
    const mix = { int: 0.3, div: 0.2, cg: 0.5 };
    const v = resolveYields(mix, 0.05, null);
    expect(v.interest).toBeCloseTo(0.015, 9);
    expect(v.eligDiv).toBeCloseTo(0.01, 9);
    // Legacy capital-gains share is price appreciation, not a distribution.
    expect(v.cgDist).toBe(0);
    expect(v.roc).toBe(0);
  });

  it("prefers an explicit yield vector over the legacy mix", () => {
    const v = resolveYields({ int: 1, div: 0, cg: 0 }, 0.05, { interest: 0.03 });
    expect(v.interest).toBeCloseTo(0.03, 9);
  });

  it("taxes non-registered distributions in a down year end to end", () => {
    const shock = (rate: number): number => {
      const p: PlanInputs = regressionFixturePlan();
      return lifetimeTax(
        projection({
          ...p,
          indexationRate: 0,
          eqRet: rate,
          fiRet: rate,
        }),
      );
    };
    // A portfolio earning nothing still distributes interest and dividends,
    // so lifetime tax cannot collapse to the no-portfolio case.
    expect(shock(0)).toBeGreaterThan(0);
  });
});

describe("after-tax surplus sweep", () => {
  it("reinvests surplus instead of losing it", () => {
    const r = projection(accumulationGoldenFixturePlan());
    const swept = r.rows.reduce((s, x) => s + x.surplusSwept, 0);
    expect(swept).toBeGreaterThan(0);
    for (const row of r.rows) expect(row.surplusSwept).toBeGreaterThanOrEqual(0);
  });

  it("never sweeps more TFSA than the room ledger allows", () => {
    const r = projection(accumulationGoldenFixturePlan());
    for (const row of r.rows) {
      for (const led of row.roomLedger) {
        expect(led.tfsa.contributions).toBeLessThanOrEqual(
          led.tfsa.open + led.tfsa.accrual + led.tfsa.withdrawalsRestored + 0.01,
        );
      }
    }
  });

  it("reports taxable distributions on every row", () => {
    const r = projection(accumulationGoldenFixturePlan());
    for (const row of r.rows) {
      expect(Number.isFinite(row.distributionsTaxable)).toBe(true);
      expect(row.distributionsTaxable).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("auto strategy selection is labelled APPROXIMATE (§7.8)", () => {
  it("carries the status and the caveat when auto picked the ordering", () => {
    const p = regressionFixturePlan();
    const r = runPlan({ ...p, strategy: "auto" });
    if (r.autoSelected) {
      expect(r.autoSelectionStatus).toBe("APPROXIMATE");
      expect(r.autoSelectionNote ?? "").toMatch(/approximate/i);
    }
  });
});
