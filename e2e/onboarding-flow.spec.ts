import { test, expect } from "@playwright/test";

test.describe("Critical Path 1: Onboarding Flow", () => {
  test("Register → Onboarding wizard (5 steps) → Import collection → Run scan → View findings", async ({ page }) => {
    // 1. Navigate to registration
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /register|sign up/i })).toBeVisible();

    // Fill registration form
    await page.getByLabel(/email/i).fill(`test-${Date.now()}@example.com`);
    await page.getByLabel(/password/i).fill("SecurePass123!");
    await page.getByLabel(/name/i).fill("Test User");
    await page.getByRole("button", { name: /register|sign up/i }).click();

    // 2. Should redirect to onboarding wizard
    await expect(page).toHaveURL(/.*onboarding.*/);
    await expect(page.getByText(/step 1|welcome|getting started/i)).toBeVisible();

    // Step 1: Welcome
    await expect(page.getByRole("heading", { name: /welcome|getting started/i })).toBeVisible();
    await page.getByRole("button", { name: /next|continue/i }).click();

    // Step 2: Import Collection
    await expect(page.getByText(/import|collection/i)).toBeVisible();
    // Upload a sample collection
    const collectionData = JSON.stringify({
      info: { name: "Test API", description: "Test collection" },
      item: [{ name: "Test Request", request: { method: "GET", url: { raw: "https://api.example.com/test" } } }],
    });
    await page.getByTestId("collection-input").fill(collectionData);
    await page.getByRole("button", { name: /import|upload/i }).click();
    await page.getByRole("button", { name: /next|continue/i }).click();

    // Step 3: Run Scan
    await expect(page.getByText(/scan|security/i)).toBeVisible();
    await page.getByRole("button", { name: /start scan|run scan/i }).click();
    await expect(page.getByText(/scanning|in progress/i)).toBeVisible();

    // Wait for scan to complete
    await expect(page.getByText(/complete|finished|results/i)).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: /next|continue|view findings/i }).click();

    // Step 4: Review Findings
    await expect(page.getByText(/findings|issues|vulnerabilities/i)).toBeVisible();
    await page.getByRole("button", { name: /next|continue/i }).click();

    // Step 5: Invite Team (skip for now)
    await expect(page.getByText(/team|invite/i)).toBeVisible();
    await page.getByRole("button", { name: /skip|finish|complete/i }).click();

    // Should land on dashboard
    await expect(page).toHaveURL(/.*dashboard.*/);
    await expect(page.getByText(/collections|scans|metrics/i)).toBeVisible();
  });
});
