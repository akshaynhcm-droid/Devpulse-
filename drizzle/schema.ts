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
    role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
    onboardingCompleted: boolean("onboardingCompleted").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("email_idx").on(table.email),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("userId_idx").on(table.userId),
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
    scanType: mysqlEnum("scanType", ["full", "quick", "shadow_api"]).notNull(),
    status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).notNull(),
    riskScore: decimal("riskScore", { precision: 5, scale: 2 }).default("0"),
    riskLevel: mysqlEnum("riskLevel", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]).notNull(),
    totalFindings: int("totalFindings").default(0).notNull(),
    findingsData: json("findingsData"), // Store findings summary
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  (table) => ({
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
    severity: mysqlEnum("severity", ["Critical", "High", "Medium", "Low"]).notNull(),
    category: varchar("category", { length: 255 }),
    remediation: text("remediation"),
    status: mysqlEnum("status", ["open", "in-progress", "resolved"]).default("open").notNull(),
    cweId: varchar("cweId", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
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
    riskLevel: mysqlEnum("riskLevel", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]).notNull(),
    reason: text("reason"),
    recommendation: text("recommendation"),
    isDocumented: boolean("isDocumented").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
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
  (table) => ({
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
    eventType: mysqlEnum("eventType", ["budget_set", "triggered", "auto_triggered", "reset"]).notNull(),
    budgetLimit: decimal("budgetLimit", { precision: 10, scale: 2 }),
    currentSpend: decimal("currentSpend", { precision: 10, scale: 2 }),
    reason: text("reason"),
    details: json("details"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
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
    budgetLimitUSD: decimal("budgetLimitUSD", { precision: 10, scale: 2 }).default("100"),
    isActive: boolean("isActive").default(false).notNull(),
    currentSpendUSD: decimal("currentSpendUSD", { precision: 10, scale: 2 }).default("0"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
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
    reportType: mysqlEnum("reportType", ["pci_dss", "owasp", "custom"]).notNull(),
    complianceScore: decimal("complianceScore", { precision: 5, scale: 2 }).notNull(),
    totalRequirements: int("totalRequirements").notNull(),
    metRequirements: int("metRequirements").notNull(),
    requirementsData: json("requirementsData"), // Detailed requirement breakdown
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt"),
  },
  (table) => ({
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
    role: mysqlEnum("role", ["admin", "editor", "viewer"]).default("viewer").notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "rejected"]).default("pending").notNull(),
    invitedAt: timestamp("invitedAt").defaultNow().notNull(),
    acceptedAt: timestamp("acceptedAt"),
  },
  (table) => ({
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
    importCollectionCompleted: boolean("importCollectionCompleted").default(false).notNull(),
    runScanCompleted: boolean("runScanCompleted").default(false).notNull(),
    reviewFindingsCompleted: boolean("reviewFindingsCompleted").default(false).notNull(),
    inviteTeamCompleted: boolean("inviteTeamCompleted").default(false).notNull(),
    setupComplianceCompleted: boolean("setupComplianceCompleted").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  (table) => ({
    userIdIdx: index("userId_idx").on(table.userId),
  })
);

export type OnboardingProgress = typeof onboardingProgress.$inferSelect;
export type InsertOnboardingProgress = typeof onboardingProgress.$inferInsert;
