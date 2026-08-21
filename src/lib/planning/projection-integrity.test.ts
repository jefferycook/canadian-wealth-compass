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
import { computeTax } from "./tax";
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
import type { AccountInput, PlanInputs, TaxSettings } from "./types";

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

  it("never indexes the federal pension income amount (fixed $2,000 in law)", () => {
    const base = getTaxYear(2026);
    const y = getTaxYear(2060, 0.021);
    expect(getTaxYear(2026).fedPenAmt).toBe(2000);
    expect(y.fedPenAmt).toBe(2000);
    // Two-sided: pinned deliberately, not because indexation is broken.
    expect(y.fedBpaMax).toBeGreaterThan(base.fedBpaMax);
    expect(y.fedAgeAmt).toBeGreaterThan(base.fedAgeAmt);
    expect(y.oasThreshold).toBeGreaterThan(base.oasThreshold);
    expect(y.federal[0]!.up).toBeGreaterThan(base.federal[0]!.up);
  });

  it("keeps indexing provincial pension amounts", () => {
    expect(getTaxYear(2060, 0.021).provinces['ON']!.penAmt).toBeGreaterThan(1796);
  });

  it("indexing at zero reproduces the published table exactly", () => {
    expect(getTaxYear(2050, 0).fedBpaMax).toBe(getTaxYear(2026).fedBpaMax);
  });

  /**
   * The canonical Batch 0D contract states the invariant directly: a FLAT-REAL
   * income over 30 years must produce a FLAT-REAL tax. The neighbouring
   * "indexed < frozen" test only shows the direction of travel; it would pass
   * on an indexation rate that was half right. This one pins the invariant.
   *
   * Controlled fixture, so nothing else can move the number: one 45-year-old
   * (below the age amount, so the credit set does not change with age), a
   * single ordinary-income stream, and Alberta (a flat provincial rate with no
   * surtax and no health premium). Nominal income and every statutory amount
   * rise at exactly the same rate, which is the definition of flat-real.
   *
   * The statutory overrides are indexed by the same `indexationFactor` the
   * projection applies to them each year (projection.ts, `optsY`), so this
   * tests the same code path the engine uses rather than an idealised one.
   */
  it("holds real tax flat over 30 years when income and the tables rise together", () => {
    const g = 0.02;
    const baseIncome = 80_000;
    const published = getTaxYear(LATEST_TAX_YEAR);
    const opts0: TaxSettings = {
      provinceKey: "AB",
      fedBPA: published.fedBpaMax,
      provBPA: published.provinces['AB']!.bpa,
      oasThresh: published.oasThreshold,
      lifRate: 6,
    };

    const realTax = (n: number, indexed: boolean): number => {
      const f = Math.pow(1 + g, n);
      const yr = LATEST_TAX_YEAR + n;
      const k = indexed ? indexationFactor(LATEST_TAX_YEAR, yr, g) : 1;
      const opts: TaxSettings = {
        ...opts0,
        fedBPA: opts0.fedBPA * k,
        provBPA: opts0.provBPA * k,
        oasThresh: opts0.oasThresh * k,
      };
      const ty = indexed ? getTaxYear(yr, g) : published;
      const inc = {
        ordinary: baseIncome * f,
        eligDiv: 0,
        capGainsTaxable: 0,
        oasReceived: 0,
        age: 45,
      };
      // Deflate back to year-0 dollars.
      return computeTax(inc, opts, ty).tax / f;
    };

    const indexed: number[] = [];
    const frozen: number[] = [];
    for (let n = 0; n <= 30; n++) {
      indexed.push(realTax(n, true));
      frozen.push(realTax(n, false));
    }

    // Indexed: flat in real terms. The residual is integer rounding of the
    // indexed thresholds, so the tolerance is tight on purpose — 0.1% would
    // not catch a half-rate indexation bug, and this does.
    const drift = Math.max(...indexed) / Math.min(...indexed) - 1;
    expect(drift).toBeLessThan(0.0005);
    expect(indexed[30]!).toBeCloseTo(indexed[0]!, 0);

    // The test is not vacuous: the SAME fixture against frozen tables drifts
    // badly upward, which is exactly the defect Batch 0D removed. Real tax
    // rises by roughly a third over the 30 years.
    expect(frozen[0]!).toBeCloseTo(indexed[0]!, 6);
    expect(frozen[30]! / frozen[0]!).toBeGreaterThan(1.25);
    // Monotone bracket creep, not noise.
    for (let n = 1; n <= 30; n++) expect(frozen[n]!).toBeGreaterThan(frozen[n - 1]!);
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

  /**
   * The 0D contract is about a NEGATIVE year, not a flat one: the old engine
   * gated distributions behind `growth > 0`, so a market shock produced a tax
   * holiday. A zero-return plan does not exercise that gate, and a unit test of
   * `decomposeReturn()` does not prove the projection wires it up. This builds
   * a controlled plan and reads the projection's own row.
   */
  const downYearPlan = (totalReturn: number): PlanInputs => {
    const base = regressionFixturePlan();
    const nonreg: AccountInput = {
      id: "acc_nonreg",
      name: "Non-registered",
      type: "NONREG",
      owner: "A",
      bal: 500_000,
      acb: 500_000,
      eq: 100,
      mix: { int: 1, div: 0, cg: 0 },
      // Explicit yields: 2% interest + 1% eligible dividends = $15,000 of
      // distributions on the opening balance, whatever the market does.
      yields: { interest: 0.02, eligDiv: 0.01, cgDist: 0, roc: 0 },
      juris: "ON",
      conv: 0,
      unlock: 0,
      contrib: 0,
      contribEnd: 0,
      wd: 0,
      wdStart: 0,
      wdEnd: 0,
    };
    return {
      ...base,
      planType: "single",
      endAge: 62,
      spendNeed: 12_000,
      indexationRate: 0,
      eqRet: totalReturn,
      fiRet: totalReturn,
      // No CPP/OAS in payment, no pension, no other assets: every dollar of
      // taxable income in the row comes from the non-registered account.
      people: [
        {
          ...base.people[0]!,
          curAge: 60,
          retAge: 60,
          cpp: { amt: 0, age: 65 },
          oas: { amt: 0, age: 65 },
        },
      ],
      accounts: [nonreg],
      expenses: [],
      hardAssets: [],
      liabilities: [],
    };
  };

  it("accrues taxable distributions in a NEGATIVE projection year, while the balance falls", () => {
    const r = projection(downYearPlan(-0.2));
    const row = r.rows[0]!;
    const closing = row.balances["acc_nonreg"]!;

    // 1. The balance genuinely fell, and by far more than the withdrawal — a
    //    real market loss, not a drawdown.
    expect(closing).toBeLessThan(500_000);
    expect(500_000 - closing).toBeGreaterThan(row.nonregWithdraw * 2);

    // 2. In that SAME row, distributions are still taxed. 2% + 1% on $500,000.
    expect(row.distributionsTaxable).toBeCloseTo(15_000, 6);
    expect(row.taxable).toBeGreaterThan(15_000);

    // 3. The interest and the grossed-up dividend both reach taxable income;
    //    the loss does not net against them.
    expect(row.taxable).toBeCloseTo(
      10_000 + 5_000 * getTaxYear(2026).divGrossUp,
      0,
    );
  });

  it("distributes the same amount whether the year is up or down", () => {
    const up = projection(downYearPlan(0.08)).rows[0]!;
    const down = projection(downYearPlan(-0.2)).rows[0]!;
    expect(down.distributionsTaxable).toBeCloseTo(up.distributionsTaxable, 6);
    // Two-sided: the yields are a floor on taxable income, not the whole story
    // of the year — the balances must still diverge.
    expect(down.balances["acc_nonreg"]!).toBeLessThan(
      up.balances["acc_nonreg"]!,
    );
  });

  it("would collapse to zero taxable distributions if the yields were removed", () => {
    // Guards the guard: proves the assertions above are driven by the yield
    // vector reaching the projection, not by some other income source.
    const p = downYearPlan(-0.2);
    const noYield: PlanInputs = {
      ...p,
      accounts: p.accounts.map((a) => ({
        ...a,
        yields: { interest: 0, eligDiv: 0, cgDist: 0, roc: 0 },
      })),
    };
    const row = projection(noYield).rows[0]!;
    expect(row.distributionsTaxable).toBeCloseTo(0, 6);
  });

  it("taxes non-registered distributions in a flat year end to end", () => {
    const p: PlanInputs = regressionFixturePlan();
    const flat = lifetimeTax(
      projection({ ...p, indexationRate: 0, eqRet: 0, fiRet: 0 }),
    );
    // A portfolio earning nothing still distributes interest and dividends,
    // so lifetime tax cannot collapse to the no-portfolio case.
    expect(flat).toBeGreaterThan(0);
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

/**
 * Batch 0D defect [C] — the surplus sweep created money.
 *
 * `applyContribution` added the contribution to the account balance and to
 * `contribTotal`, but never took it out of household cash: `fixedCash` still
 * held the full employment income that funded it. Before 0D the surplus
 * vanished at year end and silently paid for the contribution; 0D's sweep
 * removed the vanishing without adding the outflow, so the household deposited
 * `contribTotal + surplus` in a year it only had `surplus` to spare.
 *
 * The fix adds `contribTotal` to `spendTarget`. These tests pin it closed from
 * three directions: conservation, one-for-one displacement, and the solver.
 */
describe("Batch 0D [C] — contributions are a use of cash, not free money", () => {
  const oneYearCouple = (tfsaContrib: number, spend: number, employ: number): PlanInputs => {
    const base = regressionFixturePlan();
    const acct = (
      id: string,
      type: AccountInput["type"],
      bal: number,
      contrib: number,
    ): AccountInput => ({
      id,
      name: id,
      type,
      owner: "A",
      bal,
      acb: bal,
      eq: 100,
      mix: { int: 1, div: 0, cg: 0 },
      // No distributions anywhere: every dollar in the row is employment
      // income, so the cash identity is exact and easy to read.
      yields: { interest: 0, eligDiv: 0, cgDist: 0, roc: 0 },
      juris: "ON",
      conv: 0,
      unlock: 0,
      contrib,
      contribEnd: 99,
      wd: 0,
      wdStart: 0,
      wdEnd: 0,
    });
    return {
      ...base,
      planType: "single",
      endAge: 51,
      currentSpend: spend,
      spendNeed: spend,
      indexationRate: 0,
      inflation: 0,
      eqRet: 0,
      fiRet: 0,
      people: [
        {
          ...base.people[0]!,
          curAge: 50,
          retAge: 65,
          employ,
          cpp: { amt: 0, age: 65 },
          oas: { amt: 0, age: 65 },
        },
      ],
      accounts: [
        acct("acc_tfsa", "TFSA", 0, tfsaContrib),
        acct("acc_nonreg", "NONREG", 0, 0),
      ],
      expenses: [],
      hardAssets: [],
      liabilities: [],
    };
  };

  const placed = (row: { balances: Record<string, number> }): number =>
    (row.balances["acc_tfsa"] ?? 0) + (row.balances["acc_nonreg"] ?? 0);

  it("never places more into the portfolio than after-tax income less spending", () => {
    const grossCash = 150_000;
    const baseSpend = 60_000;
    const r = projection(oneYearCouple(15_000, baseSpend, grossCash));
    const row = r.rows[0]!;

    // Total money that reached the accounts this year — the contribution plus
    // whatever the sweep added. Zero returns, so growth cannot inflate it.
    const total = placed(row);
    expect(row.contribTotal).toBeCloseTo(15_000, 6);
    expect(total).toBeCloseTo(row.contribTotal + row.surplusSwept, 6);

    // The conservation inequality. Under the old behaviour `total` was
    // `grossCash - tax - baseSpend` PLUS the 15,000 contribution, so this
    // failed by exactly the contributed amount.
    expect(total).toBeLessThanOrEqual(grossCash - row.tax - baseSpend + 0.01);

    // And it is tight, not merely satisfied by the household hoarding cash:
    // the surplus is fully deployed.
    expect(total).toBeCloseTo(grossCash - row.tax - baseSpend, 0);
  });

  it("reduces the sweep one-for-one when a contribution is added", () => {
    const without = projection(oneYearCouple(0, 60_000, 150_000)).rows[0]!;
    const with10k = projection(oneYearCouple(10_000, 60_000, 150_000)).rows[0]!;

    // A TFSA contribution changes no tax, so the only thing that can move is
    // where the money went. The sweep gives up exactly what the contribution
    // took.
    expect(with10k.tax).toBeCloseTo(without.tax, 6);
    expect(with10k.surplusSwept).toBeCloseTo(without.surplusSwept - 10_000, 0);

    // The household is no richer for having routed it differently. This is the
    // assertion that pins the defect closed: pre-fix the contributing plan
    // ended the year 10,000 ahead out of nowhere.
    expect(placed(with10k)).toBeCloseTo(placed(without), 0);
    expect(with10k.totalPortfolio).toBeCloseTo(without.totalPortfolio, 0);
  });

  it("makes the draw solver fund a contribution, or flags the shortfall", () => {
    // A retiree with no employment income and a fixed pension that covers the
    // spending but not the spending PLUS the contribution.
    const p = oneYearCouple(20_000, 40_000, 0);
    const retiree: PlanInputs = {
      ...p,
      endAge: 71,
      people: [
        { ...p.people[0]!, curAge: 70, retAge: 60, pen: { amt: 42_000, age: 60 } },
      ],
      accounts: p.accounts.map((a) =>
        a.id === "acc_nonreg" ? { ...a, bal: 100_000, acb: 100_000 } : a,
      ),
    };
    const row = projection(retiree).rows[0]!;

    // The contribution is now inside the spending target the solver must fund.
    expect(row.spendTarget).toBeGreaterThan(40_000 + 19_000);
    // So the household either draws to cover it or is told it cannot. Silently
    // absorbing it — the pre-fix behaviour — is neither.
    const drew = row.nonregWithdraw + row.regWithdraw + row.tfsaWithdraw > 1;
    expect(drew || row.fundingShortfall).toBe(true);
  });
});
