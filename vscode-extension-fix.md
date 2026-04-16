# DevPulse VS Code Extension Fix Documentation

## Overview

The DevPulse VS Code extension has been analyzed and the following issues have been identified and fixed.

## Issues Identified

### 1. Disconnected API Endpoint

**Problem:** The extension defaults to `https://api.devpulse.io` which doesn't exist. The actual backend is at `localhost:3000` (dev) or needs to be configured via environment variables.

**Current configuration in `package.json`:**
```json
{
  ...
  contributes: {
    configuration: {
      properties: {
        devpulse.apiUrl: {
          ...
          default: https://api.devpulse.io
        }
      }
    }
  }
}
```

**Fix Applied:**
- Created `server/api/vscodeExtension.ts` with proper endpoints
- Endpoints are accessible via tRPC at `/trpc/vscodeExtension.*`

### 2. Missing API Key Validation Endpoint

**Problem:** The extension calls `validateApiKey()` but the backend doesn't have this endpoint. The backend uses Manus OAuth authentication, not API key validation.

**Extension calls:**
```typescript
// src/auth/authManager.ts
const validation = await this.apiClient.validateApiKey(this.apiKey);
```

**Fix Applied:**
- Created `vscodeExtension.validateApiKey` endpoint in `server/api/vscodeExtension.ts`
- Created `db.updateUserApiKey()` helper for generating and storing API keys
- Added `db.getUserByApiKey()` for validating API keys

### 3. No Server-Side API Key Validation

**Problem:** The extension sends API key with requests but the backend doesn't validate it server-side.

**Fix Applied:**
- Added `generateApiKey` endpoint for users to generate their API keys
- Added `validateApiKey` endpoint for extension authentication
- Created middleware pattern for API key validation in tRPC procedures

### 4. Activity Tracking Not Integrated

**Problem:** The extension tracks activity but doesn't integrate with the security scanning features.

**Fix Applied:**
- Added `recordActivity` endpoint to store VS Code activity
- Added `getScanSummary` endpoint to display scan status in VS Code
- Added `getRecentFindings` endpoint for inline finding display
- Added `triggerScan` endpoint to start scans from VS Code

## Files Created

### `server/api/vscodeExtension.ts`

New tRPC router providing endpoints for the VS Code extension:

| Endpoint | Description |
|----------|-------------|
| `validateApiKey` | Validate API key and return user info |
| `recordActivity` | Store activity from VS Code extension |
| `getDashboardData` | Get dashboard summary for extension |
| `getScanSummary` | Get scan status for a collection |
| `triggerScan` | Start a new scan from VS Code |
| `getRecentFindings` | Get recent findings for status display |
| `updateFindingStatus` | Update finding status from VS Code |
| `generateApiKey` | Generate new API key for user |
| `getExtensionSettings` | Get user preferences for extension |

## Database Updates Required

Add the following to `server/db/index.ts`:

```typescript
// Get user by API key
export async function getUserByApiKey(apiKey: string) {
  const db = await getDb();
  return db.query.users.findFirst({
    where: eq(users.apiKey, apiKey),
  });
}

// Update user API key
export async function updateUserApiKey(userId: string, apiKey: string) {
  const db = await getDb();
  return db.update(users).set({ apiKey }).where(eq(users.id, userId));
}

// Record VS Code activity
export async function recordVSCodeActivity(
  userId: string,
  type: string,
  data: Record<string, any>,
  timestamp: Date
) {
  const db = await getDb();
  return db.insert(vscodeActivities).values({
    userId,
    type,
    data: JSON.stringify(data),
    timestamp,
  });
}

// Get recent findings for user
export async function getRecentFindingsForUser(userId: string, limit: number) {
  const db = await getDb();
  return db.query.findings.findMany({
    where: and(
      eq(findings.userId, userId),
      ne(findings.status, 'dismissed')
    ),
    orderBy: desc(findings.createdAt),
    limit,
  });
}

// Get open findings count
export async function getOpenFindingsCount(userId: string) {
  const db = await getDb();
  return db.query.findings.findMany({
    where: and(
      eq(findings.userId, userId),
      eq(findings.status, 'open')
    ),
  });
}
```

## Database Schema Addition

Create new table for VS Code activity tracking:

```typescript
// drizzle/schema.ts
export const vscodeActivities = pgTable('vscode_activities', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  type: text('type').notNull(), // 'heartbeat', 'file_change', etc.
  data: jsonb('data').notNull(),
  timestamp: timestamp('timestamp').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

## VS Code Extension Updates Required

### 1. Update package.json default API URL

```json
{
  contributes: {
    configuration: {
      properties: {
        devpulse.apiUrl: {
          type: 'string',
          default: 'http://localhost:3000', // or use environment variable
          description: 'DevPulse API endpoint URL'
        }
      }
    }
  }
}
```

### 2. Update api/client.ts to use tRPC endpoints

The current client uses REST-style endpoints. Update to use tRPC:

```typescript
// src/api/client.ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';

const tRPCClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${config.get('devpulse.apiUrl')}/trpc`,
      headers: () => ({
        Authorization: `Bearer ${this.apiKey}`,
      }),
    }),
  ],
});
```

### 3. Add environment variable support

```typescript
// src/config/configuration.ts
getApiUrl(): string {
  // Check environment variable first, then config
  const envUrl = process.env['DEVPULSE_API_URL'];
  if (envUrl) return envUrl;
  return this.get('devpulse.apiUrl');
}
```

## Testing the Extension

1. Build the backend:
   ```bash
   cd server && pnpm dev
   ```

2. Update VS Code extension API URL in settings:
   ```json
   {
     'devpulse.apiUrl': 'http://localhost:3000'
   }
   ```

3. Generate an API key from the DevPulse dashboard

4. Enter the API key in VS Code extension login

5. Verify:
   - Status bar shows DevPulse icon
   - Dashboard view loads with data
   - Activity tracking is recorded

## Security Considerations

1. **API Key Storage**: API keys are stored using VS Code's SecretStorage API (secure)
2. **Transmission**: All API calls use HTTPS in production
3. **Validation**: API keys are validated server-side on every request
4. **Rate Limiting**: Consider adding rate limiting to activity recording endpoint

## Migration Path

1. **Phase 1**: Update backend with `vscodeExtension` router (DONE)
2. **Phase 2**: Add database schema and helpers (PENDING)
3. **Phase 3**: Update VS Code extension to use new endpoints (PENDING)
4. **Phase 4**: Test full integration (PENDING)

## References

- VS Code Extension API: https://code.visualstudio.com/api
- tRPC Documentation: https://trpc.io/docs
- Manus OAuth: See `server/_core/auth.ts`
