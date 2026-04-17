/**
 * VS Code Extension API Router
 * Provides endpoints for the DevPulse VS Code extension
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import * as db from "../db";

export const vscodeExtensionRouter = router({
  /**
   * Validate an API key for VS Code extension authentication
   */
  validateApiKey: publicProcedure
    .input(z.object({ apiKey: z.string() }))
    .mutation(async ({ input }) => {
      // Check if API key exists and is valid
      const user = await db.getUserByApiKey(input.apiKey);

      if (!user) {
        return { valid: false, user: null };
      }

      return {
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
        },
      };
    }),

  /**
   * Record activity from VS Code extension
   */
  recordActivity: protectedProcedure
    .input(
      z.object({
        type: z.enum([
          "heartbeat",
          "file_change",
          "session_start",
          "session_end",
        ]),
        data: z.record(z.string(), z.any()),
        timestamp: z.string().datetime(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Store activity in database
      await db.recordVSCodeActivity(
        ctx.user.id,
        input.type,
        input.data,
        new Date(input.timestamp)
      );
      return { success: true };
    }),

  /**
   * Get user dashboard data for VS Code extension
   */
  getDashboardData: protectedProcedure.query(async ({ ctx }) => {
    const [collections, recentScans, tokenUsage] = await Promise.all([
      db.getCollectionsByUserId(ctx.user.id),
      db.getRecentScansForUser(ctx.user.id, 5),
      db.getTokenUsageByUserId(ctx.user.id, 7),
    ]);

    const totalFindings = recentScans.reduce(
      (sum, scan) => sum + (scan.totalFindings || 0),
      0
    );
    const openFindings = await db.getOpenFindingsCount(ctx.user.id);
    const weeklyCost = tokenUsage.reduce(
      (sum, u) => sum + parseFloat((u.costUSD as any) || "0"),
      0
    );

    return {
      collections: collections.length,
      recentScans: recentScans.length,
      totalFindings,
      openFindings,
      weeklyCost,
      lastScanAt: recentScans[0]?.createdAt ?? null,
    };
  }),

  /**
   * Get scan summary for a collection
   */
  getScanSummary: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ input, ctx }) => {
      const collection = await db.getCollectionById(input.collectionId);
      if (!collection || collection.userId !== ctx.user.id) {
        throw new Error("Collection not found or access denied");
      }

      const scans = await db.getScansByCollectionId(input.collectionId);
      const lastScan = scans[0];

      if (!lastScan) {
        return {
          hasScans: false,
          lastScan: null,
          totalFindings: 0,
          criticalFindings: 0,
        };
      }

      const findings = await db.getFindingsByScanId(lastScan.id);
      const criticalFindings = findings.filter(
        f => f.severity === "Critical" || f.severity === "High"
      );

      return {
        hasScans: true,
        lastScan: {
          id: lastScan.id,
          status: lastScan.status,
          completedAt: lastScan.completedAt,
        },
        totalFindings: findings.length,
        criticalFindings: criticalFindings.length,
      };
    }),

  /**
   * Trigger a new scan from VS Code extension
   */
  triggerScan: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const collection = await db.getCollectionById(input.collectionId);
      if (!collection || collection.userId !== ctx.user.id) {
        throw new Error("Collection not found or access denied");
      }

      // Check user plan limits
      const user = await db.getUserById(ctx.user.id);
      if (!user) {
        throw new Error("User not found");
      }
      if (user.plan === "free" && (user.scansRemaining ?? 0) <= 0) {
        throw new Error(
          "Scan limit reached. Upgrade to Pro for unlimited scans."
        );
      }

      // Queue a pending scan — the scanning worker will pick it up asynchronously.
      const scan = await db.createScan(
        ctx.user.id,
        input.collectionId,
        "quick",
        "pending",
        0,
        "LOW",
        0
      );

      // Decrement free user scans
      if (user.plan === "free") {
        await db.updateUser(ctx.user.id, {
          scansRemaining: Math.max(0, (user.scansRemaining ?? 0) - 1),
        });
      }

      return { scanId: scan.id, status: "queued" };
    }),

  /**
   * Get recent findings for VS Code extension status bar
   */
  getRecentFindings: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(5) }))
    .query(async ({ input, ctx }) => {
      const findings = await db.getRecentFindingsForUser(
        ctx.user.id,
        input.limit
      );
      return findings.map(f => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        status: f.status,
        category: f.category,
        collectionName: f.collectionName,
      }));
    }),

  /**
   * Update finding status from VS Code
   */
  updateFindingStatus: protectedProcedure
    .input(
      z.object({
        findingId: z.string(),
        status: z.enum(["open", "in-progress", "resolved"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const finding = await db.getFindingById(input.findingId);
      if (!finding || finding.userId !== ctx.user.id) {
        throw new Error("Finding not found or access denied");
      }

      await db.updateFindingStatus(input.findingId, input.status);
      return { success: true };
    }),

  /**
   * Generate API key for VS Code extension
   */
  generateApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    const apiKey = `dp_${generateSecureApiKey()}`;
    await db.updateUserApiKey(ctx.user.id, apiKey);
    return { apiKey };
  }),

  /**
   * Get extension settings for user
   */
  getExtensionSettings: protectedProcedure.query(async () => {
    return {
      trackingEnabled: true, // Could be stored in user preferences
      heartbeatInterval: 120,
      trackFiles: true,
      trackGit: true,
      excludePatterns: ["node_modules/**", ".git/**", "dist/**", "build/**"],
    };
  }),
});

// Helper function to generate secure API key
function generateSecureApiKey(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
