/**
 * Lifecycle webhooks — tRPC router.
 *
 * Phase 25 feature. Lets users register HTTP endpoints that DevPulse will
 * call (with HMAC-signed bodies) when lifecycle events happen:
 *   - scan.complete
 *   - scan.started
 *   - finding.discovered      (fires for Critical & High findings)
 *   - quota.warning           (approaching monthly budget limit)
 *   - kill_switch.triggered   (budget exceeded, API shut down)
 *   - subscription.updated    (plan change)
 *
 * This generalises the hard-coded Slack integration. The Slack code path
 * stays — webhooks are *additive*, not a replacement, to avoid breaking
 * existing customers.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { nanoid } from "nanoid";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { deliver, buildSignature, type WebhookEvent } from "../services/webhookDelivery";

const SUPPORTED_EVENTS = [
  "scan.complete",
  "scan.started",
  "finding.discovered",
  "quota.warning",
  "kill_switch.triggered",
  "subscription.updated",
] as const;

const eventSchema = z.enum(SUPPORTED_EVENTS);

/**
 * Only show the last 4 chars of the secret — receivers that lose it must
 * rotate. Same UX Stripe / GitHub use.
 */
function maskSecret(secret: string): string {
  if (secret.length <= 4) return "•".repeat(secret.length);
  return `${"•".repeat(Math.max(8, secret.length - 4))}${secret.slice(-4)}`;
}

function generateSecret(): string {
  // 32 bytes → 44 chars base64. Fits within the 128-varchar column.
  return crypto.randomBytes(32).toString("base64");
}

export const webhooksRouter = router({
  /**
   * List webhook events the server supports. Useful for dashboard UIs
   * so they don't hard-code the list.
   */
  listSupportedEvents: protectedProcedure.query(() => {
    return {
      events: SUPPORTED_EVENTS.map(e => ({
        name: e,
        description: describeEvent(e),
      })),
    };
  }),

  /**
   * Create a new webhook endpoint. Returns the full secret exactly once;
   * subsequent list calls show only the masked form.
   */
  register: protectedProcedure
    .input(
      z.object({
        url: z.string().url().max(1024),
        events: z.array(eventSchema).min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Sanity: refuse obvious localhost / private-IP URLs in production so
      // a compromised account can't use the webhook system as an SSRF
      // pivot. We still allow them in dev for local testing.
      if (process.env.NODE_ENV === "production") {
        const parsed = new URL(input.url);
        if (
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname.endsWith(".local") ||
          /^10\./.test(parsed.hostname) ||
          /^192\.168\./.test(parsed.hostname) ||
          /^169\.254\./.test(parsed.hostname) ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(parsed.hostname)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Webhook URL may not target localhost or a private network address.",
          });
        }
        if (parsed.protocol !== "https:") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Webhook URLs must use HTTPS in production.",
          });
        }
      }

      const id = `wh_${nanoid(24)}`;
      const secret = generateSecret();

      await db.createWebhookEndpoint({
        id,
        userId: ctx.user.id,
        url: input.url,
        secret,
        events: input.events as unknown as object,
        isActive: true,
      });

      return {
        id,
        url: input.url,
        events: input.events,
        // Only returned here — NEVER on subsequent reads.
        secret,
        message:
          "Save this secret now — it will not be shown again. Use it to verify the X-DevPulse-Signature-256 header on incoming deliveries.",
      };
    }),

  /**
   * List the caller's webhook endpoints. Secrets are masked.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.listWebhookEndpointsByUserId(ctx.user.id);
    return rows.map(row => ({
      id: row.id,
      url: row.url,
      events: Array.isArray(row.events) ? row.events : [],
      secretMasked: maskSecret(row.secret),
      isActive: row.isActive,
      lastDeliveryAt: row.lastDeliveryAt,
      lastStatus: row.lastStatus,
      consecutiveFailures: row.consecutiveFailures,
      createdAt: row.createdAt,
    }));
  }),

  /**
   * Toggle an endpoint active/inactive. Useful for pausing noisy webhooks
   * during an incident without losing the configuration.
   */
  setActive: protectedProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getWebhookEndpointById(input.id);
      if (!existing || existing.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook endpoint not found",
        });
      }
      await db.updateWebhookEndpointActive(input.id, input.isActive);
      return { success: true };
    }),

  /**
   * Delete an endpoint (and its delivery history via CASCADE-equivalent
   * cleanup if we ever add one — for now, deliveries are kept for audit).
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getWebhookEndpointById(input.id);
      if (!existing || existing.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook endpoint not found",
        });
      }
      await db.deleteWebhookEndpoint(input.id);
      return { success: true };
    }),

  /**
   * Fire a synthetic event at the endpoint so users can verify their
   * receiver before relying on it in production. The payload is clearly
   * marked as a test event.
   */
  test: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const endpoint = await db.getWebhookEndpointById(input.id);
      if (!endpoint || endpoint.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook endpoint not found",
        });
      }

      // Use the first event the endpoint subscribes to so we don't fire
      // for a type it filters out.
      const events = Array.isArray(endpoint.events) ? endpoint.events : [];
      const event = (events[0] ?? "scan.complete") as WebhookEvent;

      const results = await deliver(ctx.user.id, event, {
        test: true,
        message: "This is a test delivery from DevPulse.",
        endpointId: endpoint.id,
        triggeredBy: ctx.user.id,
      });

      return {
        delivered: results.length,
        results: results.map(r => ({
          status: r.status,
          httpStatus: r.httpStatus,
          error: r.error,
        })),
      };
    }),

  /**
   * Inspect recent delivery attempts for an endpoint (success or failure).
   * Most recent first, capped at 50.
   */
  listDeliveries: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const endpoint = await db.getWebhookEndpointById(input.id);
      if (!endpoint || endpoint.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook endpoint not found",
        });
      }
      const rows = await db.listWebhookDeliveries(input.id, 50);
      return rows.map(row => ({
        id: row.id,
        event: row.event,
        status: row.status,
        errorMessage: row.errorMessage,
        deliveredAt: row.deliveredAt,
        createdAt: row.createdAt,
      }));
    }),

  /**
   * Helper: compute the signature the server would send for a given body.
   * Used by customer integration tests (rare, but saves a support ticket).
   */
  computeSignature: protectedProcedure
    .input(z.object({ id: z.string(), body: z.string().max(65_536) }))
    .query(async ({ input, ctx }) => {
      const endpoint = await db.getWebhookEndpointById(input.id);
      if (!endpoint || endpoint.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook endpoint not found",
        });
      }
      return { signature: buildSignature(input.body, endpoint.secret) };
    }),
});

function describeEvent(event: (typeof SUPPORTED_EVENTS)[number]): string {
  switch (event) {
    case "scan.complete":
      return "Fires after every completed scan. Payload: scanId, riskLevel, totalFindings, summary.";
    case "scan.started":
      return "Fires when a scan begins. Useful to correlate with scan.complete.";
    case "finding.discovered":
      return "Fires for every new Critical or High severity finding (does not fire for existing findings).";
    case "quota.warning":
      return "Fires when LLM/API spend reaches 80% of the configured monthly limit.";
    case "kill_switch.triggered":
      return "Fires when DevPulse shuts off LLM traffic due to exceeding the budget.";
    case "subscription.updated":
      return "Fires when the user's plan changes (upgrade, downgrade, cancellation).";
  }
}
