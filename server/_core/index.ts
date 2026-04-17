import "dotenv/config";
import * as Sentry from "@sentry/node";
import express from "express";
import { createServer } from "http";
import net from "net";
import crypto from "crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import compression from "compression";
import multer from "multer";
import { registerOAuthRoutes } from "./oauth";
import { registerGoogleOAuthRoutes } from "./googleOAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { wsManager } from "../websocket";
import {
  handleGitHubPush,
  handleGitHubPullRequest,
  verifyGitHubWebhook,
} from "../github";
import { scheduleWeeklyDigest } from "../jobs/weeklyDigest";
import { verifyWebhookSignature } from "../utils/security";

// ============================================================================
// STARTUP VALIDATION — fail fast if critical config is missing
// ============================================================================

function validateEnvironment() {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!ENV.cookieSecret || ENV.cookieSecret.length < 32) {
    errors.push(
      "JWT_SECRET is missing or too short (must be at least 32 characters). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    );
  }

  if (ENV.isProduction) {
    if (!ENV.databaseUrl) {
      errors.push("DATABASE_URL is required in production mode.");
    }
    if (!ENV.oAuthServerUrl) {
      errors.push("OAUTH_SERVER_URL is required in production mode.");
    }
    if (!ENV.appId) {
      errors.push("VITE_APP_ID is required in production mode.");
    }
    if (!ENV.razorpayKeyId) {
      errors.push(
        "RAZORPAY_KEY_ID is required in production mode for payments."
      );
    }
    if (!ENV.razorpayKeySecret) {
      errors.push(
        "RAZORPAY_KEY_SECRET is required in production mode for payments."
      );
    }
    if (!ENV.razorpayWebhookSecret) {
      errors.push(
        "RAZORPAY_WEBHOOK_SECRET is required in production mode for webhook verification."
      );
    }
    if (!ENV.googleClientId) {
      errors.push(
        "GOOGLE_CLIENT_ID is required in production mode for OAuth login."
      );
    }
    if (!ENV.googleClientSecret) {
      errors.push(
        "GOOGLE_CLIENT_SECRET is required in production mode for OAuth login."
      );
    }
  }

  // Non-critical warnings
  if (!ENV.razorpayKeyId)
    warnings.push("RAZORPAY_KEY_ID not set — payment features disabled");
  if (!ENV.smtpHost)
    warnings.push("SMTP_HOST not set — email features (team invites) disabled");
  if (!ENV.slackWebhookUrl)
    warnings.push("SLACK_WEBHOOK_URL not set — Slack alerts disabled");
  if (!ENV.sentryDsn)
    warnings.push("SENTRY_DSN not set — error monitoring disabled");

  if (warnings.length > 0) {
    warnings.forEach(w => console.warn(`[Config] ⚠ ${w}`));
  }

  if (errors.length > 0) {
    console.error("\n❌ SERVER STARTUP FAILED — Configuration errors:\n");
    errors.forEach(err => console.error(`  • ${err}`));
    console.error(
      "\nPlease fix these issues in your .env file (see .env.example for reference).\n"
    );
    process.exit(1);
  }

  console.log("[Config] Environment validated successfully.");
}

// ============================================================================
// PORT DISCOVERY
// ============================================================================

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// ============================================================================
// SERVER BOOTSTRAP
// ============================================================================

// ============================================================================
// SENTRY PII SCRUBBING
// ============================================================================

/**
 * Field names that should never leave the process in plain text. The list is
 * intentionally small — bloating it has a cost (false positives make real
 * debugging harder). Extend carefully.
 */
const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "newpassword",
  "oldpassword",
  "passwordhash",
  "apikey",
  "api_key",
  "secret",
  "token",
  "refresh_token",
  "access_token",
  "sessiontoken",
  "x-razorpay-signature",
  "x-devpulse-signature-256",
  "stripe-signature",
]);

function scrubValue(value: unknown): unknown {
  if (typeof value === "string" && value.length > 0) return "[REDACTED]";
  return null;
}

function scrubObject(input: unknown, depth = 0): unknown {
  if (depth > 6 || input == null) return input;
  if (Array.isArray(input)) {
    return input.map(v => scrubObject(v, depth + 1));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = scrubValue(v);
      } else {
        out[k] = scrubObject(v, depth + 1);
      }
    }
    return out;
  }
  return input;
}

function scrubSentryEvent(event: Sentry.Event): void {
  if (event.request) {
    event.request.headers = scrubObject(event.request.headers) as typeof event.request.headers;
    event.request.cookies = scrubObject(event.request.cookies) as typeof event.request.cookies;
    event.request.data = scrubObject(event.request.data);
    // Strip query-string values that match SENSITIVE_KEYS.
    if (typeof event.request.query_string === "string") {
      event.request.query_string = event.request.query_string.replace(
        /([^=&?]+)=([^&]+)/g,
        (match, rawKey) =>
          SENSITIVE_KEYS.has(String(rawKey).toLowerCase())
            ? `${rawKey}=[REDACTED]`
            : match
      );
    }
  }
  if (event.extra) {
    event.extra = scrubObject(event.extra) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = scrubObject(event.contexts) as typeof event.contexts;
  }
}

async function startServer() {
  // Validate config before starting anything
  validateEnvironment();

  if (ENV.sentryDsn) {
    Sentry.init({
      dsn: ENV.sentryDsn,
      environment: ENV.isProduction ? "production" : "development",
      // Lower than 100% in production to keep the monthly quota sane on
      // bursty traffic; sampled at the ingest layer, so traces still have
      // enough signal for debugging.
      tracesSampleRate: ENV.isProduction ? 0.1 : 1.0,
      // Strip obvious PII before sending events upstream. Sentry's default
      // "sendDefaultPii: false" would already drop IP + session cookies,
      // but this is an extra belt-and-braces pass for fields that slip
      // through (Authorization headers, secrets in querystrings, etc.).
      beforeSend(event) {
        scrubSentryEvent(event);
        return event;
      },
      beforeSendTransaction(event) {
        scrubSentryEvent(event);
        return event;
      },
    });
    console.log("[Sentry] Initialized automatically.");
  }

  const app = express();
  const server = createServer(app);

  // ── Trust the first hop reverse proxy in production ──────────────────────
  // Rate-limiting and cookie security flags depend on the real client IP,
  // not the proxy's IP. Setting `trust proxy = 1` tells Express to read
  // `X-Forwarded-For` for one hop (Railway, Cloudflare Tunnel, Fly's proxy,
  // etc.). Setting it higher would let spoofed `X-Forwarded-For` headers
  // bypass our rate limits, so we keep it tight.
  if (ENV.isProduction) {
    app.set("trust proxy", 1);
  }

  // ── Remove the default `X-Powered-By: Express` fingerprint header ────────
  // No functional purpose, just tells attackers exactly what stack to target.
  app.disable("x-powered-by");

  // ── Security headers (helmet.js) ───────────────────────────────────────────
  // Generate nonce for inline scripts
  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString("hex");
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: ENV.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: [
                "'self'",
                (_req: unknown, res: unknown) =>
                  `'nonce-${(res as { locals: { cspNonce: string } }).locals.cspNonce}'`,
              ],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "blob:", "https:"],
              connectSrc: ["'self'", "ws:", "wss:"],
              fontSrc: ["'self'", "data:"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'"],
              frameSrc: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      frameguard: ENV.isProduction ? { action: "sameorigin" } : false,
      hsts: ENV.isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
      // Modern isolation headers. Prevents our origin from being
      // coerced into cross-origin popup attacks and leaks timing info
      // across origins. Helmet disables these by default because they
      // can break third-party embeds — we don't embed so it's safe.
      crossOriginEmbedderPolicy: ENV.isProduction
        ? { policy: "require-corp" }
        : false,
      crossOriginOpenerPolicy: ENV.isProduction
        ? { policy: "same-origin" }
        : false,
      crossOriginResourcePolicy: ENV.isProduction
        ? { policy: "same-site" }
        : false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
  );

  // ── Permissions-Policy (browser feature lockdown) ─────────────────────────
  // Tells browsers to never grant our pages dangerous capabilities (camera,
  // mic, geolocation, payments API, etc.) even if something injected tries
  // to use them. This is a defense-in-depth layer on top of CSP.
  if (ENV.isProduction) {
    app.use((_req, res, next) => {
      res.setHeader(
        "Permissions-Policy",
        [
          "accelerometer=()",
          "camera=()",
          "geolocation=()",
          "gyroscope=()",
          "magnetometer=()",
          "microphone=()",
          "payment=()",
          "usb=()",
          "interest-cohort=()", // Disable FLoC / Topics API tracking
        ].join(", ")
      );
      // Make sure caches + CDN intermediaries can't serve authenticated
      // tRPC responses to unauthenticated callers.
      res.setHeader("Vary", "Cookie, Authorization, Origin");
      next();
    });
  }

  // ── Response compression (gzip + brotli when supported by the client) ─────
  // Skip compression for tiny responses and for SSE/streaming endpoints so
  // we don't introduce BREACH-style side channels on pages that reflect
  // secrets. The `compression` library's default filter already respects
  // `Cache-Control: no-transform` and bails for responses that opt out via
  // `x-no-compression`.
  app.use(
    compression({
      threshold: 1024, // bytes — smaller payloads skip compression
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false;
        // Never compress the Server-Sent-Events / WS upgrade paths — we
        // don't run SSE today but this future-proofs the middleware.
        const accept = String(req.headers.accept || "");
        if (accept.includes("text/event-stream")) return false;
        return compression.filter(req, res);
      },
    })
  );

  // ── Body parsers with 50MB limit for collection uploads ───────────────────
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
    skip: req => !ENV.isProduction, // Only rate-limit in production
  });

  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 API calls per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many API requests, please slow down." },
    skip: req => !ENV.isProduction,
  });

  // Strict limiter for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Max 20 auth attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many authentication attempts, please try again later.",
    },
    skip: req => !ENV.isProduction,
  });

  app.use(globalLimiter);
  // Strict auth limiter for tRPC auth.login / auth.signup / auth.resetPassword
  // (runs BEFORE the broader apiLimiter so the tighter bucket wins).
  app.use("/api/trpc", (req, res, next) => {
    const url = req.originalUrl || req.url || "";
    if (
      url.includes("auth.login") ||
      url.includes("auth.signup") ||
      url.includes("auth.resetPassword") ||
      url.includes("auth.forgotPassword")
    ) {
      return authLimiter(req, res, next);
    }
    return next();
  });
  app.use("/api/trpc", apiLimiter);
  app.use("/api/oauth", authLimiter);

  // ── Health check endpoint ──────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? "1.0.0",
      environment: process.env.NODE_ENV ?? "development",
    });
  });

  // ── Prometheus metrics endpoint ───────────────────────────────────────────
  app.get("/metrics", async (_req, res) => {
    const register = (await import("./metrics")).register;
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });

  // ── Email unsubscribe endpoint ───────────────────────────────────────────
  app.get("/unsubscribe", async (req, res) => {
    const token = req.query.token as string;

    if (!token) {
      res.status(400).send("Missing unsubscribe token");
      return;
    }

    try {
      const db = await import("../db").then(m => m.getDb());
      if (!db) {
        res.status(500).send("Database not available");
        return;
      }

      const { emailPreferences } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const prefs = await db
        .select()
        .from(emailPreferences)
        .where(eq(emailPreferences.unsubscribeToken, token))
        .limit(1);

      if (prefs.length === 0) {
        res.status(404).send("Invalid unsubscribe token");
        return;
      }

      await db
        .update(emailPreferences)
        .set({
          scanComplete: false,
          budgetAlerts: false,
          weeklyDigest: false,
          teamActivity: false,
        })
        .where(eq(emailPreferences.id, prefs[0].id));

      res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Unsubscribed</title></head>
        <body style="font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f9fafb;">
          <div style="text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <h1 style="color: #16a34a; margin: 0 0 16px;">✓ Unsubscribed</h1>
            <p style="color: #374151; margin: 0;">You've been unsubscribed from all DevPulse emails.</p>
            <a href="${process.env.APP_URL || "https://devpulse.app"}" style="display: inline-block; margin-top: 24px; color: #2563eb; text-decoration: none;">Return to DevPulse</a>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("[Unsubscribe] Error:", error);
      res.status(500).send("An error occurred");
    }
  });

  // ── OAuth routes ───────────────────────────────────────────────────────────
  registerOAuthRoutes(app);
  registerGoogleOAuthRoutes(app);

  // ── tRPC API ───────────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ path, error }) => {
        // Log server-side errors (not client errors like UNAUTHORIZED)
        if (error.code === "INTERNAL_SERVER_ERROR") {
          console.error(`[tRPC] Error in ${path}:`, error.message);
          Sentry.captureException(error);
        }
      },
    })
  );

  // ── Razorpay Webhook ──────────────────────────────────────────────────────
  app.post(
    "/api/webhooks/razorpay",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const signature = req.headers["x-razorpay-signature"] as string;
      const webhookSecret = ENV.razorpayWebhookSecret;

      if (!webhookSecret) {
        console.warn(
          "[Razorpay] Webhook secret not configured — rejecting webhook"
        );
        res.status(500).json({ error: "Webhook not configured" });
        return;
      }

      if (!verifyWebhookSignature(req.body, signature, webhookSecret)) {
        res.status(400).json({ error: "Invalid signature" });
        return;
      }

      try {
        const event = JSON.parse(req.body);

        if (event.event === "payment.captured") {
          const paymentEntity = event.payload.payment.entity;
          const orderId = paymentEntity.order_id;
          const notes = paymentEntity.notes || {};
          const userId = parseInt(notes.userId || "0");
          const plan = notes.plan || "pro";

          if (userId > 0) {
            // Import db dynamically to avoid circular deps
            const db = await import("../db");
            await db.updateUserPlan(userId, plan as "pro" | "enterprise");
            console.log(
              `[Razorpay] Payment captured: user ${userId} upgraded to ${plan}`
            );
          }

          res.json({ status: "ok" });
        } else if (event.event === "payment.failed") {
          console.warn(
            `[Razorpay] Payment failed for order: ${event.payload.payment.entity.order_id}`
          );
          res.json({ status: "ok" });
        } else if (event.event === "subscription.cancelled") {
          const subEntity = event.payload.subscription.entity;
          const notes = subEntity.notes || {};
          const userId = parseInt(notes.userId || "0");

          if (userId > 0) {
            const db = await import("../db");
            await db.updateUserPlan(userId, "free");
            console.log(
              `[Razorpay] Subscription cancelled: user ${userId} downgraded to free`
            );
          }

          res.json({ status: "ok" });
        } else {
          res.json({ status: "ignored", event: event.event });
        }
      } catch (error) {
        console.error("[Razorpay] Webhook processing error:", error);
        res.status(500).json({ error: "Webhook processing failed" });
      }
    }
  );

  // ── Stripe Webhook ────────────────────────────────────────────────────────
  // Stripe is supported as an alternative / addition to the primary Razorpay
  // flow. Mount this handler only if STRIPE_SECRET_KEY and
  // STRIPE_WEBHOOK_SECRET are configured, and skip it if the `stripe`
  // package is not installed in the runtime.
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (stripeSecret && stripeWebhookSecret) {
    try {
      const StripeModule = await import("stripe");
      const Stripe = StripeModule.default;
      const stripe = new Stripe(stripeSecret);

      app.post(
        "/api/webhooks/stripe",
        express.raw({ type: "application/json" }),
        async (req, res) => {
          const sig = req.headers["stripe-signature"] as string | undefined;
          if (!sig) {
            res.status(400).json({ error: "Missing stripe-signature" });
            return;
          }

          let event: import("stripe").Stripe.Event;
          try {
            event = stripe.webhooks.constructEvent(
              req.body,
              sig,
              stripeWebhookSecret
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(
              `[Stripe] Webhook signature verification failed: ${msg}`
            );
            res.status(400).json({ error: "Invalid signature" });
            return;
          }

          try {
            const dbMod = await import("../db");
            switch (event.type) {
              case "checkout.session.completed": {
                const session =
                  event.data.object as import("stripe").Stripe.Checkout.Session;
                const userId = parseInt(session.metadata?.userId ?? "0", 10);
                const plan = (session.metadata?.plan ?? "pro") as
                  | "pro"
                  | "enterprise";
                if (userId > 0) {
                  await dbMod.updateUserPlan(userId, plan);
                  console.log(
                    `[Stripe] checkout.session.completed: user ${userId} → ${plan}`
                  );
                }
                break;
              }
              case "customer.subscription.deleted": {
                const sub =
                  event.data.object as import("stripe").Stripe.Subscription;
                const userId = parseInt(sub.metadata?.userId ?? "0", 10);
                if (userId > 0) {
                  await dbMod.updateUserPlan(userId, "free");
                  console.log(
                    `[Stripe] customer.subscription.deleted: user ${userId} → free`
                  );
                }
                break;
              }
              case "invoice.payment_failed": {
                const inv =
                  event.data.object as import("stripe").Stripe.Invoice;
                console.warn(
                  `[Stripe] invoice.payment_failed: invoice ${inv.id}`
                );
                break;
              }
              default:
                // ignore other event types
                break;
            }
            res.json({ received: true, type: event.type });
          } catch (err) {
            console.error("[Stripe] Webhook processing error:", err);
            Sentry.captureException(err);
            res.status(500).json({ error: "Webhook processing failed" });
          }
        }
      );
      console.log("[Stripe] Webhook handler mounted at /api/webhooks/stripe");
    } catch (err) {
      console.warn(
        "[Stripe] `stripe` package not available — skipping webhook mount:",
        err instanceof Error ? err.message : err
      );
    }
  }

  // ── File Upload for Collections ────────────────────────────────────────────
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (_req, file, cb) => {
      const allowed = [".json", ".yaml", ".yml"];
      const ext = file.originalname
        .toLowerCase()
        .substring(file.originalname.lastIndexOf("."));
      if (allowed.includes(ext)) {
        cb(null, true);
      } else {
        cb(
          new Error(
            `Invalid file type: ${ext}. Only .json, .yaml, .yml are allowed.`
          )
        );
      }
    },
  });

  app.post(
    "/api/upload/collection",
    upload.single("file"),
    async (req, res) => {
      try {
        // Require authentication for file uploads
        let user: any = null;
        try {
          user = await sdk.authenticateRequest(req);
        } catch {
          // Not authenticated
        }
        if (!user) {
          res.status(401).json({ error: "Authentication required" });
          return;
        }

        if (!req.file) {
          res.status(400).json({ error: "No file uploaded" });
          return;
        }

        const content = req.file.buffer.toString("utf-8");
        const originalName = req.file.originalname;
        const ext = originalName
          .toLowerCase()
          .substring(originalName.lastIndexOf("."));

        let format: "postman" | "openapi";
        let data: any;

        if (ext === ".json") {
          try {
            data = JSON.parse(content);
            // Auto-detect format: Postman has "info" with "schema", OpenAPI has "openapi" or "swagger"
            if (data.openapi || data.swagger) {
              format = "openapi";
            } else if (data.info?._postman_id || data.item) {
              format = "postman";
            } else {
              format = "openapi"; // Default to OpenAPI for generic JSON
            }
          } catch {
            res.status(400).json({ error: "Invalid JSON file" });
            return;
          }
        } else {
          // YAML — parse as OpenAPI
          try {
            const yaml = await import("yaml");
            data = yaml.parse(content);
            format = "openapi";
          } catch {
            res
              .status(400)
              .json({ error: "Invalid YAML file or yaml parser unavailable" });
            return;
          }
        }

        res.json({ format, data, filename: originalName, userId: user.id });
      } catch (error) {
        console.error("[Upload] Collection upload error:", error);
        res.status(500).json({ error: "Upload processing failed" });
      }
    }
  );

  // ── Sentry Error Handler ───────────────────────────────────────────────────
  if (ENV.sentryDsn) {
    Sentry.setupExpressErrorHandler(app);
  }

  // ── WebSocket initialization ─────────────────────────────────────────────────
  wsManager.initialize(server);

  // ── GitHub Webhook ─────────────────────────────────────────────────────────
  app.post(
    "/api/webhooks/github",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const signature = req.headers["x-hub-signature-256"] as string;
      const githubSecret = ENV.githubWebhookSecret || "";

      const body = req.body.toString("utf-8");

      if (githubSecret) {
        const isValid = verifyGitHubWebhook(body, signature, githubSecret);
        if (!isValid) {
          res.status(401).json({ error: "Invalid signature" });
          return;
        }
      }

      const event = req.headers["x-github-event"] as string;
      const payload = JSON.parse(body);

      try {
        if (event === "push") {
          const result = handleGitHubPush(payload);
          res.json(result);
        } else if (event === "pull_request") {
          const result = handleGitHubPullRequest(payload);
          res.json(result);
        } else {
          res.json({ status: "ignored", event });
        }
      } catch (error) {
        console.error("[GitHub] Webhook processing error:", error);
        res.status(500).json({ error: "Webhook processing failed" });
      }
    }
  );

  // ── Frontend serving ───────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ── Start listening ────────────────────────────────────────────────────────
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(
      `[Server] Port ${preferredPort} is busy, using port ${port} instead`
    );
  }

  server.listen(port, () => {
    console.log(`[Server] Running on http://localhost:${port}/`);
    console.log(`[Server] Mode: ${process.env.NODE_ENV ?? "development"}`);
    if (!ENV.isProduction) {
      console.log(`[Server] Health check: http://localhost:${port}/api/health`);
    }

    scheduleWeeklyDigest();
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  process.on("SIGTERM", () => {
    console.log("[Server] SIGTERM received. Shutting down gracefully...");
    server.close(() => {
      console.log("[Server] Closed.");
      process.exit(0);
    });
  });
}

startServer().catch(err => {
  console.error("[Server] Fatal startup error:", err);
  process.exit(1);
});
