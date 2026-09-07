# Crypto Arbitrage Scanner

Production-oriented cryptocurrency arbitrage scanner with a React SPA frontend, real-time exchange data, spot and funding-rate arbitrage, tiered subscriptions, and alerts.

## Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8.0
- Redis 7
- Docker & Docker Compose (for production)

### Local Development (two servers)

```bash
# 1. Clone and install
git clone <repo-url> && cd crypto-arbitrage-scanner
npm install
cd client && npm install && cd ..

# 2. Set up environment
cp .env.example .env
# Edit .env — generate JWT secrets:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Start MySQL + Redis (Docker)
docker compose up -d mysql redis

# 4. Run migrations
npm run migrate

# 5. Seed initial data (plans, entitlements)
npm run seed

# 6. Start both servers
# Terminal 1 — Backend (port 3000)
npm run dev

# Terminal 2 — Frontend (port 5173, proxies to backend)
cd client && npm run dev
```

Open `http://localhost:5173` — the React app proxies API calls to the backend.

### Docker Production

```bash
cp deploy/.env.production.example .env
# Fill in secrets in .env

docker compose -f docker-compose.prod.yml up -d --build
```

See [DEPLOY.md](./DEPLOY.md) for full deployment guide, rollback procedures, and hosting recommendations.

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the complete architecture report including module map, end-to-end flow verification, test coverage summary, and security analysis.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + React Router + React Query |
| Backend | Node.js 20 + TypeScript + Express 4 |
| Database | MySQL 8 + Sequelize 6 |
| Cache | Redis 7 + IORedis 5 |
| Real-time | Socket.IO 4 (server → React SPA) |
| Exchange data | CCXT 4 (7 exchanges — live order books, not mocked) |
| Payments | Paystack API |
| Auth | JWT (httpOnly refresh cookie + memory access token) + bcrypt |
| Testing | Jest 29 + Supertest |
| Logging | Winston + daily rotate with secret redaction |
| Metrics | Prometheus-compatible endpoint |

### Supported Exchanges (Live Data)

Binance, Bybit, OKX, KuCoin, Gate.io, MEXC, Bitget

All exchange data is **live via CCXT** — no demo/mock data. The scanner fetches real order books, calculates real spreads, and pushes updates over Socket.IO.

### Frontend (React SPA)

The `client/` directory contains the React frontend:

- **Auth**: JWT access token stored in memory, refresh token in httpOnly cookie
- **Scanner**: Live opportunity table with Socket.IO updates, row flash on price changes
- **Design system**: "Amber Ledger" tokens (amber accent, green/red for buy/sell only, skeleton shimmer, pill badges)
- **Data fetching**: React Query for REST calls, socket.io-client for live feeds

### Backend (unchanged)

All business logic remains in `src/controllers`, `src/services`, `src/repositories`. The React SPA (`client/`) is the sole frontend — no server-side rendering.

---

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Simple health check |
| GET | `/health/live` | Kubernetes liveness probe |
| GET | `/health/ready` | Readiness probe (DB, Redis, exchanges) |
| GET | `/metrics` | Prometheus metrics |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register new account |
| POST | `/api/v1/auth/login` | Login (returns JWT) |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Logout (revoke refresh token) |

### Scanner (plan-gated)

| Method | Endpoint | Auth | Plan |
|--------|----------|------|------|
| GET | `/api/v1/arbitrage/opportunities` | Optional | Free+ (with limits) |
| GET | `/api/v1/funding/rates` | Yes | Pro |
| GET | `/api/v1/funding/opportunities` | Yes | Pro |
| GET | `/api/v1/analytics/overview` | Yes | Basic+ |
| POST | `/api/v1/calculator/spread` | Yes | Basic+ |

### Billing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/billing/webhook` | Paystack webhook (no auth) |
| GET | `/api/v1/billing/plans` | List plans |
| POST | `/api/v1/billing/checkout` | Initialize checkout |

---

## Testing

```bash# Run all tests (752 tests across 53 suites)npm test

# With coverage
npm run test:coverage
```

No live exchange calls in CI — all external dependencies are mocked.

---

## Project Structure

```
crypto-arbitrage-scanner/
├── client/                   React SPA (Vite + TypeScript)
│   ├── src/
│   │   ├── lib/              API client, Socket.IO, auth context
│   │   ├── components/       Layout, ProtectedRoute
│   │   ├── pages/            Login, Register, Scanner, Pricing
│   │   └── styles/           Amber Ledger design tokens + components
│   └── package.json
├── src/                      Backend (Express + TypeScript)
│   ├── arbitrage/            Spot arbitrage engine (live order books)
│   ├── funding/              Funding-rate arbitrage engine
│   ├── exchanges/            7 CCXT exchange adapters
│   ├── services/             22 business logic services
│   ├── controllers/          14 API controllers
│   ├── middleware/            Auth, rate limits, feature gates
│   ├── models/               30 Sequelize models
│   └── utils/                Logger, metrics, redaction
├── migrations/               18 database migrations
├── tests/                    53 test suites (752 tests)
├── deploy/                   Production configs (Nginx, backup, MySQL)
├── Dockerfile                Multi-stage build (backend + frontend)
├── docker-compose.prod.yml   Production stack
├── DEPLOY.md                 Deployment guide
├── ARCHITECTURE.md           Full architecture report
└── README.md                 This file
```

---

## License

MIT
