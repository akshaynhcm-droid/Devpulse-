import { test, expect } from "@playwright/test";

test.describe("Critical Path 4: Pricing & Upgrade Flow", () => {
  test("Login → Go to pricing → Upgrade plan → Verify feature gating removed", async ({
    page,
  }) => {
    // 1. Login as free user
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("freeuser@example.com");
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /login|sign in/i }).click();

    await expect(page).toHaveURL(/.*dashboard.*/);

    // 2. Navigate to pricing page
    await page.goto("/pricing");
    await expect(
      page.getByRole("heading", { name: /pricing|plans/i })
    ).toBeVisible();

    // Should see multiple plans
    await expect(page.getByText(/free/i)).toBeVisible();
    await expect(page.getByText(/pro/i)).toBeVisible();
    await expect(page.getByText(/enterprise/i)).toBeVisible();

    // Should see feature gating for free plan
    await expect(
      page.getByText(/upgrade to unlock|pro feature|limited/i)
    ).toBeVisible();

    // 3. Click upgrade button
    await page.getByTestId("upgrade-pro").click();

    // Should go to checkout/payment page
    await expect(page).toHaveURL(/.*checkout|payment|upgrade.*/);
    await expect(
      page.getByRole("heading", { name: /checkout|payment|upgrade/i })
    ).toBeVisible();

    // Fill payment details (test mode)
    await page.getByLabel(/card number/i).fill("4242 4242 4242 4242");
    await page.getByLabel(/expiry/i).fill("12/25");
    await page.getByLabel(/cvc|cvv/i).fill("123");
    await page.getByRole("button", { name: /pay|subscribe|upgrade/i }).click();

    // Should show success
    await expect(
      page.getByText(/success|confirmed|welcome to pro/i)
    ).toBeVisible({ timeout: 10000 });

    // 4. Verify feature gating removed - go back to dashboard
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/.*dashboard.*/);

    // Should now see Pro features
    await expect(page.getByText(/pro|premium|unlimited/i)).toBeVisible();

    // Should NOT see upgrade prompts
    await expect(page.getByText(/upgrade to unlock/i)).not.toBeVisible();

    // Can access previously gated features
    await page.goto("/team");
    await expect(page.getByRole("heading", { name: /team/i })).toBeVisible();
    // Should be able to add team members without limit warnings
    await expect(page.getByText(/team member|invite/i)).toBeEnabled();
  });
});
