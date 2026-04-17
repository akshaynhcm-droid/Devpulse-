import crypto from "crypto";
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
  subscriptions,
  payments,
  passwordResetTokens,
  userSessions,
  emailPreferences,
  auditLog,
  vscodeActivities,
  webhookEndpoints,
  webhookDeliveries,
  type WebhookEndpoint,
  type InsertWebhookEndpoint,
  type InsertWebhookDelivery,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { sendWelcomeEmail } from "./email";

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

export async function upsertUser(
  user: InsertUser
): Promise<{ isNew: boolean }> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return { isNew: false };
  }

  try {
    // Check if user exists to detect new signups
    const existingUser = await getUserByOpenId(user.openId);
    const isNewUser = !existingUser;

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

    // Send welcome email for new users
    if (isNewUser && user.email) {
      try {
        await sendWelcomeEmail({
          toEmail: user.email,
          userName: user.name || "",
        });
        console.log(`[User] Welcome email sent to ${user.email}`);
      } catch (emailError) {
        console.warn("[User] Failed to send welcome email:", emailError);
        // Don't fail user creation if email fails
      }
    }

    return { isNew: isNewUser };
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

// ──────────────────────────────────────────────────────────────────────────
// In-memory TTL cache for getUserById / getUserPlan.
//
// Every authenticated tRPC request goes through `protectedProcedure`, which
// re-reads the user record from MySQL. On a busy dashboard that's dozens of
// identical SELECTs per page view. The user row is small, bounded, and
// changes infrequently, so a 30-second in-memory cache gives us a visible
// latency win (MySQL round-trip + JSON serialize) at negligible staleness
// risk.
//
// Invalidated explicitly on writes (plan change, password update,
// upsertUser, etc.) via `invalidateUserCache` below.
//
// Bounded at 10k entries with a simple LRU-ish eviction — if we ever serve
// more than 10k concurrent users, Redis is already wired up and we should
// route through that instead.
// ──────────────────────────────────────────────────────────────────────────
const USER_CACHE_TTL_MS = 30_000;
const USER_CACHE_MAX = 10_000;
interface UserCacheEntry {
  expiresAt: number;
  value: any;
}
const userCache = new Map<number, UserCacheEntry>();

function userCacheGet(id: number): any | undefined {
  const entry = userCache.get(id);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    userCache.delete(id);
    return undefined;
  }
  return entry.value;
}

function userCacheSet(id: number, value: any): void {
  if (userCache.size >= USER_CACHE_MAX) {
    // Evict the oldest-inserted entry (Map preserves insertion order).
    const firstKey = userCache.keys().next().value;
    if (firstKey !== undefined) userCache.delete(firstKey);
  }
  userCache.set(id, { expiresAt: Date.now() + USER_CACHE_TTL_MS, value });
}

/**
 * Clear a user from the in-memory cache. Call this after any write that
 * mutates the user row (plan change, password update, lock, unlock, etc.).
 * No-op when the cache is cold — safe to call redundantly.
 *
 * Named distinctly from `_core/cache.ts`'s Redis-backed `invalidateUserCache`
 * (which clears dashboard/collection caches) so the two can coexist.
 */
export function invalidateUserRowCache(userId: number): void {
  userCache.delete(userId);
}

export async function getUserById(id: number) {
  const cached = userCacheGet(id);
  if (cached !== undefined) return cached;

  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const user = result.length > 0 ? result[0] : undefined;
  if (user) userCacheSet(id, user);
  return user;
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
  const totalRequests =
    format === "openapi"
      ? Object.keys(data.paths || {}).length
      : data.item?.length || 0;

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

/**
 * Get collections accessible to a user in their workspace.
 * Includes:
 * 1. Collections owned by the user
 * 2. Collections owned by workspace owners where user is an accepted team member
 */
export async function getWorkspaceCollections(
  userId: number,
  userEmail?: string
) {
  const db = await getDb();
  if (!db) return [];

  // Get collections owned by the user
  const ownCollections = await db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(desc(collections.createdAt));

  // If user has no email, return only own collections
  if (!userEmail) {
    return ownCollections;
  }

  // Get accepted team memberships for this user
  const memberships = await db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.memberEmail, userEmail),
        eq(teamMembers.status, "accepted")
      )
    );

  if (memberships.length === 0) {
    return ownCollections;
  }

  // Get owner user IDs from memberships
  const ownerIds = memberships.map(m => m.userId);

  // Get collections from workspace owners
  const sharedCollections = await db
    .select()
    .from(collections)
    .where(sql`${collections.userId} IN (${ownerIds.join(",")})`)
    .orderBy(desc(collections.createdAt));

  // Combine and deduplicate (in case user owns some and is also team member).
  // `isShared` is a view-level annotation, not a column — surface it via an
  // intersection type so callers can distinguish.
  type CollectionWithShared = (typeof ownCollections)[number] & {
    isShared?: boolean;
  };
  const allCollections: CollectionWithShared[] = [...ownCollections];
  const seenIds = new Set(ownCollections.map(c => c.id));

  for (const collection of sharedCollections) {
    if (!seenIds.has(collection.id)) {
      allCollections.push({ ...collection, isShared: true });
      seenIds.add(collection.id);
    }
  }

  return allCollections;
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

export async function getCollectionsByRepoUrl(repoUrl: string) {
  const db = await getDb();
  if (!db) return [];

  // Extract owner/repo from full URL or handle owner/repo format
  let repoName = repoUrl;
  if (repoUrl.includes("github.com")) {
    const match = repoUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
    if (match) {
      repoName = match[1].replace(/\.git$/, "");
    }
  }

  return await db
    .select()
    .from(collections)
    .where(eq(collections.githubRepo, repoName))
    .orderBy(desc(collections.createdAt));
}

export async function updateCollectionLastScannedAt(id: string) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(collections)
    .set({ lastScannedAt: new Date() })
    .where(eq(collections.id, id));
}

/**
 * Check if a user has access to a collection (as owner or team member)
 */
export async function hasCollectionAccess(
  collectionId: string,
  userId: number,
  userEmail?: string
): Promise<
  { access: true; role: string; collection: any } | { access: false }
> {
  const db = await getDb();
  if (!db) return { access: false };

  const collection = await getCollectionById(collectionId);
  if (!collection) return { access: false };

  // User is the owner
  if (collection.userId === userId) {
    return { access: true, role: "owner", collection };
  }

  // Check if user is an accepted team member of the owner
  if (userEmail) {
    const membership = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.userId, collection.userId),
          eq(teamMembers.memberEmail, userEmail),
          eq(teamMembers.status, "accepted")
        )
      )
      .limit(1);

    if (membership.length > 0) {
      return { access: true, role: membership[0].role, collection };
    }
  }

  return { access: false };
}

export async function deleteCollection(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Cascade delete all orphaned analytical data
  await db.delete(findings).where(eq(findings.collectionId, id));
  await db.delete(shadowAPIs).where(eq(shadowAPIs.collectionId, id));
  await db.delete(scans).where(eq(scans.collectionId, id));
  await db
    .delete(complianceReports)
    .where(eq(complianceReports.collectionId, id));

  // Finally, delete the collection itself
  await db.delete(collections).where(eq(collections.id, id));
}

// ============================================================================
// SCANS
// ============================================================================

export async function createScan(
  userId: number,
  collectionId: string,
  scanType: "full" | "quick" | "shadow_api" | "prompt_injection",
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

  const result = await db
    .select()
    .from(findings)
    .where(eq(findings.id, id))
    .limit(1);
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

  const result = await db
    .select()
    .from(shadowAPIs)
    .where(eq(shadowAPIs.id, id))
    .limit(1);
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

    const budgetLimit = parseFloat(ksSettings.budgetLimitUSD || "0");

    // Check for 80% budget warning
    if (budgetLimit > 0) {
      const percentUsed = (updatedSpend / budgetLimit) * 100;
      const wasBelow80 = (currentSpend / budgetLimit) * 100 < 80;
      const isNowAtOrAbove80 = percentUsed >= 80;

      // Send warning if we just crossed 80% and haven't sent warning in last 24 hours
      if (wasBelow80 && isNowAtOrAbove80 && percentUsed < 100) {
        const lastWarning = ksSettings.lastWarningSentAt;
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        if (!lastWarning || new Date(lastWarning) < oneDayAgo) {
          // Get user for email
          const user = await getUserById(userId);
          if (user?.email) {
            // Send budget warning email
            const { sendBudgetWarningEmail } = await import("./email");
            await sendBudgetWarningEmail({
              toEmail: user.email,
              userName: user.name || "",
              currentSpend: updatedSpend,
              budgetLimit,
              percentUsed,
              dashboardUrl: `${process.env.APP_URL || "http://localhost:3000"}/kill-switch`,
            });
          }

          // Send Slack warning
          const { sendSlackBudgetWarning } = await import("./slack");
          await sendSlackBudgetWarning({
            userId,
            userName: user?.name || "Unknown",
            currentSpend: updatedSpend,
            budgetLimit,
            percentUsed,
          });

          // Fire quota.warning webhook for any user-registered endpoints.
          // Dynamic import to avoid a db.ts → webhookDelivery → db.ts cycle.
          try {
            const { deliver } = await import("./services/webhookDelivery");
            await deliver(userId, "quota.warning", {
              currentSpend: updatedSpend,
              budgetLimit,
              percentUsed,
            });
          } catch (err) {
            console.warn("[BudgetWarning] webhook dispatch failed:", err);
          }

          // Update last warning timestamp
          await updateKillSwitchWarningSent(userId);
        }
      }

      // Auto-trigger kill switch if budget exceeded and not already active
      if (updatedSpend >= budgetLimit && !ksSettings.isActive) {
        await updateKillSwitchSettings(userId, undefined, true);
        await createKillSwitchEvent(
          userId,
          "auto_triggered",
          budgetLimit,
          updatedSpend,
          `Budget limit of $${budgetLimit.toFixed(2)} exceeded (current spend: $${updatedSpend.toFixed(2)})`
        );
        try {
          const { deliver } = await import("./services/webhookDelivery");
          await deliver(userId, "kill_switch.triggered", {
            budgetLimit,
            currentSpend: updatedSpend,
            reason: "budget_exceeded",
          });
        } catch (err) {
          console.warn("[KillSwitch] webhook dispatch failed:", err);
        }
      }
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
    if (budgetLimitUSD !== undefined)
      updates.budgetLimitUSD = budgetLimitUSD.toString();
    if (isActive !== undefined) updates.isActive = isActive;
    if (currentSpendUSD !== undefined)
      updates.currentSpendUSD = currentSpendUSD.toString();

    if (Object.keys(updates).length > 0) {
      await db
        .update(killSwitchSettings)
        .set(updates)
        .where(eq(killSwitchSettings.userId, userId));
    }
  }
}

export async function updateKillSwitchWarningSent(userId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(killSwitchSettings)
    .set({ lastWarningSentAt: new Date() })
    .where(eq(killSwitchSettings.userId, userId));
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

export async function getTeamMemberByEmail(
  userId: number,
  memberEmail: string
) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.memberEmail, memberEmail)
      )
    )
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
    .then(r => r[0]);
}

export async function updateOnboardingStep(
  userId: number,
  step:
    | "importCollection"
    | "runScan"
    | "reviewFindings"
    | "inviteTeam"
    | "setupCompliance"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updates: any = {};

  if (step === "importCollection") {
    updates.importCollectionCompleted = true;
    updates.currentStep = 2;
  }
  if (step === "runScan") {
    updates.runScanCompleted = true;
    updates.currentStep = 3;
  }
  if (step === "reviewFindings") {
    updates.reviewFindingsCompleted = true;
    updates.currentStep = 4;
  }
  if (step === "inviteTeam") {
    updates.inviteTeamCompleted = true;
    updates.currentStep = 5;
  }
  if (step === "setupCompliance") {
    updates.setupComplianceCompleted = true;
  }

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
  if (!db)
    return {
      totalCollections: 0,
      totalFindings: 0,
      highestRiskScore: 0,
      teamMembers: 0,
    };

  const [collectionsResult, findingsResult, riskResult, teamResult] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(collections)
        .where(eq(collections.userId, userId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(findings)
        .where(eq(findings.userId, userId)),
      db
        .select({ maxScore: sql<string>`MAX(riskScore)` })
        .from(scans)
        .where(eq(scans.userId, userId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(teamMembers)
        .where(eq(teamMembers.userId, userId)),
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
      plan: users.plan,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

// ============================================================================
// USER PLAN / SUBSCRIPTION
// ============================================================================

export async function updateUserPlan(
  userId: number,
  plan: "free" | "pro" | "enterprise"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(users).set({ plan }).where(eq(users.id, userId));
  invalidateUserRowCache(userId);
}

export async function getUserPlan(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) return "free";

  const result = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result.length > 0 ? result[0].plan : "free";
}

// ============================================================================
// TEAM INVITATION ACCEPT / REJECT
// ============================================================================

export async function acceptTeamInvitation(
  memberId: string,
  memberUserId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const member = await getTeamMemberById(memberId);
  if (!member) throw new Error("Invitation not found");
  if (member.status !== "pending")
    throw new Error("Invitation is no longer pending");

  await db
    .update(teamMembers)
    .set({ status: "accepted", memberUserId, acceptedAt: new Date() })
    .where(eq(teamMembers.id, memberId));
}

export async function rejectTeamInvitation(memberId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const member = await getTeamMemberById(memberId);
  if (!member) throw new Error("Invitation not found");
  if (member.status !== "pending")
    throw new Error("Invitation is no longer pending");

  await db
    .update(teamMembers)
    .set({ status: "rejected" })
    .where(eq(teamMembers.id, memberId));
}

export async function getPendingInvitationsForUser(email: string) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(teamMembers)
    .where(
      and(eq(teamMembers.memberEmail, email), eq(teamMembers.status, "pending"))
    )
    .orderBy(desc(teamMembers.invitedAt));
}

// ============================================================================
// COST ANOMALY DETECTION
// ============================================================================

export async function detectCostAnomaly(
  userId: number,
  threshold: number = 2.0
): Promise<{
  isAnomaly: boolean;
  currentCost: number;
  averageCost: number;
  standardDeviation: number;
}> {
  const usage = await getTokenUsageByUserId(userId, 30);

  if (usage.length < 5) {
    return {
      isAnomaly: false,
      currentCost: 0,
      averageCost: 0,
      standardDeviation: 0,
    };
  }

  const costs = usage.map(u => parseFloat(u.costUSD as any));
  const currentCost = costs[0] ?? 0;
  const averageCost = costs.reduce((a, b) => a + b, 0) / costs.length;
  const variance =
    costs.reduce((sum, c) => sum + Math.pow(c - averageCost, 2), 0) /
    costs.length;
  const standardDeviation = Math.sqrt(variance);

  const isAnomaly =
    standardDeviation > 0 &&
    currentCost > averageCost + threshold * standardDeviation;

  return { isAnomaly, currentCost, averageCost, standardDeviation };
}

// ============================================================================
// PASSWORD RESET TOKENS
// ============================================================================

export async function createPasswordResetToken(
  userId: number,
  token: string,
  expiresAt: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const id = `prt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(passwordResetTokens).values({
    id,
    userId,
    token,
    expiresAt,
  });
  return { id };
}

export async function getPasswordResetToken(token: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function markPasswordResetTokenUsed(tokenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, tokenId));
}

export async function cleanupExpiredPasswordResetTokens() {
  const db = await getDb();
  if (!db) return;

  await db
    .delete(passwordResetTokens)
    .where(sql`${passwordResetTokens.expiresAt} < NOW()`);
}

// ============================================================================
// USER SESSIONS
// ============================================================================

export async function createUserSession(
  userId: number,
  sessionToken: string,
  ipAddress: string | null,
  userAgent: string | null,
  expiresAt: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const id = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(userSessions).values({
    id,
    userId,
    sessionToken,
    ipAddress,
    userAgent,
    expiresAt,
  });
  return { id };
}

export async function getUserSessions(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.userId, userId),
        sql`${userSessions.expiresAt} > NOW()`,
        sql`${userSessions.revokedAt} IS NULL`
      )
    )
    .orderBy(desc(userSessions.createdAt));
}

export async function getUserSessionByToken(sessionToken: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.sessionToken, sessionToken),
        sql`${userSessions.expiresAt} > NOW()`,
        sql`${userSessions.revokedAt} IS NULL`
      )
    )
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function revokeUserSession(sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.id, sessionId));
}

export async function revokeAllUserSessions(
  userId: number,
  exceptSessionId?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [
    eq(userSessions.userId, userId),
    sql`${userSessions.revokedAt} IS NULL`,
  ];
  if (exceptSessionId) {
    conditions.push(sql`${userSessions.id} != ${exceptSessionId}`);
  }

  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(...conditions));
}

export async function updateSessionLastActive(sessionId: string) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(userSessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(userSessions.id, sessionId));
}

export async function cleanupExpiredUserSessions() {
  const db = await getDb();
  if (!db) return;

  await db.delete(userSessions).where(sql`${userSessions.expiresAt} < NOW()`);
}

// ============================================================================
// EMAIL PREFERENCES
// ============================================================================

export async function getOrCreateEmailPreferences(userId: number) {
  const db = await getDb();
  if (!db) {
    return {
      scanComplete: true,
      budgetAlerts: true,
      weeklyDigest: true,
      teamActivity: true,
      promotionalEmails: false,
    };
  }

  const result = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.userId, userId))
    .limit(1);

  if (result.length > 0) {
    return result[0];
  }

  // Create default preferences
  const id = `ep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(emailPreferences).values({
    id,
    userId,
    scanComplete: true,
    budgetAlerts: true,
    weeklyDigest: true,
    teamActivity: true,
    promotionalEmails: false,
  });

  return await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.id, id))
    .limit(1)
    .then(r => r[0]);
}

export async function updateEmailPreferences(
  userId: number,
  prefs: {
    scanComplete?: boolean;
    budgetAlerts?: boolean;
    weeklyDigest?: boolean;
    teamActivity?: boolean;
    promotionalEmails?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getOrCreateEmailPreferences(userId);

  await db
    .update(emailPreferences)
    .set({
      ...prefs,
      updatedAt: new Date(),
    })
    .where(eq(emailPreferences.userId, userId));

  return { success: true };
}

// ============================================================================
// AUDIT LOG
// ============================================================================

export async function createAuditLogEntry(
  userId: number,
  action: string,
  details?: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
) {
  const db = await getDb();
  if (!db) return;

  const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(auditLog).values({
    id,
    userId,
    action,
    details: details || null,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
  });
}

export async function getAuditLogForUser(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.userId, userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

// ============================================================================
// USER PROFILE MANAGEMENT
// ============================================================================

export async function updateUserProfile(
  userId: number,
  updates: {
    name?: string;
    email?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  invalidateUserRowCache(userId);
}

export async function updateUserPassword(
  userId: number,
  hashedPassword: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({
      passwordHash: hashedPassword,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  invalidateUserRowCache(userId);
}

/**
 * Create a new user that signed up via email + password (not OAuth).
 * The `openId` field is still used as the session subject for JWT auth,
 * so we generate a unique "local:" prefix to keep it distinct from
 * OAuth-synced users.
 */
export async function createLocalUser(data: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<{ id: number; openId: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const openId = `local:${crypto.randomBytes(24).toString("hex")}`;

  await db.insert(users).values({
    openId,
    email: data.email,
    name: data.name,
    loginMethod: "email",
    passwordHash: data.passwordHash,
    lastSignedIn: new Date(),
  });

  const created = await db
    .select({ id: users.id, openId: users.openId })
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  if (created.length === 0) {
    throw new Error("Failed to create user");
  }

  return created[0];
}

export async function incrementFailedLoginAttempts(
  userId: number,
  lockThreshold = 5,
  lockDurationMs = 15 * 60 * 1000
): Promise<{ attempts: number; lockedUntil: Date | null }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select({ attempts: users.failedLoginAttempts })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const attempts = (existing[0]?.attempts ?? 0) + 1;
  const lockedUntil =
    attempts >= lockThreshold ? new Date(Date.now() + lockDurationMs) : null;

  await db
    .update(users)
    .set({
      failedLoginAttempts: attempts,
      lockedUntil,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  invalidateUserRowCache(userId);

  return { attempts, lockedUntil };
}

export async function resetFailedLoginAttempts(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastSignedIn: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  invalidateUserRowCache(userId);
}

// ============================================================================
// ACCOUNT DELETION - CASCADE DELETE EVERYTHING
// ============================================================================

export async function deleteUserAccount(
  userId: number
): Promise<{ deleted: boolean; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    // Delete in order respecting foreign key relationships
    // 1. Delete audit logs
    await db.delete(auditLog).where(eq(auditLog.userId, userId));

    // 2. Delete password reset tokens
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));

    // 3. Delete user sessions
    await db.delete(userSessions).where(eq(userSessions.userId, userId));

    // 4. Delete email preferences
    await db
      .delete(emailPreferences)
      .where(eq(emailPreferences.userId, userId));

    // 5. Delete token usage
    await db.delete(tokenUsage).where(eq(tokenUsage.userId, userId));

    // 6. Delete kill switch events and settings
    await db
      .delete(killSwitchEvents)
      .where(eq(killSwitchEvents.userId, userId));
    await db
      .delete(killSwitchSettings)
      .where(eq(killSwitchSettings.userId, userId));

    // 7. Delete team memberships (both as owner and member)
    await db.delete(teamMembers).where(
      and(
        eq(teamMembers.userId, userId),
        sql`${teamMembers.memberUserId} IS NULL` // Only delete where they are the owner
      )
    );
    await db.delete(teamMembers).where(eq(teamMembers.memberUserId, userId));

    // 8. Delete onboarding progress
    await db
      .delete(onboardingProgress)
      .where(eq(onboardingProgress.userId, userId));

    // 9. Delete compliance reports
    await db
      .delete(complianceReports)
      .where(eq(complianceReports.userId, userId));

    // 10. Delete findings (need to get scan IDs first)
    const userScans = await db
      .select({ id: scans.id })
      .from(scans)
      .where(eq(scans.userId, userId));
    const scanIds = userScans.map(s => s.id);
    if (scanIds.length > 0) {
      await db
        .delete(findings)
        .where(sql`${findings.scanId} IN (${scanIds.join(",")})`);
      await db
        .delete(shadowAPIs)
        .where(sql`${shadowAPIs.scanId} IN (${scanIds.join(",")})`);
    }

    // 11. Delete scans
    await db.delete(scans).where(eq(scans.userId, userId));

    // 12. Delete collections
    await db.delete(collections).where(eq(collections.userId, userId));

    // 13. Delete subscriptions and payments
    await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
    await db.delete(payments).where(eq(payments.userId, userId));

    // 14. Finally delete the user
    await db.delete(users).where(eq(users.id, userId));

    return {
      deleted: true,
      message: "Account and all associated data deleted successfully",
    };
  } catch (error) {
    console.error("[Database] Account deletion failed:", error);
    throw error;
  }
}

// ============================================================================
// USER UTILITIES
// ============================================================================

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

export async function createSubscription(data: {
  id: string;
  userId: number;
  plan: string;
  razorpaySubscriptionId: string;
  razorpayCustomerId: string;
  status: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(subscriptions).values({
    id: data.id,
    userId: data.userId,
    plan: data.plan as "free" | "pro" | "enterprise",
    razorpaySubscriptionId: data.razorpaySubscriptionId,
    razorpayCustomerId: data.razorpayCustomerId,
    status: data.status as
      | "pending"
      | "active"
      | "past_due"
      | "cancelled"
      | "halted",
  });

  return data;
}

export async function getSubscriptionByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getSubscriptionByRazorpayId(razorpayId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.razorpaySubscriptionId, razorpayId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateSubscriptionStatus(
  id: string,
  status: string,
  cancelAtPeriodEnd: boolean = false
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(subscriptions)
    .set({
      status: status as any,
      cancelAtPeriodEnd,
      ...(status === "cancelled" ? { cancelledAt: new Date() } : {}),
    })
    .where(eq(subscriptions.id, id));
}

export async function updateUserSubscriptionId(
  userId: number,
  subscriptionId: string | null
) {
  // Subscription link is in subscriptions table
}

// ============================================================================
// PAYMENT MANAGEMENT
// ============================================================================

export async function getPaymentByRazorpayId(razorpayPaymentId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(payments)
    .where(eq(payments.razorpayPaymentId, razorpayPaymentId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createOrUpdatePayment(data: {
  id: string;
  userId: number;
  subscriptionId?: string;
  razorpayPaymentId: string;
  razorpayOrderId?: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
  description?: string;
  createdAt?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(payments)
    .where(eq(payments.razorpayPaymentId, data.razorpayPaymentId))
    .limit(1);

  if (existing.length > 0) {
    // Update existing
    await db
      .update(payments)
      .set({
        status: data.status as any,
        amount: data.amount.toString(),
        updatedAt: new Date(),
      })
      .where(eq(payments.id, existing[0].id));
    return existing[0];
  } else {
    // Create new
    await db.insert(payments).values({
      id: data.id,
      userId: data.userId,
      subscriptionId: data.subscriptionId || null,
      razorpayPaymentId: data.razorpayPaymentId,
      razorpayOrderId: data.razorpayOrderId || null,
      amount: data.amount.toString(),
      currency: data.currency,
      status: data.status as any,
      receipt: data.receipt || null,
      description: data.description || null,
      createdAt: data.createdAt || new Date(),
    });
    return data;
  }
}

export async function getPaymentsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt));
}

export async function updatePaymentRefundStatus(
  razorpayPaymentId: string,
  refundAmount: number,
  refundStatus: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(payments)
    .set({
      refundAmount: refundAmount.toString(),
      refundStatus: refundStatus as any,
      status: refundStatus === "full" ? "refunded" : "partially_refunded",
      updatedAt: new Date(),
    })
    .where(eq(payments.razorpayPaymentId, razorpayPaymentId));
}

// Alias so payments.ts can use the more natural `createPayment` name.
export const createPayment = createOrUpdatePayment;

// ============================================================================
// VS CODE EXTENSION HELPERS
// ============================================================================

export async function getUserByApiKey(apiKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.apiKey, apiKey))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserApiKey(userId: number, apiKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(users)
    .set({ apiKey, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function updateUser(
  userId: number,
  data: Partial<{
    name: string;
    apiKey: string | null;
    scansRemaining: number;
    onboardingCompleted: boolean;
    plan: "free" | "pro" | "enterprise";
    role: "user" | "editor" | "admin";
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function recordVSCodeActivity(
  userId: number,
  type: string,
  data: unknown,
  timestamp: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const id = `vsa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await db.insert(vscodeActivities).values({
    id,
    userId,
    type,
    data: data as any,
    timestamp,
  });
  return { id };
}

// Alias naming for the VS Code router.
export const getRecentScansForUser = getRecentScans;

export async function getOpenFindingsCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(findings)
    .where(and(eq(findings.userId, userId), eq(findings.status, "open")));
  return Number(result[0]?.count ?? 0);
}

// ============================================================================
// WEBHOOK ENDPOINTS (Phase 25 — lifecycle webhooks)
// ============================================================================

/**
 * Create a webhook endpoint registration. The raw secret is stored as-is
 * (not hashed) because we need to reproduce the HMAC signature to sign
 * outgoing deliveries. It is never returned in full from any query except
 * `getWebhookEndpointById`.
 */
export async function createWebhookEndpoint(
  input: InsertWebhookEndpoint
): Promise<{ id: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(webhookEndpoints).values(input);
  return { id: input.id };
}

export async function listWebhookEndpointsByUserId(
  userId: number
): Promise<WebhookEndpoint[]> {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.userId, userId))
    .orderBy(desc(webhookEndpoints.createdAt));
}

export async function getWebhookEndpointById(
  id: string
): Promise<WebhookEndpoint | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Return active endpoints for a user that subscribe to `event`. Filtering
 * the JSON `events` array happens in app code rather than MySQL because
 * drizzle's MySQL JSON filter story is still rough across versions.
 */
export async function getActiveWebhookEndpoints(
  userId: number,
  event: string
): Promise<WebhookEndpoint[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.userId, userId),
        eq(webhookEndpoints.isActive, true)
      )
    );
  return rows.filter(row => {
    const events = Array.isArray(row.events) ? row.events : [];
    return events.includes(event);
  });
}

export async function deleteWebhookEndpoint(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
}

export async function updateWebhookEndpointActive(
  id: string,
  isActive: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(webhookEndpoints)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(webhookEndpoints.id, id));
}

export async function recordWebhookSuccess(
  id: string,
  status: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(webhookEndpoints)
    .set({
      lastDeliveryAt: new Date(),
      lastStatus: status,
      consecutiveFailures: 0,
      updatedAt: new Date(),
    })
    .where(eq(webhookEndpoints.id, id));
}

/**
 * Increment failure counter, optionally auto-disabling after a threshold.
 * The dispatcher computes the new failure count and whether we've crossed
 * the disable threshold, so this function just applies the set.
 */
export async function recordWebhookFailure(
  id: string,
  status: number | null,
  autoDisable: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(webhookEndpoints)
    .set({
      lastDeliveryAt: new Date(),
      lastStatus: status,
      // Raw SQL increment to stay race-free with concurrent deliveries.
      consecutiveFailures: sql`${webhookEndpoints.consecutiveFailures} + 1`,
      isActive: autoDisable ? false : undefined,
      updatedAt: new Date(),
    })
    .where(eq(webhookEndpoints.id, id));
}

export async function createWebhookDelivery(
  input: InsertWebhookDelivery
): Promise<{ id: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(webhookDeliveries).values(input);
  return { id: input.id };
}

export async function listWebhookDeliveries(
  webhookId: string,
  limit = 50
) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

export async function getRecentFindingsForUser(userId: number, limit = 5) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: findings.id,
      title: findings.title,
      severity: findings.severity,
      status: findings.status,
      category: findings.category,
      collectionName: collections.name,
      userId: findings.userId,
    })
    .from(findings)
    .leftJoin(collections, eq(findings.collectionId, collections.id))
    .where(eq(findings.userId, userId))
    .orderBy(desc(findings.createdAt))
    .limit(limit);
  return rows.map(r => ({
    ...r,
    collectionName: r.collectionName ?? "Unknown",
  }));
}
