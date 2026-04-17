# DevPulse - API Security Platform - TODO

## Phase 1: Database Schema & Core Setup

- [x] Design and implement database schema with all required tables
- [x] Create Drizzle migrations for users, collections, scans, findings, team members, compliance reports, token analytics, kill switch logs
- [x] Set up database helpers in server/db.ts for all queries

## Phase 2: Authentication & Authorization

- [x] Verify Manus OAuth integration is working
- [x] Implement protected procedures for authenticated routes
- [x] Create role-based access control (admin, editor, viewer)
- [x] Test authentication flow end-to-end

## Phase 3: API Collection Management

- [x] Create endpoint to upload/import Postman collections
- [x] Create endpoint to upload/import OpenAPI specs
- [x] Create endpoint to list all user collections
- [x] Create endpoint to get collection details
- [x] Create endpoint to delete collections
- [x] Create endpoint to update collection metadata

## Phase 4: Security Scanning & Findings

- [x] Create endpoint to run OWASP vulnerability scan on collection
- [x] Create endpoint to list scans for a collection
- [x] Create endpoint to get scan details with findings
- [x] Implement finding severity classification (Critical, High, Medium, Low)
- [x] Create endpoint to update finding status (open, in-progress, resolved)

## Phase 5: Shadow API Detection

- [x] Create endpoint to scan collection for undocumented/shadow APIs
- [x] Implement shadow API detection logic
- [x] Create endpoint to list shadow APIs for a collection
- [x] Create endpoint to mark shadow APIs as documented

## Phase 6: LLM Token Analytics

- [x] Create endpoint to record token usage (prompt, completion, thinking tokens)
- [x] Create endpoint to get token analytics by model
- [x] Create endpoint to get cost breakdown by model
- [x] Create endpoint to get token usage trends over time

## Phase 7: Kill Switch & Budget Management

- [x] Create endpoint to set budget limits
- [x] Create endpoint to trigger kill switch manually
- [x] Create endpoint to get kill switch status
- [x] Create endpoint to get audit trail of kill switch events
- [x] Implement automatic kill switch trigger when budget exceeded

## Phase 8: Compliance Reporting

- [x] Create endpoint to generate PCI DSS compliance report
- [x] Implement PCI DSS requirement mapping logic
- [x] Create endpoint to get compliance report details
- [x] Create endpoint to export compliance report as PDF

## Phase 9: Team Management

- [x] Create endpoint to invite team members by email
- [x] Create endpoint to list team members
- [x] Create endpoint to update team member role (admin, editor, viewer)
- [x] Create endpoint to remove team members
- [x] Implement role-based access control for team features

## Phase 10: Onboarding Wizard

- [x] Create endpoint to get onboarding steps
- [x] Create endpoint to mark onboarding step as complete
- [x] Create endpoint to get onboarding progress
- [x] Implement onboarding flow: import collection → run scan → review findings → invite team → setup compliance

## Phase 11: Frontend - Dashboard Layout & Navigation

- [x] Create DashboardLayout component with sidebar navigation
- [x] Implement navigation menu with all feature pages
- [x] Create user profile menu with logout
- [x] Implement responsive design for mobile/tablet
- [x] Add dark/light theme support

## Phase 12: Frontend - Home Dashboard

- [x] Create home page with risk score overview
- [x] Display recent scans summary
- [x] Show key metrics cards (total collections, total findings, team members)
- [x] Implement quick action buttons

## Phase 13: Frontend - Collection Management

- [x] Create collections page with list view
- [x] Implement upload collection modal (Postman/OpenAPI)
- [x] Create collection detail view
- [x] Implement delete collection with confirmation
- [x] Show collection metadata and stats

## Phase 14: Frontend - Security Scanning

- [x] Create scanning page with scan history
- [x] Implement scan trigger button
- [x] Show scan progress indicator
- [x] Display findings organized by severity
- [x] Create finding detail view with remediation steps

## Phase 15: Frontend - Shadow API Detection

- [x] Create shadow APIs page
- [x] Display undocumented endpoints
- [x] Show risk level and recommendations
- [x] Implement mark as documented action

## Phase 16: Frontend - Token Analytics

- [x] Create token analytics page with charts
- [x] Display token usage by model (prompt, completion, thinking)
- [x] Show cost breakdown by model
- [x] Implement time range filter
- [x] Create export analytics report

## Phase 17: Frontend - Kill Switch

- [x] Create kill switch page
- [x] Display current budget and usage
- [x] Implement set budget limit form
- [x] Create trigger kill switch button with confirmation
- [x] Display audit trail of kill switch events

## Phase 18: Frontend - Compliance Reporting

- [x] Create compliance page with report list
- [x] Implement generate compliance report button
- [x] Display compliance score and status
- [x] Show detailed requirement breakdown
- [x] Implement export compliance report as PDF

## Phase 19: Frontend - Team Management

- [x] Create team page with members list
- [x] Implement invite team member form
- [x] Show member role and status
- [x] Create role update dropdown
- [x] Implement remove member with confirmation

## Phase 20: Frontend - Onboarding Wizard

- [x] Create onboarding wizard modal/page
- [x] Implement step 1: Import collection
- [x] Implement step 2: Run scan
- [x] Implement step 3: Review findings
- [x] Implement step 4: Invite team members
- [x] Implement step 5: Setup compliance
- [x] Add progress indicator and navigation

## Phase 21: Testing

- [x] Write unit tests for all backend procedures (scanning.test.ts, payments.test.ts, collections.test.ts, team.test.ts, compliance.test.ts, killSwitch.test.ts, tokenAnalytics.test.ts)
- [x] Write integration tests for API endpoints
- [x] Write E2E tests for critical user flows (e2e.test.ts)
- [x] Test authentication and authorization
- [x] Test error handling and edge cases

## Phase 22: Polish & Refinement

- [x] Review UI for elegance and polish
- [x] Ensure consistent spacing and typography
- [x] Add loading states and animations
- [x] Implement error messages and notifications
- [x] Test cross-browser compatibility

## Phase 23: Final Testing & Delivery

- [x] End-to-end testing of all features
- [x] Performance testing and optimization
- [x] Security review (see security-patch.md for details)
- [x] Create checkpoint and prepare for delivery
- [x] Apply security patches (password hashing ✅, webhook verification ✅, WebSocket auth ✅)
- [x] Fix CI/CD pipeline with real deployment commands (deploy.yml created ✅)
- [x] Clean up dual backend architecture (no devpulse-backend/ present ✅)
- [x] Update VS Code extension to point to actual backend (api.devpluse.in ✅, all DB helpers ✅, tRPC wired ✅)
  - [x] Created `server/api/vscodeExtension.ts` with backend endpoints
  - [x] Add `vscodeActivities` table to database schema
  - [x] Add `db.getUserByApiKey()` and `db.updateUserApiKey()` helpers
  - [x] Update VS Code extension package.json with correct API URL
  - [x] Update VS Code extension api/client.ts to use tRPC

## Phase 24: Launch Checklist

- [ ] Set RAILWAY_TOKEN secret in GitHub repo settings
- [ ] Set all other required secrets (DATABASE_URL, STRIPE_SECRET_KEY, SENDGRID_API_KEY, COOKIE_SECRET, SLACK_BOT_TOKEN)
- [ ] Run `pnpm drizzle-kit push` against production MySQL to apply schema
- [ ] Publish VS Code extension to marketplace via `vsce publish`
- [ ] Configure devpluse.in DNS → Railway deployment URL
- [ ] Set up Railway MySQL addon or external PlanetScale/Railway MySQL
