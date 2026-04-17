# DevPulse Enterprise

**DevPulse** is the security and operations layer for production AI agents. It provides real-time security scanning, cost anomaly detection, cost forecasting, and PII redaction for production LLM applications.

[![CI/CD Pipeline](https://github.com/yourname/devpulse/actions/workflows/deploy.yml/badge.svg)](https://github.com/yourname/devpulse/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Real-time Cost Monitoring** - Track LLM spending across all agents with WebSocket updates
- **Anomaly Detection** - Automatically detect cost spikes and unusual usage patterns
- **Shadow API Detection** - Find undocumented endpoints in your codebase
- **OWASP Security Scanning** - Automated security analysis against OWASP Top 10
- **Cost Forecasting** - Predict your AI spend before the invoice arrives
- **GitHub Integration** - Webhook-based security scanning on push/PR events
- **Kill Switch** - Instantly halt AI agent operations during emergencies
- **Compliance Reporting** - SOC2, PCI-DSS, and GDPR compliance tracking
- **Team Management** - Multi-user access with role-based permissions

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+
- MySQL 8.0 (or Docker)

### Installation

1. **Clone the repo**

   ```bash
   git clone https://github.com/yourname/devpulse.git
   cd devpulse
   ```

2. **Set up environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start with Docker Compose**

   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. **Access the Application**
   - Dashboard: http://localhost:3001 (devpulse-frontend)
   - API: http://localhost:3000 (Node.js tRPC backend)
   - Marketing Site: http://localhost:3002 (client/ - Vite-based)

### Development Mode

```bash
# Install dependencies
pnpm install

# Start the Node.js backend (tRPC + Express)
pnpm dev

# In a separate terminal, start the dashboard (Next.js)
cd devpulse-frontend && pnpm dev

# In another terminal, start the marketing site (Vite)
cd client && pnpm dev
```

## Architecture

### Project Structure

```
devpulse-app/
├── server/              # Node.js tRPC Backend (Main API)
│   ├── _core/          # Core middleware, auth, config
│   ├── routers/        # tRPC routers (collections, scanning, payments, etc.)
│   ├── db/            # Database queries and connection
│   └── payments.ts    # Razorpay payment integration
│
├── devpulse-frontend/   # Next.js Dashboard (Product UI)
│   └── app/           # Main application pages
│       ├── dashboard/  # Real-time monitoring dashboard
│       ├── collections/# API collection management
│       ├── scanning/   # Security scanning interface
│       ├── analytics/  # Token usage analytics
│       ├── team/       # Team management
│       └── admin/      # Admin dashboard
│
├── client/            # Vite React Marketing Site
│   └── src/           # Landing pages, pricing, about
│
├── drizzle/           # Database schema and migrations
├── shared/            # Shared types and constants
└── docker-compose.prod.yml  # Production deployment
```

### Frontend Structure Clarification

| Directory            | Framework    | Purpose                                                                               | Auth Required |
| -------------------- | ------------ | ------------------------------------------------------------------------------------- | ------------- |
| `devpulse-frontend/` | Next.js 14+  | **Main Product Dashboard** - Collections, scanning, analytics, team management, admin | Yes           |
| `client/`            | Vite + React | **Marketing Website** - Landing page, pricing, about, contact                         | No            |

**Note:** The `devpulse-frontend/` directory contains the actual DevPulse product interface. The `client/` directory is the public-facing marketing website.

### Backend Architecture

**Single Backend: Node.js + tRPC**

The application uses a single Node.js backend with tRPC for type-safe API calls:

- **Auth:** JWT-based authentication with Google OAuth support
- **Database:** MySQL with Drizzle ORM
- **Real-time:** WebSocket for live updates
- **Payments:** Razorpay integration for subscriptions
- **Security:** OWASP Top 10 scanning, shadow API detection

**Retired:** The Python FastAPI backend (`devpulse-backend/`) has been retired and should be deleted for cleanliness. All functionality has been migrated to the Node.js backend.

## Security Notes

- See `security-patch.md` for details on security vulnerabilities discovered during audit
- Password hashing has been updated to PBKDF2-SHA512 (100k iterations)
- Webhook signature verification handles edge cases properly
- WebSocket authentication now verifies sessions server-side

## Configuration

Environment variables:

- `DATABASE_URL` - PostgreSQL connection string
- `SECRET_KEY` - JWT signing secret
- `GITHUB_WEBHOOK_SECRET` - GitHub webhook verification secret

## Security & Compliance

DevPulse is designed with privacy-by-design principles:

- **PII Redaction** - Automatically scrubs sensitive data before LLM transmission
- **Audit Logs** - All API interactions are logged for SOC2 compliance
- **Data Residency** - Self-hostable option for on-premise deployments

## License

Copyright (c) 2024 DevPulse Inc. All rights reserved.

MIT License - see LICENSE file for details.
