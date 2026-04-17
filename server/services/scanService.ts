/**
 * Scan Service - Reusable scan logic for collections
 * Can be called from scanning router or GitHub webhooks
 */

import * as db from "../db";
import {
  generateRealFindings,
  calculateRiskScore,
  getRiskLevel,
} from "../utils/scanning";
import { sendScanCompleteEmail } from "../email";
import { sendSlackScanAlert } from "../slack";

export interface ScanResult {
  scanId: string;
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  totalFindings: number;
  findings: Array<{
    id: string;
    title: string;
    severity: "Critical" | "High" | "Medium" | "Low";
    description: string;
    category: string;
    remediation: string;
    cweId: string;
  }>;
}

export interface ScanOptions {
  scanType: "full" | "quick" | "shadow_api";
  triggeredBy?: "user" | "github_push" | "github_pr";
  prNumber?: number;
  branch?: string;
  commitSha?: string;
}

/**
 * Run a security scan on a collection
 * This function can be called from the API or from GitHub webhooks
 */
export async function runCollectionScan(
  userId: number,
  collectionId: string,
  options: ScanOptions
): Promise<ScanResult> {
  const collection = await db.getCollectionById(collectionId);
  if (!collection) {
    throw new Error("Collection not found");
  }

  // Generate findings
  const findings = generateRealFindings(collection.data);
  const riskScore = calculateRiskScore(findings);
  const riskLevel = getRiskLevel(riskScore);

  // Create scan record
  const scan = await db.createScan(
    userId,
    collectionId,
    options.scanType,
    "completed",
    riskScore,
    riskLevel,
    findings.length,
    findings
  );

  // Save individual findings
  for (const finding of findings) {
    await db.createFinding(
      scan.id,
      collectionId,
      userId,
      finding.title,
      finding.severity,
      finding.description,
      finding.category,
      finding.remediation,
      finding.cweId
    );
  }

  // Update last scanned timestamp
  await db.updateCollectionLastScannedAt(collectionId);

  // Get user for notifications
  const user = await db.getUserById(userId);

  // Count findings by severity
  const criticalCount = findings.filter(f => f.severity === "Critical").length;
  const highCount = findings.filter(f => f.severity === "High").length;
  const mediumCount = findings.filter(f => f.severity === "Medium").length;
  const lowCount = findings.filter(f => f.severity === "Low").length;

  // Send email notification if user has email
  if (user?.email) {
    try {
      await sendScanCompleteEmail({
        toEmail: user.email,
        userName: user.name || "",
        collectionName: collection.name,
        scanDate: new Date().toISOString(),
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        dashboardUrl: `${process.env.APP_URL || "http://localhost:3000"}/collections/${collectionId}`,
      });
    } catch (error) {
      console.warn(
        "[ScanService] Failed to send scan completion email:",
        error
      );
    }
  }

  // Send Slack notification
  try {
    await sendSlackScanAlert({
      userId,
      userName: user?.name || "Unknown",
      collectionName: collection.name,
      scanId: scan.id,
      totalFindings: findings.length,
      criticalCount,
      highCount,
      triggeredBy: options.triggeredBy || "user",
      prNumber: options.prNumber,
      branch: options.branch,
    });
  } catch (error) {
    console.warn("[ScanService] Failed to send Slack notification:", error);
  }

  return {
    scanId: scan.id,
    riskScore,
    riskLevel,
    totalFindings: findings.length,
    findings,
  };
}
