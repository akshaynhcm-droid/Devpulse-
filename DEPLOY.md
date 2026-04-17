# Deploying DevPulse to production

This guide covers three deployment paths, easiest → most flexible:

1. **Self-hosted via Docker Compose** (one VPS, one command)
2. **Fly.io** (managed container platform)
3. **Railway** (managed container platform with built-in MySQL + Redis)

All three expect a domain pointed at the host and TLS terminated by the platform (Fly / Railway) or a reverse proxy (Caddy / Traefik / nginx) in front of the compose stack.

---

## 0. Prerequisites (all paths)

- Node.js 22+ (only for local verification)
- pnpm 10+
- A Razorpay account (Key ID + Key Secret + Webhook Secret) — required for payments
- An SMTP provider (Resend / SendGrid / SES / Postmark) — required for invites + password resets
- A Google OAuth 2.0 client (Client ID + Secret) — required if you keep Google sign-in
- _(Optional)_ Sentry DSN for error monitoring, Slack webhook for kill-switch alerts, S3 bucket for backups/exports

Copy `.env.example` → `.env` and fill in every non-optional value. Generate `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The server runs `validateEnvironment()` at boot and will refuse to start if any production-critical variable is missing.

---

## 1. Self-host with Docker Compose (recommended for first launch)

**What you get:** DevPulse app + MySQL 8 + Redis 7, all orchestrated, all persistent via named volumes.

```bash
# Clone and configure
git clone <your-fork> devpulse
cd devpulse
cp .env.example .env
$EDITOR .env  # at minimum: JWT_SECRET, APP_URL, RAZORPAY_*, GOOGLE_*, SMTP_*

# Start
docker compose up -d --build

# Apply DB schema (only once per fresh DB)
docker compose exec app pnpm db:push

# Tail logs
docker compose logs -f app
```

App is now live on `http://<host>:3000`. The `docker-compose.yml` expects `JWT_SECRET` to be set in `.env`.

### Front with Caddy (free automatic HTTPS)

```caddyfile
# /etc/caddy/Caddyfile
devpulse.example.com {
  reverse_proxy localhost:3000
}
```

`systemctl reload caddy` and you're on TLS.

### Front with nginx (bring your own cert)

```nginx
server {
  listen 443 ssl http2;
  server_name devpulse.example.com;
  ssl_certificate     /etc/letsencrypt/live/devpulse.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/devpulse.example.com/privkey.pem;

  location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }
}
```

Make sure your `.env` has `APP_URL=https://devpulse.example.com` and `FRONTEND_URL=https://devpulse.example.com` so password-reset + OAuth callbacks resolve correctly.

### Updating

```bash
git pull
docker compose build app
docker compose up -d app
docker compose exec app pnpm db:push   # only if drizzle/ changed
```

### Backups

DB: `docker compose exec mysql mysqldump -u root -p$MYSQL_ROOT_PASSWORD $MYSQL_DATABASE | gzip > backup-$(date +%F).sql.gz`
The `scripts/backup.sh` helper wraps this and uploads to S3 (uses `S3_BACKUP_BUCKET` from `.env`).

---

## 2. Deploy to Fly.io

```bash
# One-time
fly auth login
fly launch --no-deploy --name devpulse                 # creates fly.toml
fly volumes create devpulse_data --size 10             # (optional) for local SQLite/state

# Attach managed MySQL (PlanetScale or Aiven work well; fly-mysql deprecated)
# Copy its connection string into DATABASE_URL

# Attach Upstash Redis or another managed Redis
# Copy its URL into REDIS_URL

# Set secrets
fly secrets set \
  JWT_SECRET="$(node -e 'console.log(require(\"crypto\").randomBytes(48).toString(\"hex\"))')" \
  DATABASE_URL="..." \
  REDIS_URL="..." \
  RAZORPAY_KEY_ID="..." \
  RAZORPAY_KEY_SECRET="..." \
  RAZORPAY_WEBHOOK_SECRET="..." \
  GOOGLE_CLIENT_ID="..." \
  GOOGLE_CLIENT_SECRET="..." \
  SMTP_HOST="smtp.resend.com" \
  SMTP_USER="resend" \
  SMTP_PASS="..." \
  SMTP_FROM="DevPulse <noreply@example.com>" \
  APP_URL="https://devpulse.fly.dev"

fly deploy
fly ssh console -C "pnpm db:push"   # migrate
```

Make sure your `fly.toml` has `internal_port = 3000` and at least one machine with 512 MB RAM. Scale with `fly scale count 2` once traffic warrants.

---

## 3. Deploy to Railway

Railway gives you MySQL + Redis + app in one project.

1. Create a new project → "Deploy from GitHub repo" → pick your DevPulse fork.
2. Add **MySQL** plugin, add **Redis** plugin.
3. In the app service → Variables tab → click "Add Reference" to pull `DATABASE_URL` from MySQL and `REDIS_URL` from Redis.
4. Set the remaining variables from `.env.example`. At minimum: `JWT_SECRET`, `APP_URL`, `RAZORPAY_*`, `GOOGLE_*`, `SMTP_*`.
5. Set the service start command to `pnpm start` (build is already handled by the Dockerfile).
6. Deploy. When it's green, run `pnpm db:push` once via the Railway shell.

---

## 4. After first deploy

1. **Create your admin user.** The first account that signs up is automatically promoted to `admin` (see `server/api/onboarding.ts`). Alternatively run:
   ```bash
   docker compose exec app node --loader tsx scripts/create-admin.ts you@example.com "Your Name" "a-strong-password"
   ```
2. **Configure Razorpay webhooks.** In the Razorpay dashboard, add webhook `https://<your-domain>/api/webhooks/razorpay` listening on `payment.captured`, `payment.failed`, `subscription.cancelled`. Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`.
3. **Verify `/api/health`** returns `{"status":"ok","db":"connected","redis":"connected"}`.
4. **Import a Postman collection** from the dashboard and run a scan to smoke-test end to end.

---

## 5. Observability checklist

- `GET /api/health` — liveness (checks DB + Redis)
- `GET /metrics` — Prometheus metrics (requests, latency, scan counts)
- Sentry — set both `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (dashboard)
- Slack — set `SLACK_WEBHOOK_URL` so kill-switch events alert your team
- Structured logs — pino output goes to stdout; pipe to your aggregator (Loki, Datadog, CloudWatch)

---

## 6. Rolling back

Every deploy builds a new image; keep at least the last 3 tags around.

```bash
# Docker Compose
git checkout <previous-good-commit>
docker compose build app
docker compose up -d app

# Fly.io
fly releases
fly releases rollback <version>

# Railway
# Use the "Rollback" button on the deployment you want to revert to.
```

---

## Troubleshooting

| Symptom                                  | Fix                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `JWT_SECRET missing` at boot             | Regenerate and set via secrets/`.env`, must be ≥ 32 chars                              |
| `/api/health` shows `db: disconnected`   | Confirm `DATABASE_URL` and that the DB is reachable from the app pod                   |
| Login succeeds but cookies don't stick   | Set `APP_URL` to the public HTTPS URL so the session cookie is scoped correctly        |
| Razorpay webhook 400 "Invalid signature" | Check `RAZORPAY_WEBHOOK_SECRET` matches the dashboard exactly (no trailing whitespace) |
| Email invites not sending                | Inspect logs for `[Email]` lines — SMTP creds are the usual culprit                    |

If you hit anything else, open an issue with the request ID from the failing response.
