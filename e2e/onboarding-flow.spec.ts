import { test, expect } from "@playwright/test";

/**
 * Critical Path 1: Onboarding Flow
 *
 * The full happy path (register → 5-step wizard → import collection →
 * run scan → view findings) is `test.fixme`'d because it requires a
 * working backend with Redis + MySQL where real scan jobs complete
 * within the test timeout.
 *
 * The smoke test below catches the common regression where /register
 * silently disappears because of a routing change.
 */
test.describe("Critical Path 1: Onboarding Flow", () => {
  test.fixme(
    "Register → Onboarding wizard (5 steps) → Import collection → Run scan → View findings",
    async ({ page }) => {
      await page.goto("/register");
      await expect(
        page.getByRole("heading", { name: /register|sign up|create/i })
      ).toBeVisible();

      await page.getByLabel(/email/i).fill(`test-${Date.now()}@example.com`);
      await page.getByLabel(/password/i).fill("SecurePass123!");
      await page.getByLabel(/name/i).fill("Test User");
      await page
        .getByRole("button", { name: /register|sign up|create/i })
        .click();

      await expect(page).toHaveURL(/.*(onboarding|dashboard).*/);
    }
  );

  test("register page renders a usable signup form", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /register|sign up|create/i })
    ).toBeVisible();
  });
});
