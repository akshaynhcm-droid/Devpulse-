import "dotenv/config";
import * as Sentry from "@sentry/node";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { registerOAuthRoutes } from "./oauth";
import { registerGoogleOAuthRoutes } from "./googleOAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV } from "./env";

// ============================================================================
// STARTUP VALIDATION — fail fast if critical config is missing
// ============================================================================

function validateEnvironment() {
  const errors: string[] = [];

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
  }

  if (errors.length > 0) {
    console.error("\n❌ SERVER STARTUP FAILED — Configuration errors:\n");
    errors.forEach(err => console.error(`  • ${err}`));
    console.error("\nPlease fix these issues in your .env file (see .env.example for reference).\n");
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
  app.use(
    helmet({
      // Allow Vite dev server inline scripts
      contentSecurityPolicy: ENV.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "blob:"],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'"],
              frameSrc: ["'none'"],
            },
          }
        : false,
      // Allow iframe embedding in dev (for Manus runtime)
      frameguard: ENV.isProduction ? { action: "sameorigin" } : false,
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
    message: { error: "Too many authentication attempts, please try again later." },
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

  // ── Sentry Error Handler ───────────────────────────────────────────────────
  if (ENV.sentryDsn) {
    Sentry.setupExpressErrorHandler(app);
  }

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
    console.log(`[Server] Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[Server] Running on http://localhost:${port}/`);
    console.log(`[Server] Mode: ${process.env.NODE_ENV ?? "development"}`);
    if (!ENV.isProduction) {
      console.log(`[Server] Health check: http://localhost:${port}/api/health`);
    }
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
