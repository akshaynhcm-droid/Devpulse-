import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  formatters: {
    level: label => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
  redact: {
    paths: [
      "password",
      "*.password",
      "token",
      "*.token",
      "secret",
      "*.secret",
      "apiKey",
      "*.apiKey",
    ],
    remove: true,
  },
});

// Request logger middleware
export function createRequestLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      const logData = {
        requestId: req.id || req.headers["x-request-id"] || "unknown",
        userId: req.user?.id || null,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers["user-agent"],
      };

      if (res.statusCode >= 500) {
        logger.error(logData, "Request failed with server error");
      } else if (res.statusCode >= 400) {
        logger.warn(logData, "Request failed with client error");
      } else {
        logger.info(logData, "Request completed");
      }
    });

    next();
  };
}

// Business event logger
export function logBusinessEvent(
  event: string,
  userId: number,
  metadata?: Record<string, any>
) {
  logger.info(
    {
      event,
      userId,
      ...metadata,
    },
    `Business event: ${event}`
  );
}
