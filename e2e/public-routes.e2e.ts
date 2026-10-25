import { expect, test } from "@playwright/test";

test("landing page renders with title and primary content", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Northbound/);
  await expect(page.getByText("Real Canadian tax, not a rule of thumb")).toBeVisible();
});

test("auth page renders sign-in form", async ({ page }) => {
  await page.goto("/auth");
  await expect(page).toHaveTitle(/Sign in/);
  await expect(page.getByLabel(/email/i).first()).toBeVisible();
});

test("unauthenticated visit to /plans redirects to /auth", async ({ page }) => {
  await page.goto("/plans");
  await page.waitForURL(/\/auth/);
});
