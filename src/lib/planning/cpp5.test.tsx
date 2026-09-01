import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProjectionValidityDisclosure } from "@/components/plan/ProjectionValidityDisclosure";
import { buildRecommendations, compareStrategies, goalProgress } from "./analysis";
import { AUTO_FALLBACK_STRATEGY, lifetimeTax, runPlan } from "./engine";
import {
  accumulationGoldenFixturePlan,
  coupleGoldenFixturePlan,
  lockedInGoldenFixturePlan,
  regressionFixturePlan,
  survivorGoldenFixturePlan,
} from "./fixtures";
import { projection } from "./projection";
import { rrifMinFactor } from "./registered";
import { summarize, type PlanOutput } from "./summary";
import type {
  AccountInput,
  PlanInputs,
  ProjectionResult,
  ResultValidity,
  ValidityReason,
} from "./types";

const CPP_REASON_CODE = "CPP_SURVIVOR_REDUCTION_APPROXIMATE";
const SURVIVOR_COMPONENTS = ["cpp.survivorReduction", "cpp.survivorBaseCap"] as const;

function component(P: ProjectionResult, id: (typeof SURVIVOR_COMPONENTS)[number]) {
  const entry = P.componentStatuses.find((candidate) => candidate.component === id);
  expect(entry, `missing ${id}`).toBeDefined();
  return entry!;
}

function render(output: Pick<PlanOutput, "validity" | "validityReasons">): string {
  return renderToStaticMarkup(<ProjectionValidityDisclosure output={output} />);
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function cleanControl(): PlanInputs {
  const base = survivorGoldenFixturePlan();
  return {
    ...base,
    endAge: base.people[0]!.curAge,
    people: base.people.map((person) => ({ ...person, deathAge: 0 })),
  };
}

function withValidity(
  output: PlanOutput,
  validity: ResultValidity,
  validityReasons: ValidityReason[],
): PlanOutput {
  return { ...output, validity, validityReasons };
}

function retentionLossPlan(): PlanInputs {
  const base = regressionFixturePlan();
  const account: AccountInput = {
    id: "lif",
    name: "lif",
    type: "LIF",
    owner: "A",
    bal: 400000,
    acb: 0,
    eq: 0,
    mix: { int: 1, div: 0, cg: 0 },
    juris: "MB",
    conv: 55,
    unlock: 100,
    contrib: 0,
    contribEnd: 0,
    wd: 0,
    wdStart: 0,
    wdEnd: 0,
  };
  return {
    ...base,
    planType: "single",
    inflation: 0,
    indexationRate: 0,
    eqRet: -0.5,
    fiRet: -0.5,
    spendNeed: 0,
    currentSpend: 0,
    strategy: "nonreg_reg_tfsa",
    endAge: 68,
    people: [
      {
        ...base.people[0]!,
        curAge: 66,
        retAge: 66,
        employ: 0,
        cpp: { amt: 0, age: 65 },
        oas: { amt: 0, age: 65 },
        pen: { amt: 0, age: 65 },
        bridge: { amt: 0, end: 65 },
      },
    ],
    accounts: [account],
    expenses: [],
    otherIncome: [],
    lumpSums: [],
    hardAssets: [],
    liabilities: [],
  };
}

describe("CPP-5 — engine validity reaches every projection result view", () => {
  it("CPP5-1 / CPP5-2: an engaged survivor reason renders once from the engine", () => {
    const P = runPlan(survivorGoldenFixturePlan(), { startYear: 2026 });
    for (const id of SURVIVOR_COMPONENTS) expect(component(P, id).engaged).toBe(true);

    const reason = P.validityReasons.find((candidate) => candidate.code === CPP_REASON_CODE);
    expect(reason).toBeDefined();
    const output = summarize(P);
    expect(output.validityReasons).toContainEqual(reason);

    const html = render(output).replaceAll("&#x27;", "'");
    expect(html).toContain(reason!.detail);
    expect(count(html, reason!.detail)).toBe(1);
  });

  it("CPP5-3: no survivor engagement produces no survivor warning", () => {
    const P = runPlan(cleanControl(), { startYear: 2026 });
    for (const id of SURVIVOR_COMPONENTS) expect(component(P, id).engaged).toBe(false);
    expect(P.validity).toBe("OK");
    expect(P.validityReasons.some((reason) => reason.code === CPP_REASON_CODE)).toBe(false);
    expect(render(summarize(P))).toBe("");
  });

  it("CPP5-4: presentation accepts engine metadata and contains no survivor predicate", () => {
    const componentSource = readFileSync(
      "src/components/plan/ProjectionValidityDisclosure.tsx",
      "utf8",
    );
    const summarySource = readFileSync("src/lib/planning/summary.ts", "utf8");

    expect(componentSource).toContain("output.validity");
    expect(componentSource).toContain("output.validityReasons");
    expect(summarySource).toMatch(/validity:\s*P\.validity/);
    expect(summarySource).toMatch(/validityReasons:\s*P\.validityReasons/);
    for (const forbidden of [
      "deathAge",
      "survivorPct",
      "cpp.age",
      "cpp.amt",
      "planType",
      "married",
    ]) {
      expect(componentSource).not.toContain(forbidden);
    }
  });

  it("CPP5-5: OK, APPROXIMATE and WITHHELD are presented truthfully", () => {
    const base = summarize(runPlan(cleanControl(), { startYear: 2026 }));
    const approximateReason = { code: "OTHER_APPROXIMATION", detail: "Another approximation." };
    const withheldReason = { code: "NOT_FIT", detail: "These figures are not fit for use." };

    expect(render(withValidity(base, "OK", []))).toBe("");

    const approximate = render(withValidity(base, "APPROXIMATE", [approximateReason]));
    expect(approximate).toContain('data-projection-validity="APPROXIMATE"');
    expect(approximate).toContain("Approximate");
    expect(approximate).toContain(approximateReason.detail);

    const withheld = render(withValidity(base, "WITHHELD", [withheldReason]));
    expect(withheld).toContain('data-projection-validity="WITHHELD"');
    expect(withheld).toContain("Withheld");
    expect(withheld).toContain(withheldReason.detail);
    expect(withheld).not.toContain("Approximate");
  });

  it("CPP5-6: another component's limitation does not create a CPP warning", () => {
    const P = runPlan(regressionFixturePlan(), { startYear: 2026 });
    expect(P.validity).not.toBe("OK");
    expect(P.validityReasons.some((reason) => reason.code !== CPP_REASON_CODE)).toBe(true);
    expect(P.validityReasons.some((reason) => reason.code === CPP_REASON_CODE)).toBe(false);

    const html = render(summarize(P));
    expect(html).toContain("Projection limitations");
    expect(html).not.toContain("simplified combined-maximum reduction");
  });

  it("CPP5-7: the shared surface precedes every normal results tab", () => {
    const route = readFileSync("src/routes/_authenticated/plans.$planId.tsx", "utf8");
    const disclosureAt = route.indexOf(
      "<ProjectionValidityDisclosure output={results.data.output} />",
    );
    const tabsAt = route.indexOf('<Tabs defaultValue="projection">');
    expect(disclosureAt).toBeGreaterThan(-1);
    expect(tabsAt).toBeGreaterThan(disclosureAt);

    const coveredTabs = [...route.matchAll(/<TabsContent value="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(coveredTabs).toEqual([
      "projection",
      "networth",
      "goal",
      "strategies",
      "advice",
      "whatif",
      "scenarios",
    ]);
    expect(count(route, "<ProjectionValidityDisclosure output={results.data.output} />")).toBe(1);
  });

  it("CPP5-8: survivor automatic selection and projection advice remain withheld", () => {
    const plan = { ...survivorGoldenFixturePlan(), strategy: "auto" as const };
    const P = runPlan(plan, { startYear: 2026 });
    for (const id of SURVIVOR_COMPONENTS) expect(component(P, id).engaged).toBe(true);
    expect(P.autoSelected).toBe(false);
    expect(P.autoSelectionStatus).toBe("WITHHELD");
    expect(P.chosenStrategy).toBe(AUTO_FALLBACK_STRATEGY);
    expect(P.autoSelectionBlockers).toEqual(expect.arrayContaining([...SURVIVOR_COMPONENTS]));

    const strategies = compareStrategies(plan, P.chosenStrategy);
    expect(strategies.every((row) => row.comparisonWithheld === true)).toBe(true);
    const recommendationIds = buildRecommendations(plan, P, strategies, goalProgress(plan, P)).map(
      (item) => item.id,
    );
    expect(recommendationIds).toContain("recommendations-withheld");
    expect(
      recommendationIds.some((id) =>
        [
          "strategy",
          "shortfall",
          "funded",
          "portfolio-exhausted",
          "oas",
          "bracket",
          "split",
        ].includes(id),
      ),
    ).toBe(false);
    expect(recommendationIds.some((id) => id.startsWith("cpp-"))).toBe(false);
  });

  it("CPP5-9: all seven numerical anchors remain frozen", () => {
    const single = regressionFixturePlan();
    const locked = projection(lockedInGoldenFixturePlan(), { startYear: 2026 });
    const measured = {
      singleIndexedLifetimeTax: lifetimeTax(runPlan(single, { startYear: 2026 })),
      singleFrozenLifetimeTax: lifetimeTax(
        runPlan({ ...single, indexationRate: 0 }, { startYear: 2026 }),
      ),
      coupleLifetimeTax: lifetimeTax(projection(coupleGoldenFixturePlan(), { startYear: 2026 })),
      accumulationLifetimeTax: lifetimeTax(
        runPlan(accumulationGoldenFixturePlan(), { startYear: 2026 }),
      ),
      lockedInLifetimeTax: lifetimeTax(locked),
      lockedInTerminalPortfolio: locked.rows[locked.rows.length - 1]!.totalPortfolio,
      survivorLifetimeTax: lifetimeTax(
        projection(survivorGoldenFixturePlan(), { startYear: 2026 }),
      ),
    };
    expect(Math.round(measured.singleIndexedLifetimeTax)).toBe(202530);
    expect(Math.round(measured.singleFrozenLifetimeTax)).toBe(281105);
    expect(Math.round(measured.coupleLifetimeTax)).toBe(406524);
    expect(Math.round(measured.accumulationLifetimeTax)).toBe(1756006);
    expect(Math.round(measured.lockedInLifetimeTax)).toBe(113283);
    expect(Math.round(measured.lockedInTerminalPortfolio)).toBe(131458);
    expect(Math.round(measured.survivorLifetimeTax)).toBe(274815);
  });

  it("CPP5-10: E2-1 retention measurements and defensive status remain frozen", () => {
    const locked = projection(lockedInGoldenFixturePlan(), { startYear: 2026 });
    const openingAt65 = locked.rows.find((row) => row.age === 64)!.balances["acc_lira"]!;
    const retainedMinimum = openingAt65 * (rrifMinFactor(65) / 100);
    const transferredToPrrif = openingAt65 - retainedMinimum;
    expect(retainedMinimum).toBe(8398.825698224313);
    expect(transferredToPrrif).toBe(201571.8167573835);

    const defensive = projection(retentionLossPlan(), { startYear: 2026 });
    const retention = defensive.componentStatuses.find(
      (entry) => entry.component === "rrif.transferRetention",
    );
    expect(retention?.engaged).toBe(false);
    expect(
      defensive.validityReasons.some(
        (reason) => reason.code === "RRIF_TRANSFER_RETENTION_NOT_ENFORCED",
      ),
    ).toBe(false);
  });
});
