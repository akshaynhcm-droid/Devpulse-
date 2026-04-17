import { test, expect } from "@playwright/test";

/**
 * Critical Path 3: Kill Switch Flow
 *
 * The full happy path (login → set budget → trigger kill switch →
 * verify audit log) is `test.fixme`'d because it requires:
 *   1. A seeded test user with a known password.
 *   2. A pre-created collection with a scheduled scan and non-zero
 *      LLM spend so the budget actually trips.
 *
 * The smoke test below runs today and catches the common regression
 * where `/kill-switch` 500s or is removed from the router.
 */
test.describe("Critical Path 3: Kill Switch Flow", () => {
  test.fixme(
    "Login → Set budget limit → Trigger kill switch → Verify audit log entry",
    async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill("test@example.com");
      await page.getByLabel(/password/i).fill("password123");
      await page
        .getByRole("button", { name: /login|sign in/i, exact: false })
        .click();
      await expect(page).toHaveURL(/.*dashboard.*/);

      await page.goto("/kill-switch");
      await expect(
        page.getByRole("heading", { name: /kill switch/i })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /engage|arm|enable/i })
      ).toBeVisible();
    }
  );

  test("kill switch route does not 500 when unauthenticated", async ({
    page,
  }) => {
    const response = await page.goto("/kill-switch");
    // App should either render the page or redirect to /login — both
    // are acceptable. A 500 is not.
    expect(response).toBeTruthy();
    expect(response!.status()).toBeLessThan(500);
  });
});
