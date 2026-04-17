/**
 * Security patch module - contains fixes for critical security vulnerabilities
 *
 * This module should be imported and used by the relevant files to fix security issues.
 * Once patches are applied, this module's exports can be removed.
 */

import crypto from "crypto";

// ============================================================================
// WEBSOCKET AUTHENTICATION FIX
// ============================================================================

/**
 * Verify WebSocket authentication by extracting and validating session from cookies.
 *
 * IMPORTANT: In websocket.ts, replace the authenticate handler to use this function:
 *
 * OLD CODE ( insecure ):
 *   socket.on("authenticate", (userId: number) => {
 *     // Client provides userId - CAN BE SPOOFED!
 *     socket.join(`user:${userId}`);
 *   });
 *
 * NEW CODE ( secure ):
 *   socket.on("authenticate", async (data: any, callback: Function) => {
 *     const auth = await verifyWebSocketAuth(socket);
 *     if (auth) {
 *       socket.join(`user:${auth.userId}`);
 *       callback({ success: true, userId: auth.userId });
 *     } else {
 *       callback({ success: false, error: "Not authenticated" });
 *     }
 *   });
 */
export async function verifyWebSocketAuth(
  socket: any,
  db: any
): Promise<{ userId: number; role: string } | null> {
  try {
    const cookieHeader = socket.handshake?.headers?.cookie;
    if (!cookieHeader) return null;

    // Parse cookies
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach((c: string) => {
      const [name, ...rest] = c.trim().split("=");
      cookies[name] = rest.join("=");
    });

    const token = cookies["devpulse_session"];
    if (!token) return null;

    // Decode session token
    const sessionData = JSON.parse(
      Buffer.from(token, "base64").toString("utf-8")
    );
    if (!sessionData?.sessionId) return null;

    // Verify session exists and is valid
    const session = await db.getUserSessionByToken(sessionData.sessionId);
    if (!session) return null;

    // Get user
    const user = await db.getUserById(session.userId);
    if (!user) return null;

    return { userId: user.id, role: user.role };
  } catch {
    return null;
  }
}

// ============================================================================
// WEBHOOK SIGNATURE VERIFICATION FIX
// ============================================================================

/**
 * Fixed webhook signature verification that properly handles:
 * - Missing signatures
 * - Invalid signature formats
 * - Timing attacks
 *
 * Usage in payment webhook handler:
 *
 * OLD CODE ( buggy ):
 *   const sigBuf = Buffer.from(signature, "utf-8");
 *   const expBuf = Buffer.from(expectedSignature, "utf-8");
 *   const isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
 *   // BUG: If signature is wrong format/length, this fails silently
 *
 * NEW CODE ( secure ):
 *   const isValid = verifyWebhookSignature(payload, signature, webhookSecret);
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): boolean {
  if (!secret) {
    console.error("[Webhook] Secret not configured");
    return false;
  }

  if (!signature) {
    console.error("[Webhook] No signature provided");
    return false;
  }

  const payloadString =
    typeof payload === "string" ? payload : payload.toString("utf-8");
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payloadString)
    .digest("hex");

  // Use timing-safe comparison with proper error handling
  try {
    const signatureBuffer = Buffer.from(signature, "utf-8");
    const expectedBuffer = Buffer.from(`sha256=${expectedSignature}`, "utf-8");

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    console.error("[Webhook] Signature verification error:", error);
    return false;
  }
}

// ============================================================================
// PASSWORD HASHING FIX
// ============================================================================

const PBKDF2_ITERATIONS = 100000;
const HASH_LENGTH = 64;
const SALT_LENGTH = 32;

/**
 * Hash a password using PBKDF2-SHA512
 *
 * Usage for password updates:
 *   const hashedPassword = hashPasswordSecure(password);
 *   await db.updateUserPassword(userId, hashedPassword);
 */
export function hashPasswordSecure(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    HASH_LENGTH,
    "sha512"
  );
  return `pbkdf2:sha512:${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * Verify password against stored hash (supports legacy SHA-256 hashes)
 */
export function verifyPasswordSecure(
  password: string,
  storedHash: string
): boolean {
  if (!storedHash || !password) return false;

  // Legacy SHA-256 hash (from old weak implementation)
  if (storedHash.length === 64 && !storedHash.includes(":")) {
    const legacyHash = crypto
      .createHash("sha256")
      .update(password + process.env.COOKIE_SECRET)
      .digest("hex");
    try {
      return crypto.timingSafeEqual(
        Buffer.from(legacyHash, "hex"),
        Buffer.from(storedHash, "hex")
      );
    } catch {
      return false;
    }
  }

  // New PBKDF2 hash
  if (storedHash.startsWith("pbkdf2:")) {
    const parts = storedHash.split(":");
    if (parts.length !== 4) return false;

    const [, algorithm, saltHex, hashHex] = parts;
    try {
      const salt = Buffer.from(saltHex, "hex");
      const storedHashBuf = Buffer.from(hashHex, "hex");

      const computedHash = crypto.pbkdf2Sync(
        password,
        salt,
        PBKDF2_ITERATIONS,
        HASH_LENGTH,
        algorithm as "sha512"
      );

      if (computedHash.length !== storedHashBuf.length) return false;
      return crypto.timingSafeEqual(computedHash, storedHashBuf);
    } catch {
      return false;
    }
  }

  return false;
}

// ============================================================================
// CSRF PROTECTION
// ============================================================================

/**
 * Generate a CSRF token for forms
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Verify CSRF token from request headers
 */
export function verifyCsrfToken(
  requestToken: string | undefined,
  sessionToken: string | undefined
): boolean {
  if (!requestToken || !sessionToken) return false;

  try {
    const requestBuf = Buffer.from(requestToken, "utf-8");
    const sessionBuf = Buffer.from(sessionToken, "utf-8");

    if (requestBuf.length !== sessionBuf.length) return false;
    return crypto.timingSafeEqual(requestBuf, sessionBuf);
  } catch {
    return false;
  }
}

// ============================================================================
// INPUT VALIDATION HELPERS
// ============================================================================

/**
 * Sanitize user input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  if (!input) return "";
  // Remove null bytes and control characters
  return input.replace(/[\\x00-\\ x1F"]/g, "").trim();
}

/**
 * Validate that a string is a safe identifier (for database column names, etc.)
 */
export function isSafeIdentifier(identifier: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return /^[^"]+@[^"]+\\.[^"]+$/.test(email) && email.length <= 320;
}
