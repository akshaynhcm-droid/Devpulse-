import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import * as db from "./db";
import { sendPasswordResetEmail } from "./email";
import { settingsRouter } from "./settingsRouter";
import { hashPassword } from "./utils/password";

// Import individual routers
import { collectionsRouter } from "./api/collections";
import { scanningRouter } from "./api/scanning";
import { shadowAPIRouter } from "./api/shadowAPI";
import { tokenAnalyticsRouter } from "./api/tokenAnalytics";
import { killSwitchRouter } from "./api/killSwitch";
import { complianceRouter } from "./api/compliance";
import { teamRouter } from "./api/team";
import { onboardingRouter } from "./api/onboarding";
import { dashboardRouter } from "./api/dashboard";
import { adminRouter } from "./api/admin";
import { paymentsRouter } from "./api/payments";

import { vscodeExtensionRouter } from "./api/vscodeExtension";

// ============================================================================
// MAIN ROUTER - merges all individual routers
// ============================================================================

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    }),
    forgotPassword: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const user = await db.getUserByEmail(input.email);
        if (user && user.email) {
          const token = crypto.randomBytes(32).toString("hex");
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await db.createPasswordResetToken(user.id, token, expiresAt);
          const appUrl = process.env.APP_URL || "http://localhost:3000";
          const resetUrl = `${appUrl}/reset-password?token=${token}`;
          try {
            await sendPasswordResetEmail({
              toEmail: user.email,
              resetUrl,
              expiresInHours: 24,
            });
          } catch (emailError) {
            console.error(
              "[Auth] Failed to send password reset email:",
              emailError
            );
          }
        }
        return {
          success: true,
          message: "If an account exists, a reset email has been sent",
        };
      }),
    resetPassword: publicProcedure
      .input(
        z.object({
          token: z.string().min(1),
          newPassword: z.string().min(8).max(128),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const resetToken = await db.getPasswordResetToken(input.token);
        if (!resetToken) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid or expired token",
          });
        }
        if (new Date() > new Date(resetToken.expiresAt)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Token has expired",
          });
        }
        if (resetToken.usedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Token has already been used",
          });
        }
        const hashedPassword = hashPassword(input.newPassword);
        await db.updateUserPassword(resetToken.userId, hashedPassword);
        await db.markPasswordResetTokenUsed(resetToken.id);
        await db.revokeAllUserSessions(resetToken.userId);
        await db.createAuditLogEntry(
          resetToken.userId,
          "password_reset_completed",
          {},
          ctx.req.ip,
          ctx.req.headers["user-agent"] as string
        );
        return {
          success: true,
          message: "Password has been reset successfully",
        };
      }),
  }),
  settings: settingsRouter,
  collections: collectionsRouter,
  scanning: scanningRouter,
  shadowAPI: shadowAPIRouter,
  tokenAnalytics: tokenAnalyticsRouter,
  killSwitch: killSwitchRouter,
  compliance: complianceRouter,
  team: teamRouter,
  onboarding: onboardingRouter,
  dashboard: dashboardRouter,
  vscodeExtension: vscodeExtensionRouter,
  admin: adminRouter,
  payment: paymentsRouter,
});

export type AppRouter = typeof appRouter;
