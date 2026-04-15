import { eq, and, desc, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  collections,
  scans,
  findings,
  shadowAPIs,
  tokenUsage,
  killSwitchEvents,
  killSwitchSettings,
  complianceReports,
  teamMembers,
  onboardingProgress,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// COLLECTIONS
// ============================================================================

export async function createCollection(
  userId: number,
  name: string,
  format: "postman" | "openapi",
  data: any,
  description?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const id = `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const totalRequests = format === "openapi" ? Object.keys(data.paths || {}).length : (data.item?.length || 0);

  await db.insert(collections).values({
    id,
    userId,
    name,
    format,
    data,
    description,
    totalRequests,
  });

  return { id, userId, name, format, totalRequests };
}

export async function updateCollection(
  id: string,
  updates: { name?: string; description?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const set: Record<string, unknown> = {};
  if (updates.name !== undefined) set.name = updates.name;
  if (updates.description !== undefined) set.description = updates.description;

  if (Object.keys(set).length > 0) {
    await db.update(collections).set(set).where(eq(collections.id, id));
  }
}

export async function getCollectionsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(desc(collections.createdAt));
}

export async function getCollectionById(id: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(collections)
    .where(eq(collections.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function deleteCollection(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Cascade delete all orphaned analytical data
  await db.delete(findings).where(eq(findings.collectionId, id));
  await db.delete(shadowAPIs).where(eq(shadowAPIs.collectionId, id));
  await db.delete(scans).where(eq(scans.collectionId, id));
  await db.delete(complianceReports).where(eq(complianceReports.collectionId, id));

  // Finally, delete the collection itself
  await db.delete(collections).where(eq(collections.id, id));
}

// ============================================================================
// SCANS
// ============================================================================

export async function createScan(
  userId: number,
  collectionId: string,
  scanType: "full" | "quick" | "shadow_api",
  status: "pending" | "running" | "completed" | "failed",
  riskScore: number,
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  totalFindings: number,
  findingsData?: any
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const id = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.insert(scans).values({
    id,
    userId,
    collectionId,
    scanType,
    status,
    riskScore: riskScore.toString(),
    riskLevel,
    totalFindings,
    findingsData,
    completedAt: status === "completed" ? new Date() : null,
  });

  return { id };
}

export async function getScansByCollectionId(collectionId: string) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(scans)
    .where(eq(scans.collectionId, collectionId))
    .orderBy(desc(scans.createdAt));
}

export async function getScanById(id: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(scans).where(eq(scans.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

// ============================================================================
// FINDINGS
// ============================================================================

export async function createFinding(
  scanId: string,
  collectionId: string,
  userId: number,
  title: string,
  severity: "Critical" | "High" | "Medium" | "Low",
  description?: string,
  category?: string,
  remediation?: string,
  cweId?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const id = `finding_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.insert(findings).values({
    id,
    scanId,
    collectionId,
    userId,
    title,
    severity,
    description,
    category,
    remediation,
    cweId,
  });

  return { id };
}

export async function getFindingsByScanId(scanId: string) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(findings)
    .where(eq(findings.scanId, scanId))
    .orderBy(desc(findings.createdAt));
}

export async function getFindingById(id: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(findings).where(eq(findings.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateFindingStatus(
  id: string,
  status: "open" | "in-progress" | "resolved"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(findings).set({ status }).where(eq(findings.id, id));
}

// ============================================================================
// SHADOW APIs
// ============================================================================

export async function createShadowAPI(
  scanId: string,
  collectionId: string,
  userId: number,
  endpoint: string,
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  method?: string,
  file?: string,
  line?: number,
  reason?: string,
  recommendation?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const id = `shadow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.insert(shadowAPIs).values({
    id,
    scanId,
    collectionId,
    userId,
    endpoint,
    method,
    file,
    line,
    riskLevel,
    reason,
    recommendation,
  });

  return { id };
}

export async function getShadowAPIsByScanId(scanId: string) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(shadowAPIs)
    .where(eq(shadowAPIs.scanId, scanId))
    .orderBy(desc(shadowAPIs.createdAt));
}

export async function getShadowAPIsByCollectionId(collectionId: string) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(shadowAPIs)
    .where(eq(shadowAPIs.collectionId, collectionId))
    .orderBy(desc(shadowAPIs.createdAt));
}

export async function getShadowAPIById(id: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(shadowAPIs).where(eq(shadowAPIs.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function markShadowAPIDocumented(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(shadowAPIs)
    .set({ isDocumented: true })
    .where(eq(shadowAPIs.id, id));
}

// ============================================================================
// TOKEN USAGE
// ============================================================================

export async function recordTokenUsage(
  userId: number,
  model: string,
  promptTokens: number,
  completionTokens: number,
  thinkingTokens: number,
  costUSD: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const id = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const totalTokens = promptTokens + completionTokens + thinkingTokens;

  await db.insert(tokenUsage).values({
    id,
    userId,
    model,
    promptTokens,
    completionTokens,
    thinkingTokens,
    totalTokens,
    costUSD: costUSD.toString(),
  });

  // Auto-increment currentSpendUSD in killSwitchSettings
  const ksSettings = await getKillSwitchSettings(userId);
  if (ksSettings) {
    const currentSpend = parseFloat(ksSettings.currentSpendUSD || "0");
    const updatedSpend = currentSpend + costUSD;
    await updateKillSwitchSettings(userId, undefined, undefined, updatedSpend);

    // Auto-trigger kill switch if budget exceeded and not already active
    const budgetLimit = parseFloat(ksSettings.budgetLimitUSD || "0");
    if (budgetLimit > 0 && updatedSpend >= budgetLimit && !ksSettings.isActive) {
      await updateKillSwitchSettings(userId, undefined, true);
      await createKillSwitchEvent(
        userId,
        "auto_triggered",
        budgetLimit,
        updatedSpend,
        `Budget limit of $${budgetLimit.toFixed(2)} exceeded (current spend: $${updatedSpend.toFixed(2)})`
      );
    }
  }
}

export async function getTokenUsageByUserId(userId: number, days: number = 30) {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await db
    .select()
    .from(tokenUsage)
    .where(and(eq(tokenUsage.userId, userId), gte(tokenUsage.date, startDate)))
    .orderBy(desc(tokenUsage.date));
}

export async function getTokenUsageByModel(userId: number, model: string) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(tokenUsage)
    .where(and(eq(tokenUsage.userId, userId), eq(tokenUsage.model, model)))
    .orderBy(desc(tokenUsage.date));
}

// ============================================================================
// KILL SWITCH
// ============================================================================

export async function createKillSwitchEvent(
  userId: number,
  eventType: "budget_set" | "triggered" | "auto_triggered" | "reset",
  budgetLimit?: number,
  currentSpend?: number,
  reason?: string,
  details?: any
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const id = `ks_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.insert(killSwitchEvents).values({
    id,
    userId,
    eventType,
    budgetLimit: budgetLimit?.toString(),
    currentSpend: currentSpend?.toString(),
    reason,
    details,
  });
}

export async function getKillSwitchSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(killSwitchSettings)
    .where(eq(killSwitchSettings.userId, userId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateKillSwitchSettings(
  userId: number,
  budgetLimitUSD?: number,
  isActive?: boolean,
  currentSpendUSD?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getKillSwitchSettings(userId);

  if (!existing) {
    const id = `ks_settings_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.insert(killSwitchSettings).values({
      id,
      userId,
      budgetLimitUSD: budgetLimitUSD?.toString(),
      isActive: isActive ?? false,
      currentSpendUSD: currentSpendUSD?.toString(),
    });
  } else {
    const updates: any = {};
    if (budgetLimitUSD !== undefined) updates.budgetLimitUSD = budgetLimitUSD.toString();
    if (isActive !== undefined) updates.isActive = isActive;
    if (currentSpendUSD !== undefined) updates.currentSpendUSD = currentSpendUSD.toString();

    if (Object.keys(updates).length > 0) {
      await db
        .update(killSwitchSettings)
        .set(updates)
        .where(eq(killSwitchSettings.userId, userId));
    }
  }
}

export async function getKillSwitchAuditTrail(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(killSwitchEvents)
    .where(eq(killSwitchEvents.userId, userId))
    .orderBy(desc(killSwitchEvents.createdAt));
}

// ============================================================================
// COMPLIANCE REPORTS
// ============================================================================

export async function createComplianceReport(
  userId: number,
  collectionId: string,
  reportType: "pci_dss" | "owasp" | "custom",
  complianceScore: number,
  totalRequirements: number,
  metRequirements: number,
  requirementsData?: any
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const id = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.insert(complianceReports).values({
    id,
    userId,
    collectionId,
    reportType,
    complianceScore: complianceScore.toString(),
    totalRequirements,
    metRequirements,
    requirementsData,
  });

  return { id };
}

export async function getComplianceReportsByCollectionId(collectionId: string) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(complianceReports)
    .where(eq(complianceReports.collectionId, collectionId))
    .orderBy(desc(complianceReports.createdAt));
}

export async function getComplianceReportById(id: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(complianceReports)
    .where(eq(complianceReports.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

// ============================================================================
// TEAM MEMBERS
// ============================================================================

export async function inviteTeamMember(
  userId: number,
  memberEmail: string,
  role: "admin" | "editor" | "viewer"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const id = `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.insert(teamMembers).values({
    id,
    userId,
    memberEmail,
    role,
  });

  return { id };
}

export async function getTeamMemberById(id: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getTeamMemberByEmail(userId: number, memberEmail: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.memberEmail, memberEmail)))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getTeamMembersByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .orderBy(desc(teamMembers.invitedAt));
}

export async function updateTeamMemberRole(
  id: string,
  role: "admin" | "editor" | "viewer"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(teamMembers).set({ role }).where(eq(teamMembers.id, id));
}

export async function removeTeamMember(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(teamMembers).where(eq(teamMembers.id, id));
}

// ============================================================================
// ONBOARDING
// ============================================================================

export async function getOrCreateOnboardingProgress(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(onboardingProgress)
    .where(eq(onboardingProgress.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const id = `onb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(onboardingProgress).values({
    id,
    userId,
  });

  return await db
    .select()
    .from(onboardingProgress)
    .where(eq(onboardingProgress.userId, userId))
    .limit(1)
    .then((r) => r[0]);
}

export async function updateOnboardingStep(
  userId: number,
  step: "importCollection" | "runScan" | "reviewFindings" | "inviteTeam" | "setupCompliance"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updates: any = {};

  if (step === "importCollection") { updates.importCollectionCompleted = true; updates.currentStep = 2; }
  if (step === "runScan") { updates.runScanCompleted = true; updates.currentStep = 3; }
  if (step === "reviewFindings") { updates.reviewFindingsCompleted = true; updates.currentStep = 4; }
  if (step === "inviteTeam") { updates.inviteTeamCompleted = true; updates.currentStep = 5; }
  if (step === "setupCompliance") { updates.setupComplianceCompleted = true; }

  // Mark completedAt if all steps done
  const progress = await getOrCreateOnboardingProgress(userId);
  const allStepsCompleted =
    (updates.importCollectionCompleted || progress.importCollectionCompleted) &&
    (updates.runScanCompleted || progress.runScanCompleted) &&
    (updates.reviewFindingsCompleted || progress.reviewFindingsCompleted) &&
    (updates.inviteTeamCompleted || progress.inviteTeamCompleted) &&
    (updates.setupComplianceCompleted || progress.setupComplianceCompleted);

  if (allStepsCompleted) {
    updates.completedAt = new Date();
  }

  await db
    .update(onboardingProgress)
    .set(updates)
    .where(eq(onboardingProgress.userId, userId));
}

export async function completeOnboarding(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({ onboardingCompleted: true })
    .where(eq(users.id, userId));

  await db
    .update(onboardingProgress)
    .set({ completedAt: new Date() })
    .where(eq(onboardingProgress.userId, userId));
}

// ============================================================================
// DASHBOARD (Optimized — avoids N+1 queries)
// ============================================================================

export async function getDashboardMetrics(userId: number) {
  const db = await getDb();
  if (!db) return { totalCollections: 0, totalFindings: 0, highestRiskScore: 0, teamMembers: 0 };

  const [collectionsResult, findingsResult, riskResult, teamResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(collections).where(eq(collections.userId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(findings).where(eq(findings.userId, userId)),
    db.select({ maxScore: sql<string>`MAX(riskScore)` }).from(scans).where(eq(scans.userId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(teamMembers).where(eq(teamMembers.userId, userId)),
  ]);

  return {
    totalCollections: Number(collectionsResult[0]?.count ?? 0),
    totalFindings: Number(findingsResult[0]?.count ?? 0),
    highestRiskScore: Math.round(parseFloat(riskResult[0]?.maxScore ?? "0")),
    teamMembers: Number(teamResult[0]?.count ?? 0),
  };
}

export async function getRecentScans(userId: number, limit: number = 5) {
  const db = await getDb();
  if (!db) return [];

  const recentScans = await db
    .select({
      id: scans.id,
      collectionId: scans.collectionId,
      collectionName: collections.name,
      scanType: scans.scanType,
      riskScore: scans.riskScore,
      riskLevel: scans.riskLevel,
      totalFindings: scans.totalFindings,
      createdAt: scans.createdAt,
    })
    .from(scans)
    .leftJoin(collections, eq(scans.collectionId, collections.id))
    .where(eq(scans.userId, userId))
    .orderBy(desc(scans.createdAt))
    .limit(limit);

  return recentScans.map(s => ({
    id: s.id,
    collectionName: s.collectionName ?? "Unknown",
    scanType: s.scanType,
    riskScore: parseFloat(s.riskScore as any),
    riskLevel: s.riskLevel,
    totalFindings: s.totalFindings,
    createdAt: s.createdAt,
  }));
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}
