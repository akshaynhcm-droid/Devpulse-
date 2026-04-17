# DevPulse Security Patch Documentation

## Overview

This document details security vulnerabilities discovered during codebase audit and the fixes that need to be applied.

## Critical Vulnerabilities Fixed

### 1. Weak Password Hashing

**Location:** `server/routers.ts` (line 76), `server/settingsRouter.ts` (line 19)

**Issue:** Using SHA-256 for password hashing without salt or iterations is cryptographically weak.

**Current Code:**

```typescript
const passwordHash = crypto
  .createHash("sha256")
  .update(input.newPassword + process.env.COOKIE_SECRET)
  .digest("hex");
```

**Fix Required:**

1. Import the secure password utility:

```typescript
import { hashPassword, verifyPassword } from "./utils/password";
```

2. Replace the weak hashing:

```typescript
const passwordHash = await hashPassword(input.newPassword);
```

3. For verification in login:

```typescript
const isValid = await verifyPassword(input.password, user.passwordHash);
```

### 2. WebSocket Authentication Vulnerability

**Location:** `server/websocket.ts`

**Issue:** Clients can send any `userId` without server-side verification.

**Current Code:**

```typescript
ws.on("message", message => {
  const data = JSON.parse(message);
  if (data.type === "auth") {
    client.userId = data.userId; // ATTACKER CAN SPOOF THIS
  }
});
```

**Fix Required:** Verify userId from session cookie or token:

```typescript
import { verifyWebSocketAuth } from "./utils/security";

ws.on("message", async message => {
  const data = JSON.parse(message);
  if (data.type === "auth") {
    const sessionToken =
      data.sessionToken || extractCookie(ws, "session_token");
    const verifiedUserId = await verifyWebSocketAuth(sessionToken);
    if (verifiedUserId) {
      client.userId = verifiedUserId;
    }
  }
});
```

### 3. Webhook Signature Verification Bug

**Location:** `server/_core/index.ts` (lines 330-346)

**Issue:** Signature verification crashes when Razorpay sends null signature during testing.

**Current Code:**

```typescript
const generatedSignature = crypto
  .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
  .update(body)
  .digest('hex');

if (signature !== generatedSignature) { // CRASHES if signature is null
```

**Fix Required:**

```typescript
import { verifyWebhookSignature } from "../utils/security";

// In the webhook handler:
if (
  !verifyWebhookSignature(body, signature, process.env.RAZORPAY_WEBHOOK_SECRET!)
) {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Invalid webhook signature",
  });
}
```

The `verifyWebhookSignature` function handles null/missing signatures gracefully.

## Files Created

### 1. `server/utils/password.ts`

- PBKDF2-SHA512 password hashing with 100,000 iterations
- 32-byte random salt per password
- 64-byte hash output
- Constant-time comparison via `crypto.timingSafeEqual`

### 2. `server/utils/security.ts`

- `verifyWebSocketAuth()` - Verifies WebSocket authentication from session
- `verifyWebhookSignature()` - Handles null signatures gracefully
- `generateCSRFToken()` / `verifyCSRFToken()` - CSRF protection
- `sanitizeInput()` - Input sanitization helpers

### 3. `server/utils/webhookFix.ts`

- Dedicated webhook verification module
- Timing-safe comparison
- Proper error handling

## Files Requiring Manual Edits

| File                       | Line(s)      | Change Required                       |
| -------------------------- | ------------ | ------------------------------------- |
| `server/routers.ts`        | ~76          | Replace SHA-256 with `hashPassword()` |
| `server/settingsRouter.ts` | ~19          | Replace SHA-256 with `hashPassword()` |
| `server/_core/index.ts`    | ~330-346     | Replace webhook verification logic    |
| `server/websocket.ts`      | auth handler | Add session verification              |

## Migration Strategy

### For Existing Users

The `hashPassword` utility supports legacy hash format for migration:

```typescript
import { hashPassword, verifyPassword, needsMigration } from "./utils/password";

// During login:
if (await needsMigration(user.passwordHash)) {
  // Migrate to new hash format
  await db.updateUser(user.id, {
    passwordHash: await hashPassword(input.password),
  });
}
```

## Testing

Run the test suite to verify fixes:

```bash
pnpm test
```

## Remaining Work

1. Apply the manual edits listed above
2. Run `pnpm run check` to verify TypeScript compiles
3. Run `pnpm test` to verify all tests pass
4. Test WebSocket authentication flow
5. Test webhook signature verification with Razorpay test webhooks

## Security Recommendations

1. **Rate Limiting**: Add rate limiting to auth endpoints
2. **Password Policy**: Enforce minimum 12 characters, mixed case, numbers, symbols
3. **Session Management**: Implement session rotation on privilege escalation
4. **Audit Logging**: Log all authentication failures with IP tracking
5. **2FA**: Consider adding TOTP-based two-factor authentication

## References

- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- WebSocket Security: https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html
- API Security: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
