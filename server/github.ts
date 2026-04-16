/**
 * GitHub Integration
 * Handles GitHub webhooks for push and pull request events
 * Triggers security scans on code changes
 */

import crypto from "crypto";
import * as db from "./db";
import { runCollectionScan } from "./services/scanService";
import { sendSlackScanAlert } from "./slack";

interface GitHubWebhookPayload {
  event: "push" | "pull_request";
  repository: {
    name: string;
    full_name: string;
    owner: {
      name: string;
    };
  };
  pusher?: {
    name: string;
    email: string;
  };
  ref?: string;
  after?: string;
  before?: string;
  commits?: Array<{
    id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
    };
  }>;
  pull_request?: {
    number: number;
    title: string;
    state: "open" | "closed" | "merged";
    head: {
      ref: string;
      sha: string;
      repo: {
        full_name: string;
      };
    };
  };
}

export function verifyGitHubWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!secret) {
    console.warn("[GitHub] Webhook secret not configured — skipping verification");
    return true; // Allow if no secret configured (dev mode)
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSignature = `sha256=${hmac.digest("hex")}`;

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}

export async function handleGitHubPush(payload: GitHubWebhookPayload): Promise<{
  status: string;
  repository: string;
  branch: string;
  commits: number;
  message: string;
  scansTriggered: number;
}> {
  const branch = payload.ref?.replace("refs/heads/", "") || "unknown";
  const commitCount = payload.commits?.length || 0;
  const commitSha = payload.after || "";

  console.log(`[GitHub] Push to ${payload.repository.full_name}:${branch} - ${commitCount} commits`);

  // Find collections linked to this repository
  const collections = await db.getCollectionsByRepoUrl(payload.repository.full_name);
  
  if (collections.length === 0) {
    console.log(`[GitHub] No collections found for repo ${payload.repository.full_name}`);
    return {
      status: "processed",
      repository: payload.repository.full_name,
      branch,
      commits: commitCount,
      message: `No collections linked to ${payload.repository.full_name}`,
      scansTriggered: 0,
    };
  }

  // Trigger scans for each matching collection
  let scansTriggered = 0;
  for (const collection of collections) {
    try {
      console.log(`[GitHub] Triggering scan for collection ${collection.id} (${collection.name})`);
      
      await runCollectionScan(collection.userId, collection.id, {
        scanType: "full",
        triggeredBy: "github_push",
        branch,
        commitSha,
      });
      
      scansTriggered++;
    } catch (error) {
      console.error(`[GitHub] Failed to trigger scan for collection ${collection.id}:`, error);
    }
  }

  return {
    status: "processed",
    repository: payload.repository.full_name,
    branch,
    commits: commitCount,
    message: `Triggered ${scansTriggered} scan(s) for ${collections.length} collection(s)`,
    scansTriggered,
  };
}

export async function handleGitHubPullRequest(payload: GitHubWebhookPayload): Promise<{
  status: string;
  repository: string;
  prNumber: number;
  title: string;
  state: string;
  message: string;
  scansTriggered: number;
}> {
  const pr = payload.pull_request!;

  console.log(
    `[GitHub] PR #${pr.number} in ${payload.repository.full_name}: ${pr.title} - ${pr.state}`
  );

  // Only scan on open or synchronize (new commits pushed)
  if (pr.state !== "open") {
    return {
      status: "skipped",
      repository: payload.repository.full_name,
      prNumber: pr.number,
      title: pr.title,
      state: pr.state,
      message: `PR #${pr.number} is ${pr.state}, no scan needed`,
      scansTriggered: 0,
    };
  }

  // Find collections linked to this repository
  const collections = await db.getCollectionsByRepoUrl(payload.repository.full_name);
  
  if (collections.length === 0) {
    console.log(`[GitHub] No collections found for repo ${payload.repository.full_name}`);
    return {
      status: "processed",
      repository: payload.repository.full_name,
      prNumber: pr.number,
      title: pr.title,
      state: pr.state,
      message: `No collections linked to ${payload.repository.full_name}`,
      scansTriggered: 0,
    };
  }

  // Trigger scans for each matching collection
  let scansTriggered = 0;
  for (const collection of collections) {
    try {
      console.log(`[GitHub] Triggering PR scan for collection ${collection.id} (${collection.name})`);
      
      await runCollectionScan(collection.userId, collection.id, {
        scanType: "quick", // Quick scan for PRs
        triggeredBy: "github_pr",
        prNumber: pr.number,
        branch: pr.head.ref,
        commitSha: pr.head.sha,
      });
      
      scansTriggered++;
    } catch (error) {
      console.error(`[GitHub] Failed to trigger PR scan for collection ${collection.id}:`, error);
    }
  }

  return {
    status: "processed",
    repository: payload.repository.full_name,
    prNumber: pr.number,
    title: pr.title,
    state: pr.state,
    message: `Triggered ${scansTriggered} PR scan(s) for ${collections.length} collection(s)`,
    scansTriggered,
  };
}
