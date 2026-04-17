/**
 * Settings Router
 * Handles user account settings: profile, security, notifications, account deletion
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import * as db from "./db";
import { hashPassword, verifyPassword } from "./utils/password";

// ============================================================================
// SETTINGS ROUTER
// ============================================================================

export const settingsRouter = router({
  // ==========================================================================
  // PROFILE TAB
  // ==========================================================================

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    const user = await db.getUserById(ctx.user.id);
    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      createdAt: user.createdAt,
      lastSignedIn: user.lastSignedIn,
    };
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        email: z.string().email().max(320).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not authenticated",
        });
      }

      const updates: { name?: string; email?: string } = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.email !== undefined) updates.email = input.email;

      await db.updateUserProfile(ctx.user.id, updates);

      // Log the action
      await db.createAuditLogEntry(
        ctx.user.id,
        "profile_updated",
        { updates: Object.keys(updates) },
        ctx.req.ip,
        ctx.req.headers["user-agent"] as string
      );

      return { success: true };
    }),

  // ==========================================================================
  // SECURITY TAB
  // ==========================================================================

  getSessions: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    const sessions = await db.getUserSessions(ctx.user.id);
    return {
      sessions: sessions.map(s => ({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        lastActiveAt: s.lastActiveAt,
        createdAt: s.createdAt,
        // Current session detection could be enhanced with session token comparison
      })),
    };
  }),

  revokeSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not authenticated",
        });
      }

      await db.revokeUserSession(input.sessionId);

      await db.createAuditLogEntry(
        ctx.user.id,
        "session_revoked",
        { sessionId: input.sessionId },
        ctx.req.ip,
        ctx.req.headers["user-agent"] as string
      );

      return { success: true };
    }),

  revokeAllSessions: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    await db.revokeAllUserSessions(ctx.user.id);

    await db.createAuditLogEntry(
      ctx.user.id,
      "all_sessions_revoked",
      {},
      ctx.req.ip,
      ctx.req.headers["user-agent"] as string
    );

    return { success: true };
  }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(8),
        newPassword: z.string().min(8).max(128),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not authenticated",
        });
      }

      // Get user with password
      const user = await db.getUserById(ctx.user.id);
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (!user.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This account was created via SSO and has no password set.",
        });
      }

      if (!verifyPassword(input.currentPassword, user.passwordHash)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Current password is incorrect",
        });
      }

      // Hash and update new password (PBKDF2-SHA512 via ./utils/password)
      const hashedNewPassword = hashPassword(input.newPassword);
      await db.updateUserPassword(ctx.user.id, hashedNewPassword);

      // Log the action
      await db.createAuditLogEntry(
        ctx.user.id,
        "password_changed",
        {},
        ctx.req.ip,
        ctx.req.headers["user-agent"] as string
      );

      // Revoke all other sessions for security
      await db.revokeAllUserSessions(ctx.user.id);

      return { success: true };
    }),

  // ==========================================================================
  // NOTIFICATIONS TAB
  // ==========================================================================

  getEmailPreferences: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    const prefs = await db.getOrCreateEmailPreferences(ctx.user.id);
    return {
      scanComplete: prefs.scanComplete,
      budgetAlerts: prefs.budgetAlerts,
      weeklyDigest: prefs.weeklyDigest,
      teamActivity: prefs.teamActivity,
      promotionalEmails: prefs.promotionalEmails,
    };
  }),

  updateEmailPreferences: protectedProcedure
    .input(
      z.object({
        scanComplete: z.boolean().optional(),
        budgetAlerts: z.boolean().optional(),
        weeklyDigest: z.boolean().optional(),
        teamActivity: z.boolean().optional(),
        promotionalEmails: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not authenticated",
        });
      }

      await db.updateEmailPreferences(ctx.user.id, input);

      await db.createAuditLogEntry(
        ctx.user.id,
        "email_preferences_updated",
        { changed: Object.keys(input) },
        ctx.req.ip,
        ctx.req.headers["user-agent"] as string
      );

      return { success: true };
    }),

  // ==========================================================================
  // DANGER ZONE - ACCOUNT DELETION
  // ==========================================================================

  getAuditLog: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not authenticated",
        });
      }

      const logs = await db.getAuditLogForUser(ctx.user.id, input.limit);
      return {
        logs: logs.map(l => ({
          id: l.id,
          action: l.action,
          details: l.details,
          ipAddress: l.ipAddress,
          createdAt: l.createdAt,
        })),
      };
    }),

  deleteAccount: protectedProcedure
    .input(
      z.object({
        confirmation: z.literal("DELETE MY ACCOUNT"),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not authenticated",
        });
      }

      // Create final audit log before deletion
      await db.createAuditLogEntry(
        ctx.user.id,
        "account_deletion_requested",
        { reason: input.reason || "No reason provided" },
        ctx.req.ip,
        ctx.req.headers["user-agent"] as string
      );

      // Delete everything
      const result = await db.deleteUserAccount(ctx.user.id);

      return result;
    }),
});

export type SettingsRouter = typeof settingsRouter;
