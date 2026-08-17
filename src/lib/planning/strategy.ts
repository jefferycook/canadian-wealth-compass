/**
 * Withdrawal-order strategies.
 *
 * A strategy decides only the ORDER in which accounts are tapped to fund the
 * discretionary draw. The projection engine then draws the smallest gross
 * amount, in that order, that meets the after-tax spending target.
 */

import type { WithdrawalStrategy, WorkingAccount } from "./types";

/** Bucket an account into the three tax treatments a strategy reasons about. */
function bucket(a: WorkingAccount): "reg" | "tfsa" | "nonreg" {
  if (a.type === "TFSA") return "tfsa";
  if (a.type === "NONREG") return "nonreg";
  return "reg";
}

/** The named orderings the auto-solver searches over. */
export const FIXED_STRATEGIES: Exclude<WithdrawalStrategy, "auto">[] = [
  "nonreg_reg_tfsa",
  "reg_nonreg_tfsa",
  "tfsa_nonreg_reg",
  "prorata",
];

export const STRATEGY_LABELS: Record<WithdrawalStrategy, string> = {
  auto: "Auto (optimize)",
  nonreg_reg_tfsa: "Non-registered \u2192 Registered \u2192 TFSA",
  reg_nonreg_tfsa: "Registered \u2192 Non-registered \u2192 TFSA",
  tfsa_nonreg_reg: "TFSA \u2192 Non-registered \u2192 Registered",
  prorata: "Pro-rata across all accounts",
};

const RANKS: Record<
  Exclude<WithdrawalStrategy, "auto" | "prorata">,
  Record<"reg" | "tfsa" | "nonreg", number>
> = {
  nonreg_reg_tfsa: { nonreg: 0, reg: 1, tfsa: 2 },
  reg_nonreg_tfsa: { reg: 0, nonreg: 1, tfsa: 2 },
  tfsa_nonreg_reg: { tfsa: 0, nonreg: 1, reg: 2 },
};

/**
 * Order accounts for withdrawal under a strategy.
 *
 * "prorata" keeps the accounts in their given order so the engine draws across
 * everything roughly in proportion rather than exhausting one bucket first.
 * "auto" is resolved by the solver before it reaches here; treated as the
 * common non-registered-first default if it slips through.
 */
export function strategyOrder(
  accts: WorkingAccount[],
  strategy: WithdrawalStrategy,
): WorkingAccount[] {
  if (strategy === "prorata") return [...accts];
  const key = strategy === "auto" ? "nonreg_reg_tfsa" : strategy;
  const rank = RANKS[key];
  return [...accts].sort((x, y) => rank[bucket(x)] - rank[bucket(y)]);
}
