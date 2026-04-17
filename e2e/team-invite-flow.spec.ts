import { test, expect } from "@playwright/test";

/**
 * Critical Path 2: Team Invite Flow
 *
 * `test.fixme`'d — requires:
 *   1. Two seeded test users (inviter + invitee) with known credentials.
 *   2. A working (or stubbed) SMTP transport so the invite link is
 *      resolvable inside the test.
 */
test.describe("Critical Path 2: Team Invite Flow", () => {
  test.fixme(
    "Login → Invite team member → Accept invite → Verify shared collection visible",
    async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill("inviter@example.com");
      await page.getByLabel(/password/i).fill("password123");
      await page
        .getByRole("button", { name: /login|sign in/i, exact: false })
        .click();
      await expect(page).toHaveURL(/.*dashboard.*/);

      await page.goto("/team");
      await expect(
        page.getByRole("heading", { name: /team/i })
      ).toBeVisible();
    }
  );

  test("team page route does not 500 when unauthenticated", async ({
    page,
  }) => {
    const response = await page.goto("/team");
    expect(response).toBeTruthy();
    expect(response!.status()).toBeLessThan(500);
  });
});
