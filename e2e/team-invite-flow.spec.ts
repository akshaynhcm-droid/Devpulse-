import { test, expect } from "@playwright/test";

test.describe("Critical Path 2: Team Invite Flow", () => {
  test("Login → Invite team member → Accept invite (as new user) → Verify shared collection visible", async ({
    page,
    browser,
  }) => {
    // 1. Login as existing user (inviter)
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("inviter@example.com");
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /login|sign in/i }).click();

    // Should be on dashboard
    await expect(page).toHaveURL(/.*dashboard.*/);

    // 2. Navigate to team page and invite member
    await page.goto("/team");
    await expect(page.getByRole("heading", { name: /team/i })).toBeVisible();

    const inviteeEmail = `invitee-${Date.now()}@example.com`;
    await page.getByLabel(/email/i).fill(inviteeEmail);
    await page.getByLabel(/role/i).selectOption("editor");
    await page.getByRole("button", { name: /invite|send invitation/i }).click();

    // Should show success message
    await expect(
      page.getByText(/invitation sent|invite sent|success/i)
    ).toBeVisible();

    // 3. Create new browser context for invitee
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();

    // Register as invitee
    await inviteePage.goto("/register");
    await inviteePage.getByLabel(/email/i).fill(inviteeEmail);
    await inviteePage.getByLabel(/password/i).fill("SecurePass123!");
    await inviteePage.getByLabel(/name/i).fill("Invitee User");
    await inviteePage
      .getByRole("button", { name: /register|sign up/i })
      .click();

    // Should see pending invitations
    await inviteePage.goto("/invitations");
    await expect(
      inviteePage.getByText(/pending invitation|invitation from/i)
    ).toBeVisible();

    // Accept the invitation
    await inviteePage.getByRole("button", { name: /accept/i }).click();

    // 4. Verify shared collection is visible
    await inviteePage.goto("/collections");
    await expect(
      inviteePage.getByRole("heading", { name: /collections/i })
    ).toBeVisible();

    // The shared collection from inviter should be visible
    await expect(inviteePage.getByText(/shared|from inviter/i)).toBeVisible();

    // Cleanup
    await inviteeContext.close();
  });
});
