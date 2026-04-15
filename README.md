# DevPulse Enterprise

**DevPulse** is the security and operations layer for production AI agents. It provides real-time security scanning, cost anomaly detection, cost forecasting, and PII redaction for production LLM applications.

[![CI/CD Pipeline](https://github.com/yourname/devpulse/actions/workflows/deploy.yml/badge.svg)](https://github.com/yourname/devpulse/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Real-time Cost Monitoring** - Track LLM spending across all agents with WebSocket updates
- **Anomaly Detection** - Automatically detect cost spikes and unusual usage patterns
- **Shadow API Detection** - Find undocumented endpoints in your codebase
- **Cost Forecasting** - Predict your AI spend before the invoice arrives
- **GitHub Integration** - Webhook-based security scanning on push/PR events
- **VS Code Extension** - Inline security warnings directly in your editor

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Python 3.9+

### Installation

1. **Clone the repo**

   ```bash
   git clone https://github.com/yourname/devpulse.git
   cd devpulse
   ```

2. **Start the Backend**

   ```bash
   cd devpulse-backend
   pip install -r requirements.txt
   python main.py
   ```

3. **Start the Frontend**

   ```bash
   cd devpulse-frontend
   npm install
   npm run dev
   ```

4. **Access the Dashboard**
   - Frontend: http://localhost:3000
   - API Docs: http://localhost:8000/docs

### Using Docker Compose

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## API Documentation

### Core Endpoints

- `POST /api/agent/interact` - Submit LLM calls for monitoring
- `GET /api/analytics/summary` - Get cost summary and security events
- `POST /api/security/scan` - Scan code for security issues
- `POST /api/webhooks/github` - Handle GitHub webhook events
- `WS /ws` - WebSocket for real-time dashboard updates

### Example: Submit LLM Call

```bash
curl -X POST http://localhost:8000/api/agent/interact \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "my-agent",
    "model": "gpt-4",
    "prompt_tokens": 1000,
    "completion_tokens": 500
  }'
```

## Architecture

```
devpulse-backend/
  ├── main.py              # FastAPI application
  ├── database.py         # SQLite/PostgreSQL persistence
  ├── websocket_manager.py # Real-time connections
  └── services/
      ├── cost_tracker.py      # Cost calculation & anomaly detection
      ├── shadow_api_detector.py # Security scanning
      └── github_integration.py  # Webhook handling

devpulse-frontend/
  ├── app/
  │   ├── page.tsx        # Landing page
  │   └── dashboard/     # Real-time dashboard
  └── components/
      └── RiskChart.tsx   # Data visualization
```

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
