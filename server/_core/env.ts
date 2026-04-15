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
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "https://api.manus.app/forge",
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
} as const;
