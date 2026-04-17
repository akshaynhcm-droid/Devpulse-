import { test, expect } from "@playwright/test";

/**
 * Golden-path auth tests.
 *
 * These exercise the new email/password flow wired through the
 * trpc.auth.signup and trpc.auth.login procedures. They assume the
 * Next.js dashboard is running on baseURL (see playwright.config.ts)
 * and the tRPC backend + MySQL are reachable.
 */
test.describe("Auth: email/password golden path", () => {
  test("register form renders with email, password, and name fields", async ({
    page,
  }) => {
    await page.goto("/register");

    await expect(page.getByTestId("signup-form")).toBeVisible();
    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create account/i })
    ).toBeVisible();
  });

  test("login form renders with email, password, and remember-me", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(page.getByTestId("login-form")).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /forgot password/i })
    ).toBeVisible();
  });

  test("signup with weak password shows client-side validation error", async ({
    page,
  }) => {
    await page.goto("/register");

    await page.getByLabel(/full name/i).fill("Ada Lovelace");
    await page.getByLabel(/email/i).fill(`test-${Date.now()}@example.com`);
    // 7 chars - fails the >= 8 check
    await page.getByLabel(/password/i).fill("short12");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByRole("alert")).toContainText(
      /at least 8 characters/i
    );
  });

  test("login with invalid credentials surfaces server error", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill("nobody@example.com");
    await page.getByLabel(/password/i).fill("wrong-password-123");
    await page.getByRole("button", { name: /sign in/i }).click();

    // The tRPC mutation either returns a TRPCError (expected) or a network
    // error if the backend isn't up. Either way the form should surface it.
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
  });

  test("signup → dashboard redirect (requires live backend)", async ({
    page,
  }) => {
    test.skip(
      !process.env.RUN_LIVE_AUTH_TESTS,
      "Set RUN_LIVE_AUTH_TESTS=1 with a live backend + DB to run the full flow"
    );

    await page.goto("/register");

    const email = `e2e-${Date.now()}@example.com`;
    await page.getByLabel(/full name/i).fill("E2E User");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill("SecurePass123!");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page).toHaveURL(/.*dashboard.*/, { timeout: 15_000 });
  });

  test("forgot-password reveals reset form and back-to-login link", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByRole("button", { name: /forgot password/i }).click();

    await expect(
      page.getByRole("heading", { name: /reset your password/i })
    ).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send reset link/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /back to login/i })
    ).toBeVisible();
  });
});
