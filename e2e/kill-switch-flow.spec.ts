import { test, expect } from "@playwright/test";

test.describe("Critical Path 3: Kill Switch Flow", () => {
  test("Login → Set budget limit → Trigger kill switch → Verify audit log entry", async ({
    page,
  }) => {
    // 1. Login
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("test@example.com");
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /login|sign in/i }).click();

    await expect(page).toHaveURL(/.*dashboard.*/);

    // 2. Navigate to Kill Switch page
    await page.goto("/kill-switch");
    await expect(
      page.getByRole("heading", { name: /kill switch/i })
    ).toBeVisible();

    // 3. Set budget limit
    await page.getByLabel(/budget limit/i).clear();
    await page.getByLabel(/budget limit/i).fill("50");
    await page.getByRole("button", { name: /set budget|save/i }).click();

    // Should show success
    await expect(page.getByText(/budget set|updated|success/i)).toBeVisible();
    await expect(page.getByText(/\$50/i)).toBeVisible();

    // 4. Trigger kill switch (simulate exceeding budget or manual trigger)
    await page.getByRole("button", { name: /trigger|activate/i }).click();

    // Confirm trigger
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /confirm|yes/i })
      .click();

    // Should show triggered status
    await expect(
      page.getByText(/triggered|active|kill switch engaged/i)
    ).toBeVisible();

    // 5. Navigate to audit log and verify entry
    await page.goto("/audit-log");
    await expect(
      page.getByRole("heading", { name: /audit log/i })
    ).toBeVisible();

    // Should see the kill switch trigger event
    await expect(
      page.getByText(/kill switch triggered|budget exceeded/i)
    ).toBeVisible();

    // Verify the entry details
    const logEntry = page.getByTestId("audit-entry-kill-switch").first();
    await expect(logEntry).toContainText(/triggered|budget/i);
  });
});
