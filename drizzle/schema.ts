import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  decimal,
  boolean,
  index,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", ["user", "editor", "admin"])
      .default("user")
      .notNull(),
    plan: mysqlEnum("plan", ["free", "pro", "enterprise"])
      .default("free")
      .notNull(),
    passwordHash: varchar("passwordHash", { length: 512 }),
    apiKey: varchar("apiKey", { length: 64 }),
    scansRemaining: int("scansRemaining").default(10).notNull(),
    onboardingCompleted: boolean("onboardingCompleted")
      .default(false)
      .notNull(),
    failedLoginAttempts: int("failedLoginAttempts").default(0).notNull(),
    lockedUntil: timestamp("lockedUntil"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => ({
    emailIdx: index("email_idx").on(table.email),
    apiKeyIdx: index("apiKey_idx").on(table.apiKey),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * VS Code extension activity tracking.
 */
export const vscodeActivities = mysqlTable(
  "vscode_activities",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    data: json("data"),
    timestamp: timestamp("timestamp").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
    timestampIdx: index("timestamp_idx").on(table.timestamp),
  })
);

export type VscodeActivity = typeof vscodeActivities.$inferSelect;
export type InsertVscodeActivity = typeof vscodeActivities.$inferInsert;

/**
 * API Collections - stores imported Postman/OpenAPI collections
 */
export const collections = mysqlTable(
  "collections",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    format: mysqlEnum("format", ["postman", "openapi"]).notNull(),
    data: json("data").notNull(), // Store full collection JSON
    totalRequests: int("totalRequests").default(0).notNull(),
    githubRepo: varchar("githubRepo", { length: 255 }), // Link to GitHub repo (owner/repo format)
    lastScannedAt: timestamp("lastScannedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
    githubRepoIdx: index("githubRepo_idx").on(table.githubRepo),
  })
);

export type Collection = typeof collections.$inferSelect;
export type InsertCollection = typeof collections.$inferInsert;

/**
 * Security Scans - stores scan history and results
 */
export const scans = mysqlTable(
  "scans",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    collectionId: varchar("collectionId", { length: 64 }).notNull(),
    scanType: mysqlEnum("scanType", [
      "full",
      "quick",
      "shadow_api",
      "prompt_injection",
    ]).notNull(),
    status: mysqlEnum("status", [
      "pending",
      "running",
      "completed",
      "failed",
    ]).notNull(),
    riskScore: decimal("riskScore", { precision: 5, scale: 2 }).default("0"),
    riskLevel: mysqlEnum("riskLevel", [
      "LOW",
      "MEDIUM",
      "HIGH",
      "CRITICAL",
    ]).notNull(),
    totalFindings: int("totalFindings").default(0).notNull(),
    findingsData: json("findingsData"), // Store findings summary
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
    collectionIdIdx: index("collectionId_idx").on(table.collectionId),
  })
);

export type Scan = typeof scans.$inferSelect;
export type InsertScan = typeof scans.$inferInsert;

/**
 * Security Findings - individual vulnerabilities found in scans
 */
export const findings = mysqlTable(
  "findings",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    scanId: varchar("scanId", { length: 64 }).notNull(),
    collectionId: varchar("collectionId", { length: 64 }).notNull(),
    userId: int("userId").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    severity: mysqlEnum("severity", [
      "Critical",
      "High",
      "Medium",
      "Low",
    ]).notNull(),
    category: varchar("category", { length: 255 }),
    remediation: text("remediation"),
    status: mysqlEnum("status", ["open", "in-progress", "resolved"])
      .default("open")
      .notNull(),
    cweId: varchar("cweId", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    scanIdIdx: index("scanId_idx").on(table.scanId),
    collectionIdIdx: index("collectionId_idx").on(table.collectionId),
    userIdIdx: index("userId_idx").on(table.userId),
  })
);

export type Finding = typeof findings.$inferSelect;
export type InsertFinding = typeof findings.$inferInsert;

/**
 * Shadow APIs - undocumented endpoints detected in collections
 */
export const shadowAPIs = mysqlTable(
  "shadow_apis",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    scanId: varchar("scanId", { length: 64 }).notNull(),
    collectionId: varchar("collectionId", { length: 64 }).notNull(),
    userId: int("userId").notNull(),
    endpoint: varchar("endpoint", { length: 255 }).notNull(),
    method: varchar("method", { length: 16 }),
    file: varchar("file", { length: 255 }),
    line: int("line"),
    riskLevel: mysqlEnum("riskLevel", [
      "LOW",
      "MEDIUM",
      "HIGH",
      "CRITICAL",
    ]).notNull(),
    reason: text("reason"),
    recommendation: text("recommendation"),
    isDocumented: boolean("isDocumented").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    scanIdIdx: index("scanId_idx").on(table.scanId),
    collectionIdIdx: index("collectionId_idx").on(table.collectionId),
    userIdIdx: index("userId_idx").on(table.userId),
  })
);

export type ShadowAPI = typeof shadowAPIs.$inferSelect;
export type InsertShadowAPI = typeof shadowAPIs.$inferInsert;

/**
 * LLM Token Usage - tracks token consumption per model
 */
export const tokenUsage = mysqlTable(
  "token_usage",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    model: varchar("model", { length: 128 }).notNull(),
    promptTokens: int("promptTokens").default(0).notNull(),
    completionTokens: int("completionTokens").default(0).notNull(),
    thinkingTokens: int("thinkingTokens").default(0).notNull(),
    totalTokens: int("totalTokens").default(0).notNull(),
    costUSD: decimal("costUSD", { precision: 10, scale: 6 }).default("0"),
    date: timestamp("date").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
    modelIdx: index("model_idx").on(table.model),
    dateIdx: index("date_idx").on(table.date),
  })
);

export type TokenUsage = typeof tokenUsage.$inferSelect;
export type InsertTokenUsage = typeof tokenUsage.$inferInsert;

/**
 * Kill Switch Events - audit trail for kill switch triggers and budget management
 */
export const killSwitchEvents = mysqlTable(
  "kill_switch_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    eventType: mysqlEnum("eventType", [
      "budget_set",
      "triggered",
      "auto_triggered",
      "reset",
    ]).notNull(),
    budgetLimit: decimal("budgetLimit", { precision: 10, scale: 2 }),
    currentSpend: decimal("currentSpend", { precision: 10, scale: 2 }),
    reason: text("reason"),
    details: json("details"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
  })
);

export type KillSwitchEvent = typeof killSwitchEvents.$inferSelect;
export type InsertKillSwitchEvent = typeof killSwitchEvents.$inferInsert;

/**
 * Kill Switch Settings - current budget and status per user
 */
export const killSwitchSettings = mysqlTable(
  "kill_switch_settings",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().unique(),
    budgetLimitUSD: decimal("budgetLimitUSD", {
      precision: 10,
      scale: 2,
    }).default("100"),
    isActive: boolean("isActive").default(false).notNull(),
    currentSpendUSD: decimal("currentSpendUSD", {
      precision: 10,
      scale: 2,
    }).default("0"),
    lastWarningSentAt: timestamp("lastWarningSentAt"), // Track when 80% warning was last sent
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
  })
);

export type KillSwitchSettings = typeof killSwitchSettings.$inferSelect;
export type InsertKillSwitchSettings = typeof killSwitchSettings.$inferInsert;

/**
 * Compliance Reports - PCI DSS compliance assessment results
 */
export const complianceReports = mysqlTable(
  "compliance_reports",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    collectionId: varchar("collectionId", { length: 64 }).notNull(),
    reportType: mysqlEnum("reportType", [
      "pci_dss",
      "owasp",
      "custom",
    ]).notNull(),
    complianceScore: decimal("complianceScore", {
      precision: 5,
      scale: 2,
    }).notNull(),
    totalRequirements: int("totalRequirements").notNull(),
    metRequirements: int("metRequirements").notNull(),
    requirementsData: json("requirementsData"), // Detailed requirement breakdown
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt"),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
    collectionIdIdx: index("collectionId_idx").on(table.collectionId),
  })
);

export type ComplianceReport = typeof complianceReports.$inferSelect;
export type InsertComplianceReport = typeof complianceReports.$inferInsert;

/**
 * Team Members - users invited to collaborate on workspace
 */
export const teamMembers = mysqlTable(
  "team_members",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(), // Owner/inviter
    memberEmail: varchar("memberEmail", { length: 320 }).notNull(),
    memberUserId: int("memberUserId"), // Set when member accepts invitation
    role: mysqlEnum("role", ["admin", "editor", "viewer"])
      .default("viewer")
      .notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "rejected"])
      .default("pending")
      .notNull(),
    invitedAt: timestamp("invitedAt").defaultNow().notNull(),
    acceptedAt: timestamp("acceptedAt"),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
    memberEmailIdx: index("memberEmail_idx").on(table.memberEmail),
  })
);

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

/**
 * Onboarding Progress - tracks user progress through onboarding wizard
 */
export const onboardingProgress = mysqlTable(
  "onboarding_progress",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().unique(),
    currentStep: int("currentStep").default(1).notNull(), // 1-5
    importCollectionCompleted: boolean("importCollectionCompleted")
      .default(false)
      .notNull(),
    runScanCompleted: boolean("runScanCompleted").default(false).notNull(),
    reviewFindingsCompleted: boolean("reviewFindingsCompleted")
      .default(false)
      .notNull(),
    inviteTeamCompleted: boolean("inviteTeamCompleted")
      .default(false)
      .notNull(),
    setupComplianceCompleted: boolean("setupComplianceCompleted")
      .default(false)
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
  })
);

export type OnboardingProgress = typeof onboardingProgress.$inferSelect;
export type InsertOnboardingProgress = typeof onboardingProgress.$inferInsert;

/**
 * Subscriptions - Razorpay subscription management
 */
export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().unique(),
    plan: mysqlEnum("plan", ["free", "pro", "enterprise"])
      .default("free")
      .notNull(),
    razorpaySubscriptionId: varchar("razorpaySubscriptionId", {
      length: 255,
    }).unique(),
    razorpayCustomerId: varchar("razorpayCustomerId", { length: 255 }),
    status: mysqlEnum("status", [
      "active",
      "paused",
      "cancelled",
      "past_due",
      "pending",
      "halted",
    ])
      .default("pending")
      .notNull(),
    currentPeriodStart: timestamp("currentPeriodStart"),
    currentPeriodEnd: timestamp("currentPeriodEnd"),
    cancelledAt: timestamp("cancelledAt"),
    cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
    razorpaySubscriptionIdIdx: index("razorpaySubscriptionId_idx").on(
      table.razorpaySubscriptionId
    ),
    statusIdx: index("status_idx").on(table.status),
    currentPeriodEndIdx: index("currentPeriodEnd_idx").on(
      table.currentPeriodEnd
    ),
  })
);

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * Payments - Razorpay payment records and invoices
 */
export const payments = mysqlTable(
  "payments",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    subscriptionId: varchar("subscriptionId", { length: 64 }),
    razorpayPaymentId: varchar("razorpayPaymentId", { length: 255 })
      .notNull()
      .unique(),
    razorpayOrderId: varchar("razorpayOrderId", { length: 255 }),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("INR").notNull(),
    status: mysqlEnum("status", [
      "created",
      "authorized",
      "captured",
      "failed",
      "refunded",
      "partially_refunded",
    ])
      .default("created")
      .notNull(),
    receipt: varchar("receipt", { length: 255 }),
    description: text("description"),
    metadata: json("metadata"),
    refundAmount: decimal("refundAmount", { precision: 10, scale: 2 }).default(
      "0"
    ),
    refundStatus: mysqlEnum("refundStatus", [
      "null",
      "partial",
      "full",
    ]).default("null"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
    subscriptionIdIdx: index("subscriptionId_idx").on(table.subscriptionId),
    razorpayPaymentIdIdx: index("razorpayPaymentId_idx").on(
      table.razorpayPaymentId
    ),
    statusIdx: index("status_idx").on(table.status),
    createdAtIdx: index("createdAt_idx").on(table.createdAt),
  })
);

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

/**
 * Password Reset Tokens - secure tokens for password reset flow
 */
export const passwordResetTokens = mysqlTable(
  "password_reset_tokens",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
    tokenIdx: index("token_idx").on(table.token),
    expiresAtIdx: index("expiresAt_idx").on(table.expiresAt),
  })
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

/**
 * User Sessions - track active sessions for session management
 */
export const userSessions = mysqlTable(
  "user_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    sessionToken: varchar("sessionToken", { length: 255 }).notNull().unique(),
    ipAddress: varchar("ipAddress", { length: 45 }),
    userAgent: text("userAgent"),
    lastActiveAt: timestamp("lastActiveAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
    sessionTokenIdx: index("sessionToken_idx").on(table.sessionToken),
    expiresAtIdx: index("expiresAt_idx").on(table.expiresAt),
  })
);

export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = typeof userSessions.$inferInsert;

/**
 * Email Preferences - user notification settings
 */
export const emailPreferences = mysqlTable(
  "email_preferences",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().unique(),
    unsubscribeToken: varchar("unsubscribeToken", { length: 64 }).unique(),
    scanComplete: boolean("scanComplete").default(true).notNull(),
    budgetAlerts: boolean("budgetAlerts").default(true).notNull(),
    weeklyDigest: boolean("weeklyDigest").default(true).notNull(),
    teamActivity: boolean("teamActivity").default(true).notNull(),
    promotionalEmails: boolean("promotionalEmails").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
  })
);

export type EmailPreference = typeof emailPreferences.$inferSelect;
export type InsertEmailPreference = typeof emailPreferences.$inferInsert;

/**
 * Audit Log - track important user actions for security
 */
export const auditLog = mysqlTable(
  "audit_log",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    action: varchar("action", { length: 128 }).notNull(), // password_changed, email_changed, account_deleted, etc.
    details: json("details"),
    ipAddress: varchar("ipAddress", { length: 45 }),
    userAgent: text("userAgent"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
    actionIdx: index("action_idx").on(table.action),
    createdAtIdx: index("createdAt_idx").on(table.createdAt),
  })
);

export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = typeof auditLog.$inferInsert;

/**
 * Lifecycle Webhooks - user-registered HTTP endpoints that DevPulse calls
 * when events fire (scan.complete, finding.discovered, quota.warning,
 * kill_switch.triggered). Generalises what the hard-coded Slack integration
 * already does. Each delivery is signed with an HMAC-SHA256 digest of the
 * body using the per-endpoint `secret`, same shape Razorpay / Stripe use.
 */
export const webhookEndpoints = mysqlTable(
  "webhook_endpoints",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    url: varchar("url", { length: 1024 }).notNull(),
    // 32-byte random secret, base64-encoded (length 44). Never exposed
    // after creation except in masked form.
    secret: varchar("secret", { length: 128 }).notNull(),
    // Array of event names this endpoint subscribes to. JSON for easy
    // multi-event subscription without a join table.
    events: json("events").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    lastDeliveryAt: timestamp("lastDeliveryAt"),
    lastStatus: int("lastStatus"),
    // Incremented each failed delivery, reset on success. We auto-disable
    // an endpoint once this reaches 20 (~a day of retries) to avoid
    // hammering dead receivers.
    consecutiveFailures: int("consecutiveFailures").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userIdIdx: index("userId_idx").on(table.userId),
  })
);

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type InsertWebhookEndpoint = typeof webhookEndpoints.$inferInsert;

/**
 * Webhook Deliveries - audit trail of every webhook fire. Kept in-table
 * (rather than just logs) so users can inspect history and retry failed
 * ones from the dashboard.
 */
export const webhookDeliveries = mysqlTable(
  "webhook_deliveries",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    webhookId: varchar("webhookId", { length: 64 }).notNull(),
    event: varchar("event", { length: 64 }).notNull(),
    payload: json("payload").notNull(),
    status: int("status"),
    responseBody: text("responseBody"),
    errorMessage: text("errorMessage"),
    deliveredAt: timestamp("deliveredAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    webhookIdIdx: index("webhookId_idx").on(table.webhookId),
    createdAtIdx: index("createdAt_idx").on(table.createdAt),
  })
);

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = typeof webhookDeliveries.$inferInsert;
