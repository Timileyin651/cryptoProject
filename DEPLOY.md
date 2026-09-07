# Production Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [Environment Configuration](#environment-configuration)
4. [SSL/TLS Certificates](#ssltls-certificates)
5. [Deploy](#deploy)
6. [Database Migrations](#database-migrations)
7. [Backups](#backups)
8. [Monitoring & Health Checks](#monitoring--health-checks)
9. [Logs](#logs)
10. [Rollback Procedure](#rollback-procedure)
11. [Graceful Shutdown](#graceful-shutdown)
12. [Hosting Limitations — Free Tier](#hosting-limitations--free-tier)
13. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A Linux VPS with at least **2 vCPU / 2 GB RAM** (4 GB recommended)
- A domain name pointed at your server's IP
- Basic firewall (UFW or similar)

---

## Server Setup

### 1. Provision a VPS

Recommended providers and minimum specs:

| Provider | Plan | vCPU | RAM | Storage | Monthly |
|----------|------|------|-----|---------|---------|
| Hetzner CX22 | Shared | 2 | 4 GB | 40 GB | ~€5 |
| DigitalOcean | Basic | 2 | 2 GB | 50 GB | $12 |
| AWS EC2 | t3.small | 2 | 2 GB | 20 GB | ~$15 |
| Vultr | Regular | 2 | 2 GB | 50 GB | $12 |

### 2. Install Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo apt install docker-compose-plugin

# Verify
docker --version
docker compose version
```

### 3. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 4. Clone the repo

```bash
git clone <your-repo-url> /opt/scanner
cd /opt/scanner
git checkout <release-tag>
```

---

## Environment Configuration

```bash
# Copy the production template
cp deploy/.env.production.example .env

# Edit with real values
nano .env
```

**Required secrets** (generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`):

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Random 32+ char hex string |
| `JWT_REFRESH_SECRET` | Random 32+ char hex string |
| `DB_PASSWORD` | Strong MySQL password |
| `DB_ROOT_PASSWORD` | MySQL root password |
| `REDIS_PASSWORD` | Strong Redis password |
| `CORS_ORIGIN` | `https://yourdomain.com` |
| `PAYSTACK_SECRET_KEY` | Live Paystack secret key |
| `PAYSTACK_WEBHOOK_SECRET` | Paystack webhook signing secret |

> **Never commit `.env` to version control.** The `.gitignore` already excludes it.

---

## SSL/TLS Certificates

### Option A: Certbot (automated, included in docker-compose.prod.yml)

The production compose includes a Certbot service that auto-renews certificates.

**Initial setup:**

```bash
# Create certbot directory
mkdir -p deploy/nginx/certs

# First-time certificate request (stop nginx first)
docker compose -f docker-compose.prod.yml up -d --build nginx
docker compose -f docker-compose.prod.yml exec nginx certbot certonly \
  --webroot -w /var/www/certbot \
  -d yourdomain.com \
  --agree-tos \
  --email you@email.com

# Restart nginx with the new cert
docker compose -f docker-compose.prod.yml restart nginx
```

### Option B: External TLS termination

If using a cloud load balancer (AWS ALB, Cloudflare, etc.), terminate TLS at the edge and point the LB to port 80 on your server. Update `nginx.conf` to serve HTTP only and remove the SSL block.

---

## Deploy

### First deployment

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# Verify all containers are running
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f app
```

Migrations run **automatically** on app startup in production.

### Subsequent deployments

```bash
# Pull latest code
git fetch --tags
git checkout <new-tag>

# Build and restart (zero-downtime with rolling update)
docker compose -f docker-compose.prod.yml up -d --build app

# Verify
docker compose -f docker-compose.prod.yml ps
curl -s https://yourdomain.com/api/v1/health/ready | jq .
```

---

## Database Migrations

Migrations run automatically on app startup when `NODE_ENV=production`.

### Manual migration run

```bash
# Run pending migrations
docker compose -f docker-compose.prod.yml exec app node dist/config/migrate.js

# Undo last migration
docker compose -f docker-compose.prod.yml exec app node dist/config/migrate.js --undo
```

### Migration files

Located in `migrations/` directory. Named with timestamps for ordered execution:

```
migrations/
├── 20240301000001-create-subscription-plans.ts
├── 20240401000001-enhance-exchanges.ts
├── 20240501000001-create-opportunity-tables.ts
├── ...
└── 20240601000001-add-performance-indexes.ts
```

---

## Backups

### Automated backups

The `backup` service in `docker-compose.prod.yml` runs daily at 02:00 UTC.

- Backups are stored as compressed SQL dumps: `/backups/crypto_arbitrage_YYYYMMDD_HHMMSS.sql.gz`
- Retention: 14 days by default (configurable via `BACKUP_RETENTION_DAYS`)
- Backups are stored in a Docker volume (`backup_data`)

### Manual backup

```bash
docker compose -f docker-compose.prod.yml exec mysql \
  mysqldump -uroot -p"${DB_ROOT_PASSWORD}" \
  --single-transaction --routines --triggers --events \
  crypto_arbitrage | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore from backup

```bash
# Decompress
gunzip backup_20240515.sql.gz

# Restore
docker compose -f docker-compose.prod.yml exec -T mysql \
  mysql -uroot -p"${DB_ROOT_PASSWORD}" crypto_arbitrage < backup_20240515.sql
```

### Off-site backups

For production, copy backups to external storage:

```bash
# Example: upload to S3
aws s3 cp /backups/crypto_arbitrage_*.sql.gz s3://your-backup-bucket/scanner/
```

---

## Monitoring & Health Checks

### Endpoints

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `GET /health` | Simple liveness (load balancers) | None |
| `GET /health/live` | Kubernetes liveness probe | None |
| `GET /health/ready` | Readiness probe (DB, Redis, exchanges) | None |
| `GET /health/detailed` | Full diagnostics (memory, circuit breakers) | None |
| `GET /metrics` | Prometheus scrape endpoint | None |

### Prometheus/Grafana

The `/metrics` endpoint exposes standard Prometheus format. Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'scanner'
    static_configs:
      - targets: ['your-server:3000']
    metrics_path: '/metrics'
```

Key metrics to alert on:

- `http_requests_total` with `status="500"` — spike in server errors
- `exchange_connection_health` = 0 — exchange adapter down
- `db_errors_total` — increasing — database issues
- `process_memory_rss_bytes` — climbing — potential memory leak

---

## Logs

### Docker logs

```bash
# Follow app logs
docker compose -f docker-compose.prod.yml logs -f app

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail 100 app

# All services
docker compose -f docker-compose.prod.yml logs --tail 50
```

### Log files (inside container)

In production, structured JSON logs are written to `/app/logs/`:

- `app-YYYY-MM-DD.log` — all logs (14-day rotation, 20MB max)
- `error-YYYY-MM-DD.log` — errors only (30-day rotation, 20MB max)

**Secrets are never logged.** The `redactFormat()` in `src/utils/logRedaction.ts` scrubs passwords, JWT secrets, Paystack keys, and exchange credentials from all log output.

### Log drivers

Production compose uses `json-file` with rotation:

```yaml
logging:
  driver: json-file
  options:
    max-size: "20m"
    max-file: "10"
```

---

## Rollback Procedure

### Quick rollback (< 5 minutes)

```bash
# 1. Stop current version
docker compose -f docker-compose.prod.yml down

# 2. Checkout previous version
git fetch --tags
git checkout <previous-tag>

# 3. Rebuild and start
docker compose -f docker-compose.prod.yml up -d --build

# 4. Verify
curl -s https://yourdomain.com/api/v1/health/ready | jq .
```

### Database rollback

If a migration introduced a breaking schema change:

```bash
# Undo the last migration
docker compose -f docker-compose.prod.yml exec app node dist/config/migrate.js --undo

# Or restore from backup (see Backups section)
```

### Emergency: restore from backup

```bash
# 1. Stop the app
docker compose -f docker-compose.prod.yml stop app

# 2. Restore database
docker compose -f docker-compose.prod.yml exec -T mysql \
  mysql -uroot -p"${DB_ROOT_PASSWORD}" crypto_arbitrage < backup.sql

# 3. Checkout previous version
git checkout <previous-tag>

# 4. Rebuild and start
docker compose -f docker-compose.prod.yml up -d --build
```

### Health check after rollback

```bash
# Wait 15 seconds for startup
sleep 15

# Check readiness
curl -s https://yourdomain.com/api/v1/health/ready | jq .

# Check exchange connections
curl -s https://yourdomain.com/api/v1/health/detailed | jq '.services.exchanges'

# Check memory usage
curl -s https://yourdomain.com/api/v1/health/detailed | jq '.memory'
```

---

## Graceful Shutdown

The application handles `SIGTERM` and `SIGINT` for graceful shutdown:

1. Stops accepting new HTTP connections
2. Cancels pending notification retries
3. Stops all arbitrage engines (5s timeout per engine)
4. Closes WebSocket connections
5. Destroys Redis caches and pub/sub
6. Closes MySQL connection
7. Closes Redis connection
8. Exits with code 0

Docker is configured with `stop_grace_period: 15s` to allow the process time to shut down cleanly.

---

## Hosting Limitations — Free Tier

### ⚠️ Why free-tier services are unsuitable for a production scanner

This application is a **continuously-running service** that:
- Maintains persistent WebSocket connections to users
- Polls exchange APIs every 5 seconds (arbitrage scanner)
- Holds MySQL connection pools open
- Keeps Redis connections alive for caching
- Processes Paystack webhooks asynchronously

**Any platform that sleeps, pauses, or kills idle processes will break this.**

### Heroku (Free/Eco/Essential tiers)

| Limitation | Impact |
|-----------|--------|
| **60 min idle sleep** | App sleeps after 60 min without HTTP traffic. WebSocket connections drop. Scanner stops. |
| **24 hr restart on Eco** | Process restarted daily. All in-memory state (circuit breakers, caches) is lost. |
| **512 MB RAM** | Node.js + ccxt + MySQL pool can exceed this during scans. |
| **No persistent disk** | Log files and backups are lost on dyno restart. |
| **Connection limits** | Free tier: 500-1000 concurrent connections. Scanner exhausts this quickly. |

**Verdict: Not suitable.** The scanner must run continuously. Heroku Eco/Essential ($5-8/mo) is marginally better but still has 30 min idle timeout on some tiers.

### Railway

| Limitation | Impact |
|-----------|--------|
| **$5 free credit** | Exhausted in ~5 days on the $5/month hobby plan. |
| **No always-on guarantee** | Free tier apps can be paused if credit runs out. |
| **Sleep on idle** | Hobby plan sleeps after inactivity. |

**Verdict: Not suitable on free tier.** The $5/month plan (with credit) works for development, not production.

### Render (Free tier)

| Limitation | Impact |
|-----------|--------|
| **15 min idle timeout** | Service sleeps after 15 min of no requests. |
| **512 MB RAM** | Insufficient for Node.js + ccxt + WebSocket. |
| **No persistent storage** | Logs and data lost on redeploy. |
| **Shared CPU** | Extremely slow during heavy scans. |

**Verdict: Not suitable.** Render's paid plans ($7+/mo) remove sleep but are still limited for this workload.

### Vercel

| Limitation | Impact |
|-----------|--------|
| **Serverless only** | No long-running processes. Each request is a cold start. |
| **10s execution limit** | Arbitrage scans take longer. |
| **No WebSocket support** | Cannot maintain persistent connections. |
| **No MySQL** | Requires external database (adds latency). |

**Verdict: Completely unsuitable.** Vercel is for serverless functions, not persistent services.

### Cloudflare Workers

| Limitation | Impact |
|-----------|--------|
| **30s CPU time** | Cannot run long-running scans. |
| **No persistent state** | Every invocation is stateless. |
| **No Node.js APIs** | Cannot use `ioredis`, `mysql2`, `sequelize`, `ccxt`. |

**Verdict: Completely unsuitable.**

### Glitch

| Limitation | Impact |
|-----------|--------|
| **5 min idle sleep** | Free tier sleeps after 5 min of inactivity. |
| **Limited CPU** | Shared, throttled CPU. |
| **No Docker** | Cannot run MySQL/Redis containers. |

**Verdict: Not suitable.**

### What works: Recommended hosting

| Platform | Plan | Price | Why it works |
|----------|------|-------|-------------|
| **Hetzner Cloud** | CX22 | €5/mo | 2 vCPU, 4 GB RAM, 40 GB SSD. No sleep. Full Docker. |
| **DigitalOcean** | Droplet | $12/mo | 2 vCPU, 2 GB RAM. App Platform adds $12/mo for managed Docker. |
| **AWS EC2** | t3.small | ~$15/mo | 2 vCPU, 2 GB RAM. T3 burstable handles scan spikes. |
| **Vultr** | Regular | $12/mo | 2 vCPU, 2 GB RAM. Global regions. |
| **Oracle Cloud** | Always Free | $0 | ARM 4 OCPU / 24 GB RAM. **Best free option** — but requires manual Docker setup. |

> **Oracle Cloud Free Tier** is the only free option that works: always-on ARM instances with 4 OCPU and 24 GB RAM. No sleep, no idle timeout. Requires manual server setup (no managed platform).

---

## Troubleshooting

### App won't start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs app

# Common issues:
# - "JWT_SECRET must be set" → fill in .env
# - "Unable to connect to database" → check DB_PASSWORD, DB_ROOT_PASSWORD
# - "Cannot find module" → rebuild with --build
```

### Database connection refused

```bash
# Check MySQL health
docker compose -f docker-compose.prod.yml exec mysql mysqladmin ping

# Check credentials
docker compose -f docker-compose.prod.yml exec mysql \
  mysql -uroot -p"${DB_ROOT_PASSWORD}" -e "SELECT 1"
```

### Redis connection refused

```bash
# Check Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli ping

# With password
docker compose -f docker-compose.prod.yml exec redis \
  redis-cli -a "${REDIS_PASSWORD}" ping
```

### High memory usage

```bash
# Check container stats
docker stats

# Check app memory via health endpoint
curl -s https://yourdomain.com/api/v1/health/detailed | jq '.memory'
```

### Backup not running

```bash
# Check backup logs
docker compose -f docker-compose.prod.yml logs backup

# Manual backup
docker compose -f docker-compose.prod.yml exec backup sh /usr/local/bin/backup.sh
```
