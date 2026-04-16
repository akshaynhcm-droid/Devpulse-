import "dotenv/config";
import * as Sentry from "@sentry/node";
import express from "express";
import { createServer } from "http";
import net from "net";
import crypto from "crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
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

async function startServer() {
  // Validate config before starting anything
  validateEnvironment();

  if (ENV.sentryDsn) {
    Sentry.init({
      dsn: ENV.sentryDsn,
      environment: ENV.isProduction ? "production" : "development",
      tracesSampleRate: 1.0,
    });
    console.log("[Sentry] Initialized automatically.");
  }

  const app = express();
  const server = createServer(app);

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
                (req, res) => `'nonce-${(res as any).locals.cspNonce}'`,
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

      // Verify webhook signature
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(req.body)
        .digest("hex");

      // timingSafeEqual requires equal-length buffers; fall back to constant-time compare
      const sigBuf = Buffer.from(signature, "utf-8");
      const expBuf = Buffer.from(expectedSignature, "utf-8");
      const isValidSignature =
        sigBuf.length === expBuf.length &&
        crypto.timingSafeEqual(sigBuf, expBuf);

      if (!isValidSignature) {
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
