import { z } from "zod";
import { router, protectedProcedure, editorProcedure } from "../_core/trpc";
import * as db from "../db";
import { runCollectionScan } from "../services/scanService";
import { wsManager } from "../websocket";
import { invalidateUserCache } from "../_core/cache";
import { getPlanLimits } from "../payments";
import {
  scansPerDayLimitError,
  shadowAPIGatedError,
} from "../utils/planLimits";

export const scanningRouter = router({
  startScan: editorProcedure
    .input(
      z.object({
        collectionId: z.string(),
        scanType: z.enum(["full", "quick", "shadow_api"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const collection = await db.getCollectionById(input.collectionId);
      if (!collection || collection.userId !== ctx.user.id) {
        throw new Error("Collection not found or access denied");
      }

      // Plan-limit enforcement: cap scans per day on free plan. Shadow-API
      // scans are a gated feature entirely — only pro/enterprise. Errors
      // carry a structured `cause` (see server/utils/planLimits.ts) so the
      // dashboard + VS Code extension can render an upgrade CTA instead of
      // parsing free-form strings.
      const plan = (ctx.user.plan ?? "free") as "free" | "pro" | "enterprise";
      const limits = getPlanLimits(plan);
      if (input.scanType === "shadow_api" && !limits.shadowAPI) {
        throw shadowAPIGatedError(plan);
      }
      if (Number.isFinite(limits.maxScansPerDay)) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentScans = (
          await db.getScansByCollectionId(input.collectionId)
        ).filter(s => s.createdAt >= since);
        if (recentScans.length >= limits.maxScansPerDay) {
          // Resets when the oldest scan in the window ages out.
          const oldestInWindow = recentScans.reduce(
            (min, s) => (s.createdAt < min ? s.createdAt : min),
            recentScans[0].createdAt
          );
          const resetsAt = oldestInWindow.getTime() + 24 * 60 * 60 * 1000;
          throw scansPerDayLimitError(
            plan,
            recentScans.length,
            limits.maxScansPerDay,
            resetsAt
          );
        }
      }

      // Broadcast scan started event
      wsManager.broadcastScanStarted(ctx.user.id, {
        scanId: "pending",
        collectionId: input.collectionId,
      });

      // Run the scan using the reusable service
      const result = await runCollectionScan(ctx.user.id, input.collectionId, {
        scanType: input.scanType,
        triggeredBy: "user",
      });

      // Get findings for WebSocket broadcast
      const findings = await db.getFindingsByScanId(result.scanId);
      const criticalCount = findings.filter(
        f => f.severity === "Critical"
      ).length;
      const highCount = findings.filter(f => f.severity === "High").length;

      // Broadcast scan complete event
      wsManager.broadcastScanComplete(ctx.user.id, {
        scanId: result.scanId,
        collectionId: input.collectionId,
        findingsCount: result.totalFindings,
        criticalCount,
        highCount,
      });

      return {
        scanId: result.scanId,
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        totalFindings: result.totalFindings,
        findings: findings.map(f => ({
          id: f.id,
          title: f.title,
          description: f.description,
          severity: f.severity,
          category: f.category,
          remediation: f.remediation,
          cweId: f.cweId,
        })),
      };
    }),

  listScans: protectedProcedure
    .input(
      z.object({
        collectionId: z.string(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        scanType: z.enum(["full", "quick", "shadow_api", "all"]).default("all"),
      })
    )
    .query(async ({ input, ctx }) => {
      const collection = await db.getCollectionById(input.collectionId);
      if (!collection || collection.userId !== ctx.user.id) {
        throw new Error("Collection not found or access denied");
      }

      let scans = await db.getScansByCollectionId(input.collectionId);

      if (input.scanType !== "all") {
        scans = scans.filter(s => s.scanType === input.scanType);
      }

      const total = scans.length;
      const paginated = scans.slice(
        (input.page - 1) * input.pageSize,
        input.page * input.pageSize
      );

      return {
        scans: paginated.map(s => ({
          id: s.id,
          scanType: s.scanType,
          status: s.status,
          riskScore: parseFloat(s.riskScore as any),
          riskLevel: s.riskLevel,
          totalFindings: s.totalFindings,
          createdAt: s.createdAt,
        })),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  getScan: protectedProcedure
    .input(z.object({ scanId: z.string() }))
    .query(async ({ input, ctx }) => {
      const scan = await db.getScanById(input.scanId);
      if (!scan || scan.userId !== ctx.user.id) {
        throw new Error("Scan not found or access denied");
      }

      const findings = await db.getFindingsByScanId(input.scanId);
      return {
        id: scan.id,
        scanType: scan.scanType,
        status: scan.status,
        riskScore: parseFloat(scan.riskScore as any),
        riskLevel: scan.riskLevel,
        totalFindings: scan.totalFindings,
        findings: findings.map(f => ({
          id: f.id,
          title: f.title,
          description: f.description,
          severity: f.severity,
          category: f.category,
          remediation: f.remediation,
          status: f.status,
          cweId: f.cweId,
        })),
        createdAt: scan.createdAt,
      };
    }),

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
});
