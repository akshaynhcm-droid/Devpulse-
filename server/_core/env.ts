/**
 * Centralized environment variable access.
 * All process.env access must go through this module.
 */
export const ENV = {
  // Auth / JWT
  cookieSecret: process.env.JWT_SECRET ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",

  // Database
  databaseUrl: process.env.DATABASE_URL ?? "",

  // OAuth
  appId: process.env.VITE_APP_ID ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "https://auth.manus.app",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",

  // Server
  port: parseInt(process.env.PORT ?? "3000"),
  isProduction: process.env.NODE_ENV === "production",

  // LLM / Forge API
  forgeApiUrl:
    process.env.BUILT_IN_FORGE_API_URL ?? "https://api.manus.app/forge",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  minimaxApiKey: process.env.MINIMAX_API_KEY ?? "",
  minimaxApiUrl: process.env.MINIMAX_API_URL ?? "https://api.minimax.io/v1",
  minimaxModel: process.env.MINIMAX_MODEL ?? "minimaxai/minimax-m2.7",

  // Email (SMTP)
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parseInt(process.env.SMTP_PORT ?? "587"),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "noreply@devpulse.app",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",

  // Notifications
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? "",

  // Error monitoring
  sentryDsn: process.env.SENTRY_DSN ?? "",

  // Razorpay Payments
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",

  // Frontend URL (for payment callbacks)
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",

  // GitHub Webhook
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
} as const;

/**
 * Validate critical environment variables at startup.
 * Throws in production if required vars are missing; warns in development.
 */
export function validateEnv(): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // CRITICAL — must always be set
  if (!ENV.cookieSecret)
    errors.push("JWT_SECRET is not set — authentication will not work");
  if (!ENV.databaseUrl)
    errors.push("DATABASE_URL is not set — database connection will fail");

  // Production-only critical checks
  if (ENV.isProduction) {
    if (!ENV.googleClientId)
      errors.push("GOOGLE_CLIENT_ID is not set — OAuth login will fail");
    if (!ENV.googleClientSecret)
      errors.push("GOOGLE_CLIENT_SECRET is not set — OAuth login will fail");
    if (!ENV.razorpayKeyId)
      errors.push("RAZORPAY_KEY_ID is not set — payments will not work");
    if (!ENV.razorpayKeySecret)
      errors.push("RAZORPAY_KEY_SECRET is not set — payments will not work");
    if (!ENV.razorpayWebhookSecret)
      errors.push(
        "RAZORPAY_WEBHOOK_SECRET is not set — webhook verification will fail"
      );
    if (!ENV.smtpHost)
      warnings.push(
        "SMTP_HOST is not set — team invite emails will not be sent"
      );
    if (!ENV.sentryDsn)
      warnings.push("SENTRY_DSN is not set — error monitoring disabled");
  }

  // Non-critical warnings
  if (!ENV.slackWebhookUrl)
    warnings.push(
      "SLACK_WEBHOOK_URL is not set — kill switch alerts will not be sent to Slack"
    );
  if (!ENV.smtpHost)
    warnings.push(
      "SMTP_HOST is not set — email features (team invites) disabled"
    );
  if (!ENV.razorpayKeyId)
    warnings.push("RAZORPAY_KEY_ID is not set — payment features disabled");
  if (!ENV.githubWebhookSecret)
    warnings.push(
      "GITHUB_WEBHOOK_SECRET is not set — GitHub webhook integration disabled"
    );

  // Log warnings
  for (const w of warnings) console.warn(`[ENV] ⚠ ${w}`);

  // In production, throw on errors
  if (ENV.isProduction && errors.length > 0) {
    for (const e of errors) console.error(`[ENV] ✖ ${e}`);
    throw new Error(
      `Missing critical environment variables:\n${errors.map(e => `  - ${e}`).join("\n")}`
    );
  }

  // In development, just warn
  if (!ENV.isProduction && errors.length > 0) {
    for (const e of errors)
      console.warn(`[ENV] ⚠ ${e} (would be fatal in production)`);
  }

  return { valid: errors.length === 0, warnings, errors };
}
