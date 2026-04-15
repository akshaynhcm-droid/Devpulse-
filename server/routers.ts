import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure, adminProcedure } from "./_core/trpc";
import * as db from "./db";
import { nanoid } from "nanoid";
import { sendTeamInviteEmail } from "./email";
import { sendSlackKillSwitchAlert } from "./slack";

// ============================================================================
// COLLECTIONS ROUTER
// ============================================================================

const collectionsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().max(1000).optional(),
        format: z.enum(["postman", "openapi"]),
        data: z.any(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Basic safety check: data must be an object
      if (!input.data || typeof input.data !== "object") {
        throw new Error("Invalid collection data: must be a JSON object");
      }
      const collection = await db.createCollection(
        ctx.user.id,
        input.name,
        input.format,
        input.data,
        input.description
      );
      return collection;
    }),

  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const collections = await db.getCollectionsByUserId(ctx.user.id);
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const total = collections.length;
      const paginated = collections.slice((page - 1) * pageSize, page * pageSize);
      return {
        collections: paginated.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description,
          format: c.format,
          totalRequests: c.totalRequests,
          createdAt: c.createdAt,
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const collection = await db.getCollectionById(input.id);
      if (!collection || collection.userId !== ctx.user.id) {
        throw new Error("Collection not found or access denied");
      }
      return collection;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const collection = await db.getCollectionById(input.id);
      if (!collection || collection.userId !== ctx.user.id) {
        throw new Error("Collection not found or access denied");
      }
      await db.deleteCollection(input.id);
      return { success: true };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const collection = await db.getCollectionById(input.id);
      if (!collection || collection.userId !== ctx.user.id) {
        throw new Error("Collection not found or access denied");
      }
      await db.updateCollection(input.id, { name: input.name, description: input.description });
      return { success: true };
    }),
});

// ============================================================================
// SCANNING ROUTER
// ============================================================================

const scanningRouter = router({
  startScan: protectedProcedure
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

      const findings = generateRealFindings(collection.data);
      const riskScore = calculateRiskScore(findings);
      const riskLevel = getRiskLevel(riskScore);

      const scan = await db.createScan(
        ctx.user.id,
        input.collectionId,
        input.scanType,
        "completed",
        riskScore,
        riskLevel,
        findings.length,
        findings
      );

      for (const finding of findings) {
        await db.createFinding(
          scan.id,
          input.collectionId,
          ctx.user.id,
          finding.title,
          finding.severity,
          finding.description,
          finding.category,
          finding.remediation,
          finding.cweId
        );
      }

      return {
        scanId: scan.id,
        riskScore,
        riskLevel,
        totalFindings: findings.length,
        findings,
      };
    }),

  listScans: protectedProcedure
    .input(
      z.object({
        collectionId: z.string(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        // Filter by scan type — exclude shadow_api by default for security scan page
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
      const paginated = scans.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);

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
      // ✅ SECURITY FIX: Verify ownership before updating
      const finding = await db.getFindingById(input.findingId);
      if (!finding || finding.userId !== ctx.user.id) {
        throw new Error("Finding not found or access denied");
      }
      await db.updateFindingStatus(input.findingId, input.status);
      return { success: true };
    }),
});

// ============================================================================
// SHADOW API ROUTER
// ============================================================================

const shadowAPIRouter = router({
  scanShadowAPIs: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const collection = await db.getCollectionById(input.collectionId);
      if (!collection || collection.userId !== ctx.user.id) {
        throw new Error("Collection not found or access denied");
      }

      const shadowAPIs = detectShadowAPIs(collection.data);

      const scan = await db.createScan(
        ctx.user.id,
        input.collectionId,
        "shadow_api",
        "completed",
        shadowAPIs.length * 10,
        shadowAPIs.length > 0 ? "HIGH" : "LOW",
        shadowAPIs.length
      );

      for (const api of shadowAPIs) {
        await db.createShadowAPI(
          scan.id,
          input.collectionId,
          ctx.user.id,
          api.endpoint,
          api.riskLevel,
          api.method,
          undefined,
          undefined,
          api.reason,
          api.recommendation
        );
      }

      return {
        scanId: scan.id,
        shadowAPIs,
        totalFound: shadowAPIs.length,
      };
    }),

  listShadowAPIs: protectedProcedure
    .input(
      z.object({
        collectionId: z.string(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      const collection = await db.getCollectionById(input.collectionId);
      if (!collection || collection.userId !== ctx.user.id) {
        throw new Error("Collection not found or access denied");
      }

      const allShadowAPIs = await db.getShadowAPIsByCollectionId(input.collectionId);

      const total = allShadowAPIs.length;
      const paginated = allShadowAPIs.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);

      return {
        shadowAPIs: paginated.map(api => ({
          id: api.id,
          endpoint: api.endpoint,
          method: api.method,
          riskLevel: api.riskLevel,
          reason: api.reason,
          recommendation: api.recommendation,
          isDocumented: api.isDocumented,
        })),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  markAsDocumented: protectedProcedure
    .input(z.object({ shadowApiId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // ✅ SECURITY FIX: Verify ownership before marking as documented
      const shadowApi = await db.getShadowAPIById(input.shadowApiId);
      if (!shadowApi || shadowApi.userId !== ctx.user.id) {
        throw new Error("Shadow API not found or access denied");
      }
      await db.markShadowAPIDocumented(input.shadowApiId);
      return { success: true };
    }),
});

// ============================================================================
// TOKEN ANALYTICS ROUTER
// ============================================================================

const tokenAnalyticsRouter = router({
  recordUsage: protectedProcedure
    .input(
      z.object({
        model: z.string().min(1).max(128),
        promptTokens: z.number().int().min(0),
        completionTokens: z.number().int().min(0),
        thinkingTokens: z.number().int().min(0),
        costUSD: z.number().min(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db.recordTokenUsage(
        ctx.user.id,
        input.model,
        input.promptTokens,
        input.completionTokens,
        input.thinkingTokens,
        input.costUSD
      );
      return { success: true };
    }),

  getAnalytics: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).optional() }))
    .query(async ({ input, ctx }) => {
      const usage = await db.getTokenUsageByUserId(ctx.user.id, input.days || 30);

      const byModel: Record<string, any> = {};
      let totalCost = 0;
      let totalTokens = 0;

      for (const record of usage) {
        if (!byModel[record.model]) {
          byModel[record.model] = {
            model: record.model,
            promptTokens: 0,
            completionTokens: 0,
            thinkingTokens: 0,
            totalTokens: 0,
            costUSD: 0,
          };
        }

        byModel[record.model].promptTokens += record.promptTokens;
        byModel[record.model].completionTokens += record.completionTokens;
        byModel[record.model].thinkingTokens += record.thinkingTokens;
        byModel[record.model].totalTokens += record.totalTokens;
        byModel[record.model].costUSD += parseFloat(record.costUSD as any);

        totalCost += parseFloat(record.costUSD as any);
        totalTokens += record.totalTokens;
      }

      return {
        byModel: Object.values(byModel),
        totalTokens,
        totalCost,
        usage: usage.map(u => ({
          date: u.date,
          model: u.model,
          tokens: u.totalTokens,
          cost: parseFloat(u.costUSD as any),
        })),
      };
    }),

  getModelBreakdown: protectedProcedure
    .input(z.object({ model: z.string() }))
    .query(async ({ input, ctx }) => {
      const usage = await db.getTokenUsageByModel(ctx.user.id, input.model);

      return {
        model: input.model,
        usage: usage.map(u => ({
          date: u.date,
          promptTokens: u.promptTokens,
          completionTokens: u.completionTokens,
          thinkingTokens: u.thinkingTokens,
          totalTokens: u.totalTokens,
          costUSD: parseFloat(u.costUSD as any),
        })),
      };
    }),
});

// ============================================================================
// KILL SWITCH ROUTER
// ============================================================================

const killSwitchRouter = router({
  setBudget: protectedProcedure
    .input(
      z.object({
        budgetLimitUSD: z.number().positive().max(1_000_000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db.updateKillSwitchSettings(ctx.user.id, input.budgetLimitUSD, undefined);
      await db.createKillSwitchEvent(
        ctx.user.id,
        "budget_set",
        input.budgetLimitUSD,
        undefined,
        "Budget limit set by user"
      );
      return { success: true };
    }),

  trigger: protectedProcedure
    .input(z.object({ reason: z.string().min(1).max(1000) }))
    .mutation(async ({ input, ctx }) => {
      const settings = await db.getKillSwitchSettings(ctx.user.id);
      await db.updateKillSwitchSettings(ctx.user.id, undefined, true);
      await db.createKillSwitchEvent(
        ctx.user.id,
        "triggered",
        settings?.budgetLimitUSD ? parseFloat(settings.budgetLimitUSD as any) : undefined,
        settings?.currentSpendUSD ? parseFloat(settings.currentSpendUSD as any) : undefined,
        input.reason
      );
      // Send Slack alert if configured
      await sendSlackKillSwitchAlert({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Unknown",
        reason: input.reason,
        currentSpend: settings?.currentSpendUSD ? parseFloat(settings.currentSpendUSD as any) : 0,
        budgetLimit: settings?.budgetLimitUSD ? parseFloat(settings.budgetLimitUSD as any) : 0,
      }).catch(err => console.warn("[KillSwitch] Slack alert failed:", err));
      return { success: true };
    }),

  // ✅ NEW: Reset (deactivate) kill switch
  reset: protectedProcedure
    .input(z.object({ reason: z.string().min(1).max(1000) }))
    .mutation(async ({ input, ctx }) => {
      const settings = await db.getKillSwitchSettings(ctx.user.id);
      await db.updateKillSwitchSettings(ctx.user.id, undefined, false);
      await db.createKillSwitchEvent(
        ctx.user.id,
        "reset",
        settings?.budgetLimitUSD ? parseFloat(settings.budgetLimitUSD as any) : undefined,
        settings?.currentSpendUSD ? parseFloat(settings.currentSpendUSD as any) : undefined,
        input.reason
      );
      return { success: true };
    }),

  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const settings = await db.getKillSwitchSettings(ctx.user.id);
    if (!settings) {
      await db.updateKillSwitchSettings(ctx.user.id, 100, false, 0);
      return {
        budgetLimitUSD: 100,
        isActive: false,
        currentSpendUSD: 0,
      };
    }
    return {
      budgetLimitUSD: parseFloat(settings.budgetLimitUSD as any),
      isActive: settings.isActive,
      currentSpendUSD: parseFloat(settings.currentSpendUSD as any),
    };
  }),

  getAuditTrail: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const events = await db.getKillSwitchAuditTrail(ctx.user.id);
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const total = events.length;
      const paginated = events.slice((page - 1) * pageSize, page * pageSize);

      return {
        events: paginated.map(e => ({
          id: e.id,
          eventType: e.eventType,
          budgetLimit: e.budgetLimit ? parseFloat(e.budgetLimit as any) : undefined,
          currentSpend: e.currentSpend ? parseFloat(e.currentSpend as any) : undefined,
          reason: e.reason,
          createdAt: e.createdAt,
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),
});

// ============================================================================
// COMPLIANCE ROUTER
// ============================================================================

const complianceRouter = router({
  generateReport: protectedProcedure
    .input(
      z.object({
        collectionId: z.string(),
        reportType: z.enum(["pci_dss", "owasp"]).default("pci_dss"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const collection = await db.getCollectionById(input.collectionId);
      if (!collection || collection.userId !== ctx.user.id) {
        throw new Error("Collection not found or access denied");
      }

      const requirements =
        input.reportType === "owasp"
          ? generateOWASPRequirements(collection.data)
          : generatePCIDSSRequirements(collection.data);

      // ✅ FIX: Compute metRequirements from actual statuses, not hardcoded 75%
      const metRequirements = requirements.filter(r => r.status === "met").length;
      const manualRequirements = requirements.filter(r => r.status === "manual_review").length;
      const complianceScore = (metRequirements / requirements.length) * 100;

      const report = await db.createComplianceReport(
        ctx.user.id,
        input.collectionId,
        input.reportType,
        complianceScore,
        requirements.length,
        metRequirements,
        requirements
      );

      return {
        reportId: report.id,
        complianceScore: Math.round(complianceScore),
        totalRequirements: requirements.length,
        metRequirements,
        manualRequirements,
        notMetRequirements: requirements.length - metRequirements - manualRequirements,
        requirements,
      };
    }),

  listReports: protectedProcedure
    .input(
      z.object({
        collectionId: z.string(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const collection = await db.getCollectionById(input.collectionId);
      if (!collection || collection.userId !== ctx.user.id) {
        throw new Error("Collection not found or access denied");
      }

      const reports = await db.getComplianceReportsByCollectionId(input.collectionId);
      const total = reports.length;
      const paginated = reports.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);

      return {
        reports: paginated.map(r => ({
          id: r.id,
          reportType: r.reportType,
          complianceScore: parseFloat(r.complianceScore as any),
          totalRequirements: r.totalRequirements,
          metRequirements: r.metRequirements,
          createdAt: r.createdAt,
        })),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  getReport: protectedProcedure
    .input(z.object({ reportId: z.string() }))
    .query(async ({ input, ctx }) => {
      const report = await db.getComplianceReportById(input.reportId);
      if (!report || report.userId !== ctx.user.id) {
        throw new Error("Report not found or access denied");
      }

      const requirements = report.requirementsData as any[];
      const manualRequirements = requirements?.filter(r => r.status === "manual_review").length ?? 0;
      const notMetRequirements = requirements?.filter(r => r.status === "not_met").length ?? 0;

      return {
        id: report.id,
        reportType: report.reportType,
        complianceScore: parseFloat(report.complianceScore as any),
        totalRequirements: report.totalRequirements,
        metRequirements: report.metRequirements,
        manualRequirements,
        notMetRequirements,
        requirements: report.requirementsData,
        createdAt: report.createdAt,
      };
    }),
});

// ============================================================================
// TEAM ROUTER
// ============================================================================

const teamRouter = router({
  invite: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["admin", "editor", "viewer"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Prevent duplicate invites
      const existing = await db.getTeamMemberByEmail(ctx.user.id, input.email);
      if (existing) {
        throw new Error("An invitation has already been sent to this email address");
      }

      const member = await db.inviteTeamMember(ctx.user.id, input.email, input.role);

      // ✅ Send real invitation email
      await sendTeamInviteEmail({
        toEmail: input.email,
        inviterName: ctx.user.name ?? "A DevPulse user",
        role: input.role,
      }).catch(err => console.warn("[Team] Email send failed:", err));

      return { success: true, memberId: member.id };
    }),

  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const members = await db.getTeamMembersByUserId(ctx.user.id);
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const total = members.length;
      const paginated = members.slice((page - 1) * pageSize, page * pageSize);

      return {
        members: paginated.map(m => ({
          id: m.id,
          email: m.memberEmail,
          role: m.role,
          status: m.status,
          invitedAt: m.invitedAt,
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),

  updateRole: protectedProcedure
    .input(
      z.object({
        memberId: z.string(),
        role: z.enum(["admin", "editor", "viewer"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // ✅ SECURITY FIX: Verify ownership before updating role
      const member = await db.getTeamMemberById(input.memberId);
      if (!member || member.userId !== ctx.user.id) {
        throw new Error("Team member not found or access denied");
      }
      await db.updateTeamMemberRole(input.memberId, input.role);
      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // ✅ SECURITY FIX: Verify ownership before removing member
      const member = await db.getTeamMemberById(input.memberId);
      if (!member || member.userId !== ctx.user.id) {
        throw new Error("Team member not found or access denied");
      }
      await db.removeTeamMember(input.memberId);
      return { success: true };
    }),

  resendInvite: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const member = await db.getTeamMemberById(input.memberId);
      if (!member || member.userId !== ctx.user.id) {
        throw new Error("Team member not found or access denied");
      }
      await sendTeamInviteEmail({
        toEmail: member.memberEmail,
        inviterName: ctx.user.name ?? "A DevPulse user",
        role: member.role,
      }).catch(err => console.warn("[Team] Email send failed:", err));
      return { success: true };
    }),
});

// ============================================================================
// ONBOARDING ROUTER
// ============================================================================

const onboardingRouter = router({
  getProgress: protectedProcedure.query(async ({ ctx }) => {
    const progress = await db.getOrCreateOnboardingProgress(ctx.user.id);
    return {
      currentStep: progress.currentStep,
      importCollectionCompleted: progress.importCollectionCompleted,
      runScanCompleted: progress.runScanCompleted,
      reviewFindingsCompleted: progress.reviewFindingsCompleted,
      inviteTeamCompleted: progress.inviteTeamCompleted,
      setupComplianceCompleted: progress.setupComplianceCompleted,
      completedAt: progress.completedAt,
    };
  }),

  completeStep: protectedProcedure
    .input(
      z.object({
        step: z.enum([
          "importCollection",
          "runScan",
          "reviewFindings",
          "inviteTeam",
          "setupCompliance",
        ]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db.updateOnboardingStep(ctx.user.id, input.step);
      return { success: true };
    }),

  complete: protectedProcedure.mutation(async ({ ctx }) => {
    await db.completeOnboarding(ctx.user.id);
    return { success: true };
  }),
});

// ============================================================================
// DASHBOARD ROUTER
// ============================================================================

const dashboardRouter = router({
  getMetrics: protectedProcedure.query(async ({ ctx }) => {
    // ✅ FIX: Use optimized single-call approach via db helpers
    const metrics = await db.getDashboardMetrics(ctx.user.id);
    return metrics;
  }),

  getRecentScans: protectedProcedure.query(async ({ ctx }) => {
    const recentScans = await db.getRecentScans(ctx.user.id, 5);
    return { scans: recentScans };
  }),
});

// ============================================================================
// ADMIN ROUTER (admin-only procedures)
// ============================================================================

const adminRouter = router({
  listAllUsers: adminProcedure.query(async () => {
    const users = await db.getAllUsers();
    return { users };
  }),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function safeGetPath(rawUrl: string): string | null {
  if (!rawUrl) return null;
  try {
    const fullUrl = rawUrl.startsWith("http")
      ? rawUrl
      : `https://example.com${rawUrl.startsWith("/") ? rawUrl : "/" + rawUrl}`;
    return new URL(fullUrl).pathname;
  } catch {
    return null;
  }
}

function generateRealFindings(collectionData: any) {
  const findings: Array<{
    id: string;
    title: string;
    severity: "Critical" | "High" | "Medium" | "Low";
    description: string;
    category: string;
    remediation: string;
    cweId: string;
  }> = [];

  const items: any[] = collectionData.item || [];
  const openApiPaths = collectionData.paths || {};

  // Process Postman-style items
  items.forEach((item: any) => {
    const url = item.request?.url?.raw || item.request?.url || "";
    const headers: any[] = item.request?.header || [];
    const method: string = (item.request?.method || "").toUpperCase();
    const displayUrl = typeof url === "string" ? url : url?.raw || "";

    // OWASP A02 - Cryptographic Failures: HTTP instead of HTTPS
    if (displayUrl.startsWith("http://")) {
      findings.push({
        id: nanoid(),
        title: "Cleartext HTTP Communication",
        severity: "High",
        description: `Endpoint ${displayUrl} transmits data over unencrypted HTTP.`,
        category: "Cryptographic Failures (OWASP A02)",
        remediation:
          "Enforce HTTPS on all endpoints. Set up HTTP → HTTPS redirect on your server or load balancer.",
        cweId: "CWE-319",
      });
    }

    // OWASP A07 - Authentication: mutating endpoint without auth header
    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      const hasAuth = headers.some(
        (h: any) =>
          typeof h.key === "string" &&
          (h.key.toLowerCase().includes("authorization") ||
            h.key.toLowerCase().includes("x-api-key") ||
            h.key.toLowerCase().includes("api-key"))
      );
      if (!hasAuth) {
        findings.push({
          id: nanoid(),
          title: "Unauthenticated State-Changing Request",
          severity: "Critical",
          description: `${method} ${displayUrl || "endpoint"} has no Authorization or API-Key header, making it vulnerable to unauthorized writes.`,
          category: "Broken Authentication (OWASP A07)",
          remediation:
            "Add an Authorization: Bearer <token> or X-API-Key header. Validate server-side on every request.",
          cweId: "CWE-306",
        });
      }
    }

    // OWASP A01 - Broken Access Control: integer IDs in URL path (IDOR risk)
    const path = safeGetPath(displayUrl);
    if (path && /\/\d+/.test(path)) {
      findings.push({
        id: nanoid(),
        title: "Potential Insecure Direct Object Reference (IDOR)",
        severity: "Medium",
        description: `Endpoint ${path} uses a sequential integer ID, which could allow unauthorized access to other users' resources.`,
        category: "Broken Access Control (OWASP A01)",
        remediation:
          "Replace integer IDs with UUIDs. Always verify the authenticated user owns the resource before returning data.",
        cweId: "CWE-639",
      });
    }

    // OWASP A05 - Security Misconfiguration: debug or test headers present
    const hasDebugHeader = headers.some(
      (h: any) =>
        typeof h.key === "string" &&
        (h.key.toLowerCase().startsWith("x-debug") ||
          h.key.toLowerCase() === "x-forwarded-for")
    );
    if (hasDebugHeader) {
      findings.push({
        id: nanoid(),
        title: "Debug Headers Exposed in Request",
        severity: "Low",
        description: `Request to ${displayUrl || "endpoint"} includes debug headers that should never appear in production traffic.`,
        category: "Security Misconfiguration (OWASP A05)",
        remediation:
          "Remove debug headers (X-Debug-*, X-Forwarded-For) before deploying to production.",
        cweId: "CWE-489",
      });
    }

    // OWASP A09 - Security Logging: missing request ID / correlation ID header
    if (method !== "GET") {
      const hasCorrelation = headers.some(
        (h: any) =>
          typeof h.key === "string" &&
          (h.key.toLowerCase().includes("x-request-id") ||
            h.key.toLowerCase().includes("x-correlation-id") ||
            h.key.toLowerCase().includes("request-id"))
      );
      if (!hasCorrelation) {
        findings.push({
          id: nanoid(),
          title: "Missing Request Correlation ID",
          severity: "Low",
          description: `${method} ${displayUrl || "endpoint"} does not include a correlation/request ID header, making audit trail incomplete.`,
          category: "Security Logging Failures (OWASP A09)",
          remediation:
            "Include X-Request-ID or X-Correlation-ID headers for all non-GET requests to ensure full request traceability.",
          cweId: "CWE-778",
        });
      }
    }
  });

  // Process OpenAPI paths for additional checks
  Object.entries(openApiPaths).forEach(([pathStr, pathItem]: [string, any]) => {
    Object.entries(pathItem || {}).forEach(([httpMethod, operation]: [string, any]) => {
      if (["get", "post", "put", "delete", "patch"].includes(httpMethod)) {
        const hasSecurity =
          (operation.security && operation.security.length > 0) ||
          (collectionData.security && collectionData.security.length > 0);
        if (!hasSecurity && httpMethod !== "get") {
          findings.push({
            id: nanoid(),
            title: "OpenAPI Endpoint Missing Security Scheme",
            severity: "High",
            description: `${httpMethod.toUpperCase()} ${pathStr} has no security scheme defined in the OpenAPI spec.`,
            category: "Broken Authentication (OWASP A07)",
            remediation:
              "Add a security: [] block to this operation referencing your securitySchemes (e.g. bearerAuth).",
            cweId: "CWE-306",
          });
        }
      }
    });
  });

  return findings;
}

function detectShadowAPIs(collectionData: any) {
  const shadowAPIs: Array<{
    endpoint: string;
    method: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    reason: string;
    recommendation: string;
  }> = [];

  const items: any[] = collectionData.item || [];
  const riskyKeywords = [
    "debug",
    "test",
    "internal",
    "admin",
    "hidden",
    "dev",
    "beta",
    "staging",
    "old",
    "backup",
    "temp",
    "tmp",
    "legacy",
  ];
  const safePrefixes = ["/api/v1", "/api/v2", "/api/v3", "/public", "/v1", "/v2", "/v3"];
  const seen = new Set<string>();

  items.forEach((item: any) => {
    const method = (item.request?.method || "GET").toUpperCase();
    const rawUrl = item.request?.url?.raw || item.request?.url || "";
    const displayUrl = typeof rawUrl === "string" ? rawUrl : rawUrl?.raw || "";
    const path = safeGetPath(displayUrl) || "/";

    const key = `${method}:${path}`;
    if (seen.has(key)) return;
    seen.add(key);

    const lowerPath = path.toLowerCase();
    const matchedKeyword = riskyKeywords.find(k => lowerPath.includes(k));
    const isUnusualPath = !safePrefixes.some(prefix => lowerPath.startsWith(prefix));
    const isDestructiveWithoutPrefix =
      (method === "DELETE" || method === "PUT") &&
      !safePrefixes.some(p => lowerPath.startsWith(p));
    const isUndocumentedAdminOp =
      (lowerPath.includes("admin") || lowerPath.includes("internal")) &&
      ["DELETE", "PUT", "POST"].includes(method);

    let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
    let reason = "";
    let recommendation = "";

    if (isUndocumentedAdminOp) {
      riskLevel = "CRITICAL";
      reason = `Administrative ${method} operation on path '${path}' is not documented in official spec.`;
      recommendation =
        "Restrict admin endpoints behind IP allowlists and require elevated authentication (MFA). Document in OpenAPI spec.";
    } else if (matchedKeyword) {
      riskLevel = "HIGH";
      reason = `Path contains sensitive keyword '${matchedKeyword}' — may be a debug, staging, or legacy endpoint.`;
      recommendation =
        "Remove debug/staging endpoints in production. If needed, protect with authentication and IP restrictions.";
    } else if (isDestructiveWithoutPrefix) {
      riskLevel = "HIGH";
      reason = `${method} operation at '${path}' does not follow versioned API path conventions.`;
      recommendation =
        "Move all destructive operations under versioned paths like /api/v1/** and require authentication.";
    } else if (isUnusualPath && path !== "/") {
      riskLevel = "MEDIUM";
      reason = `Endpoint '${path}' does not follow standard REST versioning conventions (/api/v1/...).`;
      recommendation =
        "Document this endpoint in your OpenAPI spec or migrate to a versioned path structure.";
    } else {
      return; // Skip ordinary endpoints
    }

    shadowAPIs.push({ endpoint: path, method, riskLevel, reason, recommendation });
  });

  return shadowAPIs;
}

function calculateRiskScore(findings: any[]) {
  let score = 0;
  for (const finding of findings) {
    if (finding.severity === "Critical") score += 30;
    else if (finding.severity === "High") score += 20;
    else if (finding.severity === "Medium") score += 10;
    else if (finding.severity === "Low") score += 5;
  }
  return Math.min(100, score);
}

function getRiskLevel(score: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 80) return "CRITICAL" as const;
  if (score >= 60) return "HIGH" as const;
  if (score >= 30) return "MEDIUM" as const;
  return "LOW" as const;
}

function generatePCIDSSRequirements(collectionData: any) {
  const items: any[] = collectionData.item || [];
  const paths = collectionData.paths || {};
  const allItems = [
    ...items,
    ...Object.keys(paths).map(p => ({
      request: {
        url: { raw: `https://api.example.com${p}` },
        method: "GET",
        header: [],
      },
    })),
  ];

  const hasHttpsOnly = allItems.every(item => {
    const url = item.request?.url?.raw || item.request?.url || "";
    const rawUrl = typeof url === "string" ? url : url?.raw || "";
    return !rawUrl.startsWith("http://") || rawUrl === "";
  });

  const hasAuthHeaders = allItems
    .filter(item =>
      ["POST", "PUT", "DELETE", "PATCH"].includes((item.request?.method || "").toUpperCase())
    )
    .every(item => {
      const headers: any[] = item.request?.header || [];
      return headers.some(
        (h: any) =>
          typeof h.key === "string" &&
          (h.key.toLowerCase().includes("authorization") ||
            h.key.toLowerCase().includes("api-key"))
      );
    });

  const hasVersionedPaths =
    allItems.length === 0 ||
    allItems.some(item => {
      const url = item.request?.url?.raw || item.request?.url || "";
      const rawUrl = typeof url === "string" ? url : url?.raw || "";
      return rawUrl.includes("/api/v") || rawUrl.includes("/v1/") || rawUrl.includes("/v2/");
    });

  const hasRiskyEndpoints = allItems.some(item => {
    const url = item.request?.url?.raw || item.request?.url || "";
    const rawUrl = typeof url === "string" ? url : url?.raw || "";
    return /debug|test|internal|backup|tmp/i.test(rawUrl);
  });

  const hasNoIntegerIds = allItems.every(item => {
    const url = item.request?.url?.raw || item.request?.url || "";
    const rawUrl = typeof url === "string" ? url : url?.raw || "";
    const p = safeGetPath(rawUrl);
    return !p || !/\/\d+/.test(p);
  });

  const hasCorrelationHeaders = allItems
    .filter(item =>
      ["POST", "PUT", "DELETE", "PATCH"].includes((item.request?.method || "").toUpperCase())
    )
    .every(item => {
      const headers: any[] = item.request?.header || [];
      return headers.some(
        (h: any) =>
          typeof h.key === "string" && h.key.toLowerCase().includes("x-request-id")
      );
    });

  return [
    {
      id: "1.1",
      title: "Network Security Controls (Firewall / WAF)",
      description:
        "Install and maintain a network security control between untrusted networks and cardholder data.",
      status: "manual_review",
    },
    {
      id: "2.1",
      title: "Default Credentials Removed",
      description: "Do not use vendor-supplied defaults for system passwords and security parameters.",
      status: hasAuthHeaders ? "met" : "not_met",
    },
    {
      id: "3.1",
      title: "Sensitive Data Not Stored Unnecessarily",
      description: "Limit storage of sensitive authentication data and cardholder data.",
      status: "manual_review",
    },
    {
      id: "4.1",
      title: "Data Transmission Encryption (TLS)",
      description:
        "Protect cardholder data with strong cryptography during transmission over open, public networks.",
      status: hasHttpsOnly ? "met" : "not_met",
    },
    {
      id: "5.1",
      title: "Malware Protection",
      description: "Protect all systems and networks from malicious software.",
      status: "manual_review",
    },
    {
      id: "6.1",
      title: "Secure Software Development Lifecycle",
      description:
        "Develop and maintain secure systems and software. Address vulnerabilities in timely fashion.",
      status: hasVersionedPaths ? "met" : "not_met",
    },
    {
      id: "6.2",
      title: "No Debug / Test Endpoints in Production",
      description: "Remove development, test, and debug functionalities before production deployment.",
      status: hasRiskyEndpoints ? "not_met" : "met",
    },
    {
      id: "7.1",
      title: "Restrict Access by Business Need-to-Know",
      description:
        "Restrict access to system components and cardholder data to only those individuals whose job requires such access.",
      status: hasAuthHeaders ? "met" : "not_met",
    },
    {
      id: "8.1",
      title: "User Identification and Authentication",
      description:
        "Define and implement policies and procedures to ensure proper user identification management for all users.",
      status: hasAuthHeaders ? "met" : "not_met",
    },
    {
      id: "8.2",
      title: "Unique IDs Prevent Enumeration (No Sequential IDs)",
      description: "Use UUIDs or opaque tokens for resource identifiers to prevent IDOR attacks.",
      status: hasNoIntegerIds ? "met" : "not_met",
    },
    {
      id: "10.1",
      title: "Audit Logging and Request Traceability",
      description: "Log all access to system components and cardholder data. Implement audit trails.",
      status: hasCorrelationHeaders ? "met" : "not_met",
    },
    {
      id: "11.1",
      title: "Regular Security Testing",
      description: "Test security of systems and networks regularly.",
      status: allItems.length > 0 ? "met" : "not_met",
    },
    {
      id: "12.1",
      title: "Information Security Policy",
      description: "Establish, publish, maintain, and disseminate a security policy.",
      status: "manual_review",
    },
  ];
}

function generateOWASPRequirements(collectionData: any) {
  const items: any[] = collectionData.item || [];
  const paths = collectionData.paths || {};
  const allItems = [
    ...items,
    ...Object.keys(paths).map(p => ({
      request: {
        url: { raw: `https://api.example.com${p}` },
        method: "GET",
        header: [],
      },
    })),
  ];

  const hasAuthHeaders = allItems
    .filter(item =>
      ["POST", "PUT", "DELETE", "PATCH"].includes((item.request?.method || "").toUpperCase())
    )
    .every(item => {
      const headers: any[] = item.request?.header || [];
      return headers.some(
        (h: any) =>
          typeof h.key === "string" && h.key.toLowerCase().includes("authorization")
      );
    });

  const hasHttpsOnly = allItems.every(item => {
    const url = item.request?.url?.raw || item.request?.url || "";
    const rawUrl = typeof url === "string" ? url : url?.raw || "";
    return !rawUrl.startsWith("http://") || rawUrl === "";
  });

  const hasNoIntegerIds = allItems.every(item => {
    const url = item.request?.url?.raw || item.request?.url || "";
    const rawUrl = typeof url === "string" ? url : url?.raw || "";
    const p = safeGetPath(rawUrl);
    return !p || !/\/\d+/.test(p);
  });

  const hasRiskyEndpoints = allItems.some(item => {
    const url = item.request?.url?.raw || item.request?.url || "";
    const rawUrl = typeof url === "string" ? url : url?.raw || "";
    return /debug|test|internal|backup|tmp/i.test(rawUrl);
  });

  return [
    {
      id: "A01",
      title: "Broken Access Control",
      description: "Restrictions on what authenticated users are allowed to do are not properly enforced.",
      status: hasAuthHeaders && hasNoIntegerIds ? "met" : "not_met",
    },
    {
      id: "A02",
      title: "Cryptographic Failures",
      description: "Sensitive data exposure due to missing or weak encryption.",
      status: hasHttpsOnly ? "met" : "not_met",
    },
    {
      id: "A03",
      title: "Injection",
      description: "Untrusted data is sent to an interpreter as part of a command or query.",
      status: "manual_review",
    },
    {
      id: "A04",
      title: "Insecure Design",
      description: "Missing or ineffective control design that cannot be fixed by solid implementation.",
      status: "manual_review",
    },
    {
      id: "A05",
      title: "Security Misconfiguration",
      description: "Missing appropriate security hardening across any part of the application stack.",
      status: hasRiskyEndpoints ? "not_met" : "met",
    },
    {
      id: "A06",
      title: "Vulnerable and Outdated Components",
      description: "Using components with known vulnerabilities.",
      status: "manual_review",
    },
    {
      id: "A07",
      title: "Identification and Authentication Failures",
      description: "Weaknesses in authentication and session management.",
      status: hasAuthHeaders ? "met" : "not_met",
    },
    {
      id: "A08",
      title: "Software and Data Integrity Failures",
      description: "Code and infrastructure that does not protect against integrity violations.",
      status: "manual_review",
    },
    {
      id: "A09",
      title: "Security Logging and Monitoring Failures",
      description: "Insufficient logging, monitoring, and incident response.",
      status: "manual_review",
    },
    {
      id: "A10",
      title: "Server-Side Request Forgery (SSRF)",
      description: "Web application fetches a remote resource without validating the user-supplied URL.",
      status: "manual_review",
    },
  ];
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  collections: collectionsRouter,
  scanning: scanningRouter,
  shadowAPI: shadowAPIRouter,
  tokenAnalytics: tokenAnalyticsRouter,
  killSwitch: killSwitchRouter,
  compliance: complianceRouter,
  team: teamRouter,
  onboarding: onboardingRouter,
  dashboard: dashboardRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
