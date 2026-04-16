import * as db from "../db";
import { sendWeeklyDigestEmail } from "../email";

export async function runWeeklyDigest(): Promise<void> {
  console.log("[WeeklyDigest] Starting weekly digest job...");

  try {
    const users = await db.getAllUsers();
    console.log(`[WeeklyDigest] Processing ${users.length} users`);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    for (const user of users) {
      if (!user.email) continue;

      const userId = user.id;

      const scans = await db.getRecentScans(userId, 7);
      const recentScans = scans.filter(
        s => new Date(s.createdAt) >= oneWeekAgo
      );

      let totalFindings = 0;
      let criticalFindings = 0;

      for (const scan of recentScans) {
        const findings = await db.getFindingsByScanId(scan.id);
        totalFindings += findings.length;
        criticalFindings += findings.filter(
          f => f.severity === "Critical"
        ).length;
      }

      const weeklyScans = recentScans.length;
      const newFindings = totalFindings;
      const costTotal = 0;

      const collections = await db.getCollectionsByUserId(userId);
      const topCollection = collections[0]?.name || "N/A";

      const appUrl = process.env.APP_URL || "https://devpulse.app";

      await sendWeeklyDigestEmail({
        toEmail: user.email,
        userName: user.name || "",
        weeklyScans,
        newFindings,
        criticalFindings,
        totalCost: costTotal,
        topCollection,
        dashboardUrl: `${appUrl}/dashboard`,
      }).catch(err =>
        console.error(`[WeeklyDigest] Failed to send to ${user.email}:`, err)
      );
    }

    console.log("[WeeklyDigest] Weekly digest job completed");
  } catch (error) {
    console.error("[WeeklyDigest] Error running weekly digest:", error);
  }
}

export function scheduleWeeklyDigest(): void {
  const cronExpression = process.env.WEEKLY_DIGEST_CRON || "0 9 * * 1";

  console.log(`[WeeklyDigest] Scheduling weekly digest for ${cronExpression}`);

  try {
    const cron = require("node-cron");

    cron.schedule(cronExpression, async () => {
      await runWeeklyDigest();
    });

    console.log("[WeeklyDigest] Weekly digest scheduled successfully");
  } catch (error) {
    console.warn("[WeeklyDigest] node-cron not available, skipping schedule");
  }
}
