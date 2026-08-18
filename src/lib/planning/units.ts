/**
 * The one place monthly and annual money are converted.
 *
 * House standard:
 *   - Every recurring cash-flow number a client types or reads is MONTHLY,
 *     with one exception: employment / working income stays ANNUAL, because
 *     that is how salary is quoted and how a T4 reports it.
 *   - The engine is ANNUAL everywhere. Nothing stored in a plan draft or
 *     passed to the projection is monthly.
 *
 * So the boundary is the UI, and it runs through these helpers only. No
 * component should ever write `* 12` or `/ 12` by hand.
 *
 * Lump sums (balances, one-off expenses, purchase prices, debt balances) are
 * point-in-time amounts, not cash flow, and are neither monthly nor annual.
 */

export const MONTHS_PER_YEAR = 12;

/** UI monthly figure -> engine annual figure. Null stays "unanswered". */
export function annualFromMonthly(monthly: number | null | undefined): number | null {
  if (monthly == null || Number.isNaN(monthly)) return null;
  return monthly * MONTHS_PER_YEAR;
}

/** Engine annual figure -> UI monthly figure, to the cent. */
export function monthlyFromAnnual(annual: number | null | undefined): number | null {
  if (annual == null || Number.isNaN(annual)) return null;
  return Math.round((annual / MONTHS_PER_YEAR) * 100) / 100;
}

/** Engine annual figure -> whole-dollar monthly figure, for headline display. */
export function monthlyDisplay(annual: number | null | undefined): number {
  if (annual == null || Number.isNaN(annual)) return 0;
  return Math.round(annual / MONTHS_PER_YEAR);
}

export const money = (n: number) =>
  n.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });

/** "$4,167 / month" from an annual engine figure. */
export const perMonth = (annual: number) => `${money(monthlyDisplay(annual))} / month`;

/** "$50,000 / year" from an annual engine figure. */
export const perYear = (annual: number) => `${money(Math.round(annual))} / year`;

/** "$4,167 / month ($50,000 / year)" — the monthly headline with its annual check. */
export const perMonthWithYear = (annual: number) => `${perMonth(annual)} (${perYear(annual)})`;
