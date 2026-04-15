import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ============================================================================
// HELPERS
// ============================================================================

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
type CookieCall = { name: string; options: Record<string, unknown> };

function createAuthContext(overrides: Partial<AuthenticatedUser> = {}): {
  ctx: TrpcContext;
  clearedCookies: CookieCall[];
} {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-openid",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    onboardingCompleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

// ============================================================================
// DB MOCK — in-memory store shared across all tests
// ============================================================================

vi.mock("./db", async () => {
  const mockCollections: any[] = [];
  const mockScans: any[] = [];
  const mockFindings: any[] = [];
  const mockShadowAPIs: any[] = [];
  const mockTeamMembers: any[] = [];
  const mockTokenUsage: any[] = [];
  const mockKillSwitchSettings: any[] = [];
  const mockKillSwitchEvents: any[] = [];
  const mockComplianceReports: any[] = [];
  const mockOnboardingProgress: any[] = [];

  return {
    getCollectionsByUserId: vi.fn(async (userId: number) =>
      mockCollections.filter(c => c.userId === userId)
    ),
    getCollectionById: vi.fn(async (id: string) =>
      mockCollections.find(c => c.id === id) ?? null
    ),
    createCollection: vi.fn(async (userId: number, name: string, format: string, data: any, description?: string) => {
      const id = `col_test_${Date.now()}`;
      const col = { id, userId, name, format, data, description, totalRequests: data?.item?.length || 0, createdAt: new Date(), updatedAt: new Date() };
      mockCollections.push(col);
      return col;
    }),
    updateCollection: vi.fn(async (id: string, updates: any) => {
      const col = mockCollections.find(c => c.id === id);
      if (col) Object.assign(col, updates);
    }),
    deleteCollection: vi.fn(async (id: string) => {
      const idx = mockCollections.findIndex(c => c.id === id);
      if (idx !== -1) mockCollections.splice(idx, 1);
    }),
    createScan: vi.fn(async (_userId: number, collectionId: string, scanType: string, status: string, riskScore: number, riskLevel: string, totalFindings: number, findingsData?: any) => {
      const id = `scan_test_${Date.now()}`;
      mockScans.push({ id, userId: _userId, collectionId, scanType, status, riskScore: riskScore.toString(), riskLevel, totalFindings, findingsData, createdAt: new Date(), completedAt: new Date() });
      return { id };
    }),
    getScansByCollectionId: vi.fn(async (collectionId: string) =>
      mockScans.filter(s => s.collectionId === collectionId)
    ),
    getScanById: vi.fn(async (id: string) =>
      mockScans.find(s => s.id === id) ?? null
    ),
    getFindingsByScanId: vi.fn(async (scanId: string) =>
      mockFindings.filter(f => f.scanId === scanId)
    ),
    getFindingById: vi.fn(async (id: string) =>
      mockFindings.find(f => f.id === id) ?? null
    ),
    createFinding: vi.fn(async (scanId: string, collectionId: string, userId: number, title: string, severity: string, description?: string, category?: string, remediation?: string, cweId?: string) => {
      const id = `finding_test_${Date.now()}`;
      mockFindings.push({ id, scanId, collectionId, userId, title, severity, description, category, remediation, cweId, status: "open", createdAt: new Date() });
      return { id };
    }),
    updateFindingStatus: vi.fn(async (id: string, status: string) => {
      const f = mockFindings.find(f => f.id === id);
      if (f) f.status = status;
    }),
    createShadowAPI: vi.fn(async (...args: any[]) => {
      const id = `shadow_test_${Date.now()}`;
      mockShadowAPIs.push({ id, scanId: args[0], collectionId: args[1], userId: args[2], endpoint: args[3], riskLevel: args[4], method: args[5] ?? "GET", reason: args[8], recommendation: args[9], isDocumented: false });
      return { id };
    }),
    getShadowAPIById: vi.fn(async (id: string) =>
      mockShadowAPIs.find(a => a.id === id) ?? null
    ),
    getShadowAPIsByScanId: vi.fn(async (scanId: string) =>
      mockShadowAPIs.filter(a => a.scanId === scanId)
    ),
    getShadowAPIsByCollectionId: vi.fn(async (collectionId: string) =>
      mockShadowAPIs.filter(a => a.collectionId === collectionId)
    ),
    markShadowAPIDocumented: vi.fn(async (id: string) => {
      const a = mockShadowAPIs.find(a => a.id === id);
      if (a) a.isDocumented = true;
    }),
    recordTokenUsage: vi.fn(async () => {}),
    getTokenUsageByUserId: vi.fn(async () => []),
    getTokenUsageByModel: vi.fn(async () => []),
    getKillSwitchSettings: vi.fn(async (userId: number) =>
      mockKillSwitchSettings.find(s => s.userId === userId) ?? null
    ),
    updateKillSwitchSettings: vi.fn(async (userId: number, budget?: number, isActive?: boolean, spend?: number) => {
      const existing = mockKillSwitchSettings.find(s => s.userId === userId);
      if (existing) {
        if (budget !== undefined) existing.budgetLimitUSD = budget.toString();
        if (isActive !== undefined) existing.isActive = isActive;
        if (spend !== undefined) existing.currentSpendUSD = spend.toString();
      } else {
        mockKillSwitchSettings.push({
          id: `ks_${Date.now()}`,
          userId,
          budgetLimitUSD: budget?.toString() ?? "100",
          isActive: isActive ?? false,
          currentSpendUSD: spend?.toString() ?? "0",
        });
      }
    }),
    createKillSwitchEvent: vi.fn(async (...args: any[]) => {
      mockKillSwitchEvents.push({ id: `ks_evt_${Date.now()}`, userId: args[0], eventType: args[1], budgetLimit: args[2], currentSpend: args[3], reason: args[4], createdAt: new Date() });
    }),
    getKillSwitchAuditTrail: vi.fn(async (userId: number) =>
      mockKillSwitchEvents.filter(e => e.userId === userId)
    ),
    createComplianceReport: vi.fn(async (userId: number, collectionId: string, reportType: string, score: number, total: number, met: number, data: any) => {
      const id = `comp_test_${Date.now()}`;
      mockComplianceReports.push({ id, userId, collectionId, reportType, complianceScore: score.toString(), totalRequirements: total, metRequirements: met, requirementsData: data, createdAt: new Date() });
      return { id };
    }),
    getComplianceReportsByCollectionId: vi.fn(async (collectionId: string) =>
      mockComplianceReports.filter(r => r.collectionId === collectionId)
    ),
    getComplianceReportById: vi.fn(async (id: string) =>
      mockComplianceReports.find(r => r.id === id) ?? null
    ),
    inviteTeamMember: vi.fn(async (userId: number, memberEmail: string, role: string) => {
      const id = `team_test_${Date.now()}`;
      mockTeamMembers.push({ id, userId, memberEmail, role, status: "pending", invitedAt: new Date() });
      return { id };
    }),
    getTeamMemberById: vi.fn(async (id: string) =>
      mockTeamMembers.find(m => m.id === id) ?? null
    ),
    getTeamMemberByEmail: vi.fn(async (userId: number, memberEmail: string) =>
      mockTeamMembers.find(m => m.userId === userId && m.memberEmail === memberEmail) ?? null
    ),
    getTeamMembersByUserId: vi.fn(async (userId: number) =>
      mockTeamMembers.filter(m => m.userId === userId)
    ),
    updateTeamMemberRole: vi.fn(async (id: string, role: string) => {
      const m = mockTeamMembers.find(m => m.id === id);
      if (m) m.role = role;
    }),
    removeTeamMember: vi.fn(async (id: string) => {
      const idx = mockTeamMembers.findIndex(m => m.id === id);
      if (idx !== -1) mockTeamMembers.splice(idx, 1);
    }),
    getOrCreateOnboardingProgress: vi.fn(async (userId: number) => {
      let p = mockOnboardingProgress.find(p => p.userId === userId);
      if (!p) {
        p = {
          id: `onb_${Date.now()}`,
          userId,
          currentStep: 1,
          importCollectionCompleted: false,
          runScanCompleted: false,
          reviewFindingsCompleted: false,
          inviteTeamCompleted: false,
          setupComplianceCompleted: false,
          createdAt: new Date(),
          completedAt: null,
        };
        mockOnboardingProgress.push(p);
      }
      return p;
    }),
    updateOnboardingStep: vi.fn(async (userId: number, step: string) => {
      const p = mockOnboardingProgress.find(p => p.userId === userId);
      if (p) {
        if (step === "importCollection") { p.importCollectionCompleted = true; p.currentStep = 2; }
        if (step === "runScan") { p.runScanCompleted = true; p.currentStep = 3; }
        if (step === "reviewFindings") { p.reviewFindingsCompleted = true; p.currentStep = 4; }
        if (step === "inviteTeam") { p.inviteTeamCompleted = true; p.currentStep = 5; }
        if (step === "setupCompliance") { p.setupComplianceCompleted = true; }
      }
    }),
    completeOnboarding: vi.fn(async () => {}),
    upsertUser: vi.fn(async () => {}),
    getUserByOpenId: vi.fn(async () => null),
    getUserById: vi.fn(async () => null),
    getDashboardMetrics: vi.fn(async (userId: number) => ({
      totalCollections: 0,
      totalFindings: 0,
      highestRiskScore: 0,
      teamMembers: 0,
    })),
    getRecentScans: vi.fn(async (userId: number) => []),
    getAllUsers: vi.fn(async () => []),
  };
});

// Mock email and slack (don't send real emails in tests)
vi.mock("./email", () => ({
  sendTeamInviteEmail: vi.fn(async () => {}),
}));

vi.mock("./slack", () => ({
  sendSlackKillSwitchAlert: vi.fn(async () => {}),
}));

// ============================================================================
// AUTH TESTS
// ============================================================================

describe("auth.me", () => {
  it("returns null for unauthenticated requests", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns the user for authenticated requests", async () => {
    const { ctx } = createAuthContext({ name: "Alice" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Alice");
  });
});

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });

  it("works for unauthenticated users too (idempotent)", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});

// ============================================================================
// COLLECTIONS TESTS
// ============================================================================

describe("collections", () => {
  it("creates a collection for authenticated user", async () => {
    const { ctx } = createAuthContext({ id: 10 });
    const caller = appRouter.createCaller(ctx);

    const collection = await caller.collections.create({
      name: "My API",
      format: "postman",
      data: { item: [{ request: { method: "GET", url: { raw: "https://api.example.com/users" }, header: [] } }] },
    });

    expect(collection).toBeDefined();
    expect(collection.name).toBe("My API");
  });

  it("lists collections for authenticated user with pagination", async () => {
    const { ctx } = createAuthContext({ id: 10 });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.collections.list({ page: 1, pageSize: 10 });
    expect(result.collections).toBeDefined();
    expect(Array.isArray(result.collections)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.page).toBe(1);
  });

  it("throws when getting a collection that doesn't exist", async () => {
    const { ctx } = createAuthContext({ id: 10 });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.collections.get({ id: "nonexistent-id" })).rejects.toThrow(
      "Collection not found or access denied"
    );
  });

  it("throws when deleting a collection that doesn't belong to user", async () => {
    const { ctx } = createAuthContext({ id: 99 });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.collections.delete({ id: "some-other-collection" })).rejects.toThrow(
      "Collection not found or access denied"
    );
  });
});

// ============================================================================
// SCANNING TESTS
// ============================================================================

describe("scanning", () => {
  it("throws when starting a scan on a non-owned collection", async () => {
    const { ctx } = createAuthContext({ id: 99 });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.scanning.startScan({ collectionId: "nonexistent", scanType: "full" })
    ).rejects.toThrow("Collection not found or access denied");
  });

  it("throws when updating finding status without ownership", async () => {
    const { ctx } = createAuthContext({ id: 77 });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.scanning.updateFindingStatus({ findingId: "nonexistent", status: "resolved" })
    ).rejects.toThrow("Finding not found or access denied");
  });
});

// ============================================================================
// SHADOW API TESTS
// ============================================================================

describe("shadowAPI", () => {
  it("throws when marking undocumented without ownership", async () => {
    const { ctx } = createAuthContext({ id: 88 });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.shadowAPI.markAsDocumented({ shadowApiId: "nonexistent" })
    ).rejects.toThrow("Shadow API not found or access denied");
  });
});

// ============================================================================
// KILL SWITCH TESTS
// ============================================================================

describe("killSwitch", () => {
  it("returns default settings when none are set", async () => {
    const { ctx } = createAuthContext({ id: 200 });
    const caller = appRouter.createCaller(ctx);
    const settings = await caller.killSwitch.getSettings();
    expect(settings.budgetLimitUSD).toBe(100);
    expect(settings.isActive).toBe(false);
    expect(settings.currentSpendUSD).toBe(0);
  });

  it("sets a budget limit", async () => {
    const { ctx } = createAuthContext({ id: 201 });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.killSwitch.setBudget({ budgetLimitUSD: 250 });
    expect(result.success).toBe(true);
  });

  it("triggers the kill switch", async () => {
    const { ctx } = createAuthContext({ id: 202 });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.killSwitch.trigger({ reason: "Runaway agent detected" });
    expect(result.success).toBe(true);
  });

  it("resets the kill switch", async () => {
    const { ctx } = createAuthContext({ id: 202 });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.killSwitch.reset({ reason: "Issue resolved" });
    expect(result.success).toBe(true);
  });

  it("returns audit trail events", async () => {
    const { ctx } = createAuthContext({ id: 202 });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.killSwitch.getAuditTrail();
    expect(result.events).toBeDefined();
    expect(Array.isArray(result.events)).toBe(true);
  });
});

// ============================================================================
// TEAM TESTS
// ============================================================================

describe("team", () => {
  it("invites a team member with valid email", async () => {
    const { ctx } = createAuthContext({ id: 300 });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.team.invite({ email: "bob@company.com", role: "editor" });
    expect(result.success).toBe(true);
    expect(result.memberId).toBeDefined();
  });

  it("throws for invalid email", async () => {
    const { ctx } = createAuthContext({ id: 300 });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.team.invite({ email: "not-an-email", role: "viewer" })
    ).rejects.toThrow();
  });

  it("lists team members with pagination info", async () => {
    const { ctx } = createAuthContext({ id: 300 });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.team.list();
    expect(result.members).toBeDefined();
    expect(Array.isArray(result.members)).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });

  it("throws when updating role of member not owned by user (IDOR test)", async () => {
    const { ctx } = createAuthContext({ id: 999 });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.team.updateRole({ memberId: "nonexistent", role: "admin" })
    ).rejects.toThrow("Team member not found or access denied");
  });

  it("throws when removing a member not owned by user (IDOR test)", async () => {
    const { ctx } = createAuthContext({ id: 999 });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.team.remove({ memberId: "nonexistent" })
    ).rejects.toThrow("Team member not found or access denied");
  });
});

// ============================================================================
// ONBOARDING TESTS
// ============================================================================

describe("onboarding", () => {
  it("gets initial onboarding progress", async () => {
    const { ctx } = createAuthContext({ id: 400 });
    const caller = appRouter.createCaller(ctx);
    const progress = await caller.onboarding.getProgress();
    expect(progress.importCollectionCompleted).toBe(false);
    expect(progress.currentStep).toBe(1);
  });

  it("marks a step as complete", async () => {
    const { ctx } = createAuthContext({ id: 400 });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.onboarding.completeStep({ step: "importCollection" });
    expect(result.success).toBe(true);
  });

  it("step completion persists correctly", async () => {
    const { ctx } = createAuthContext({ id: 400 });
    const caller = appRouter.createCaller(ctx);
    const progress = await caller.onboarding.getProgress();
    expect(progress.importCollectionCompleted).toBe(true);
    expect(progress.currentStep).toBe(2);
  });
});

// ============================================================================
// TOKEN ANALYTICS TESTS
// ============================================================================

describe("tokenAnalytics", () => {
  it("gets analytics for authenticated user", async () => {
    const { ctx } = createAuthContext({ id: 500 });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.tokenAnalytics.getAnalytics({ days: 30 });
    expect(result.byModel).toBeDefined();
    expect(result.totalCost).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// DASHBOARD TESTS
// ============================================================================

describe("dashboard", () => {
  it("getMetrics returns well-formed data for a fresh user", async () => {
    const { ctx } = createAuthContext({ id: 600 });
    const caller = appRouter.createCaller(ctx);
    const metrics = await caller.dashboard.getMetrics();
    expect(metrics.totalCollections).toBeGreaterThanOrEqual(0);
    expect(metrics.totalFindings).toBeGreaterThanOrEqual(0);
    expect(metrics.teamMembers).toBeGreaterThanOrEqual(0);
  });

  it("getRecentScans returns a scans array", async () => {
    const { ctx } = createAuthContext({ id: 600 });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.getRecentScans();
    expect(result.scans).toBeDefined();
    expect(Array.isArray(result.scans)).toBe(true);
  });
});

// ============================================================================
// COMPLIANCE TESTS
// ============================================================================

describe("compliance", () => {
  it("throws when generating a report for a non-owned collection", async () => {
    const { ctx } = createAuthContext({ id: 700 });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.compliance.generateReport({ collectionId: "nonexistent", reportType: "pci_dss" })
    ).rejects.toThrow("Collection not found or access denied");
  });
});
