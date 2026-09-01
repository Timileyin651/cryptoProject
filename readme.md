# Crypto Arbitrage Scanner — Freebuff Development Prompt Pack (v2)

**Stack:** Node.js + TypeScript + Express (MVC) + **EJS** (server-rendered views) + **MySQL** + Sequelize (or Knex) + Redis + Socket.IO + CCXT + Paystack

Changes from v1: Flutter removed, Prisma/PostgreSQL replaced with Sequelize/MySQL, mobile-app phases (17–19) replaced with EJS server-rendered UI phases. Gap phases added for funding/perpetuals arbitrage, spread calculator, and exchange-reference pages, based on a comparison against the public feature set of the live commercial product being used as a functional reference. New-listings calendar, wallet/address analytics, NFT scanner, AI assistant, and the Telegram/Reddit message-monitoring tool are **out of scope for this build** — each is a separate, large subsystem (on-chain indexing infra, LLM pipeline, etc.) and is listed at the bottom as a future roadmap, not a phase to build now.

**Scope note (carried from v1, still true):** Recreate equivalent *functionality*, not proprietary source code, branding, copy, or design assets. Do not claim your Free/Premium limits are identical to any commercial product's — verify and set your own.

---

## Development Rules
- Backend: Node.js + TypeScript only. No Python/FastAPI/Django.
- Express.js with proper MVC: controllers, services, repositories, validators, middleware, modular engines.
- MySQL + Sequelize (or Knex — pick one in Phase 1 and stay consistent) + Redis.
- Never commit Paystack keys, exchange secrets, JWT secrets, or DB passwords.
- Free/Premium authorization enforced server-side only — never trust the client.
- No fake prices, no fake arbitrage opportunities, ever — including in dev/demo mode (use clearly-labeled mock mode instead).
- Don't rewrite working modules when adding a new phase.
- After every phase: build, lint, test, review changed files, update README, report results.
- Use official exchange API docs; don't invent unsupported exchange capabilities.

## Checkpoint Rule (after every phase)
```
git status
git add .
git commit -m "Phase X - description"
git push
```
Do not proceed until the phase builds, tests pass, migrations are valid, no secrets are committed, and you understand what Freebuff changed.

---

## PHASE 1 — Node.js MVC Foundation (MySQL)
**COPY/PASTE INTO FREEBUFF**

Build the backend foundation for a production-oriented cryptocurrency arbitrage scanner.

Use ONLY Node.js, TypeScript, Express.js, MySQL, Sequelize ORM (or Knex — choose one and document the choice), Redis, REST API, Socket.IO-ready architecture, Jest, ESLint, Prettier.

Create:
```
src/config
src/controllers
src/models
src/routes
src/services
src/repositories
src/middleware
src/validators
src/utils
src/jobs
src/websocket
src/exchanges
src/arbitrage
src/payments
src/notifications
src/views/          <- EJS templates
src/public/         <- static CSS/JS/images
src/app.ts
src/server.ts
migrations/          <- Sequelize/Knex migrations
seeders/
tests
.env.example
.gitignore
package.json
tsconfig.json
Dockerfile
docker-compose.yml   <- app + mysql + redis
README.md
```

Configure `/api/v1` and `GET /api/v1/health` returning `{"status":"ok"}`. Configure MySQL connection pool, Sequelize/Knex, Redis, centralized error handling, logging, CORS, security middleware (helmet, rate limiting), and request validation. Set up `express-ejs-layouts` or equivalent and a base EJS layout (`views/layout.ejs`) with header/footer partials.

Do NOT implement exchange APIs, CCXT, arbitrage calculations, Paystack, authentication, subscriptions, notifications, or admin yet.

Install dependencies, run migrations against MySQL, build TypeScript, run tests, start the server, verify health endpoint and one placeholder EJS page render, fix errors, report final structure. No hard-coded secrets or fake data.

---

## PHASE 2 — Authentication and Users
**COPY/PASTE INTO FREEBUFF**

Implement secure user authentication without changing existing architecture.

Features: register, login, logout, access token, refresh token, password hashing (bcrypt/argon2), forgot password, reset password, email verification, profile, change password, account activation/deactivation.

Use secure password hashing, JWT, refresh-token rotation/revocation, validation, rate limiting.

Create `User` and required session/token models as Sequelize/Knex migrations + models.

API endpoints:
```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
POST /api/v1/auth/verify-email
GET  /api/v1/users/me
PATCH /api/v1/users/me
PATCH /api/v1/users/me/password
```

Also add EJS-rendered pages under `src/views/auth/`: register, login, forgot-password, reset-password — forms POST to the API endpoints above (or to thin controller routes that call the same services). Session/JWT stored in httpOnly cookie for the web UI.

Do not implement Paystack yet.

---

## PHASE 3 — Free/Premium/Enterprise Architecture
**COPY/PASTE INTO FREEBUFF**

Implement subscription and feature-entitlement architecture.

Plans: Free, Basic, Pro/Premium, Enterprise.

Create `subscription_plans`, `subscriptions`, `feature_entitlements`, `subscription_events` tables/models.

Support: current plan, active/inactive state, expiry, renewal-ready structure, cancellation, feature limits, usage counters.

Create backend feature-gate middleware/service, e.g. `requireFeature('ADVANCED_SCANNER')`.

Do not connect Paystack yet. Keep plan limits configurable in MySQL, not hard-coded anywhere in views.

---

## PHASE 4 — Exchange/Coin/Network Data Model
**COPY/PASTE INTO FREEBUFF**

Create the data model and service architecture for exchanges, coins/assets, blockchain networks, trading pairs, exchange markets, and market metadata.

Support: exchange capabilities, deposit status, withdrawal status, trading fees, withdrawal fees, min/max withdrawal, network availability, symbol mappings.

Create an `ExchangeAdapter` interface.

Do not build live price collection yet.

---

## PHASE 5 — CCXT Exchange Integration
**COPY/PASTE INTO FREEBUFF**

Implement exchange integration using CCXT.

Start with Binance, Bybit, and OKX. Then add KuCoin, Gate.io, MEXC, Bitget.

Create a common adapter interface implementing the Phase 4 `ExchangeAdapter`.

Where supported: load markets, tickers, order books, trading fees, currencies/networks, deposit/withdrawal status, market metadata.

Handle rate limits and exchange errors. Do not invent unsupported capabilities — store capability availability per exchange. Use mocked responses for automated tests; never call live exchanges in CI. Do not store public-market-data "secrets" (there aren't any — don't fabricate auth requirements).

---

## PHASE 6 — Real-Time Market Data
**COPY/PASTE INTO FREEBUFF**

Build the real-time market data engine.

Use official exchange WebSockets where available. Implement automatic reconnect, heartbeat handling, rate-limit awareness, connection health tracking, symbol normalization, bid/ask, last price, volume, timestamps.

Use Redis for latest market state (hash per symbol/exchange).

Create a normalized internal market-data format independent of exchange-specific responses.

A disconnected exchange must not stop the whole scanner — isolate failures per adapter.

Start with Binance, Bybit, OKX; extend to configured exchanges. Do not calculate arbitrage yet.

---

## PHASE 7 — Order Book and Liquidity
**COPY/PASTE INTO FREEBUFF**

Implement order-book and liquidity analysis.

Support: best bid, best ask, bid/ask quantity, depth levels, executable quantity, slippage estimation.

Create `OrderBookNormalizer`, `LiquidityChecker`, `SlippageCalculator`.

The scanner must not treat a large theoretical spread as fully executable when order-book liquidity can't support the trade size.

Add deterministic tests with mocked order books.

---

## PHASE 8 — Spot Arbitrage Engine
**COPY/PASTE INTO FREEBUFF**

Implement the core cross-exchange spot arbitrage engine.

For each comparable pair:
1. Find cheapest executable buy.
2. Find highest executable sell.
3. Calculate gross spread.
4. Calculate buy fee.
5. Calculate sell fee.
6. Calculate withdrawal/network costs where relevant.
7. Estimate slippage.
8. Calculate net profit.
9. Calculate ROI.
10. Check liquidity.
11. Check deposit/withdrawal availability where applicable.
12. Timestamp the calculation.
13. Assign opportunity status.

Create `ArbitrageEngine`, `OpportunityCalculator`, `FeeCalculator`, `LiquidityChecker`, `NetworkChecker`, `OpportunityRanker`.

Use order-book prices, not last-traded price. No fake prices.

---

## PHASE 9 — Funding-Rate & Spot–Futures Arbitrage Engine *(NEW — gap fill)*
**COPY/PASTE INTO FREEBUFF**

Implement spot+futures / futures+futures arbitrage and funding-rate tracking as a second, distinct engine from Phase 8 (do not merge — they have different math and different risk profile).

For each supported exchange/pair with a perpetual futures market:
1. Pull spot price and perpetual futures price.
2. Pull current and historical funding rate (typically 8h interval — confirm per exchange via CCXT/exchange docs, do not assume a fixed interval for all exchanges).
3. Calculate spot–futures basis spread.
4. Calculate expected funding income/cost over a configurable holding horizon.
5. Combine basis convergence estimate + funding accrual into a net expected return.
6. Apply trading fees for both legs.
7. Flag positions as "long spot / short perp" or the inverse, and clearly label leverage assumption (default 1x — matches typical risk-conscious framing).
8. Store funding-rate history per exchange/pair for later charting (Phase 12 extension).

Create `FundingRateService`, `BasisSpreadCalculator`, `FundingArbitrageEngine`. Reuse `FeeCalculator`/`LiquidityChecker` from Phase 7/8 where applicable — do not duplicate logic.

Endpoints:
```
GET /api/v1/funding/rates
GET /api/v1/funding/opportunities
```

Label all outputs as estimates. Do not imply guaranteed returns — funding rates change and basis can move against the position.

---

## PHASE 10 — Opportunity Database and API
**COPY/PASTE INTO FREEBUFF**

Persist and expose arbitrage opportunities (both spot and funding/perp types from Phases 8–9).

Create models for opportunities, snapshots/history, exchange legs, fees, networks, profit calculations — with an `opportunity_type` discriminator (`spot`, `funding`).

Endpoints:
```
GET /api/v1/arbitrage/opportunities
GET /api/v1/arbitrage/opportunities/:id
GET /api/v1/arbitrage/history
GET /api/v1/arbitrage/stats
```

Support pagination, sorting, search, minimum profit, exchange, coin, pair, network, liquidity, volume, deposit status, withdrawal status, opportunity type, updated time.

Return normalized JSON. Also add an EJS-rendered `views/arbitrage/opportunities.ejs` table view consuming the same data server-side, with client-side polling or Socket.IO for live updates.

---

## PHASE 11 — Filters and User Preferences
**COPY/PASTE INTO FREEBUFF**

Implement scanner filters and saved preferences.

Filters: min/max spread, min net profit, min volume, exchange, coin, pair, network, deposit status, withdrawal status, liquidity, opportunity type (spot/funding), stablecoin pairs, fiat pairs where supported.

Users can save scanner preferences (stored per-user in MySQL).

Enforce plan limits server-side — Free users only receive what their plan allows, even if they manipulate query params directly.

---

## PHASE 12 — Opportunity Details and Profit Calculator
**COPY/PASTE INTO FREEBUFF**

Build detailed opportunity view and a standalone profit/spread calculator (this covers the "spread calculator" tool as its own reusable feature, not just an opportunity-detail sub-view).

Opportunity detail shows, where available: coin, pair, buy exchange, sell exchange, buy price, sell price, executable quantity, gross spread, buy fee, sell fee, withdrawal fee, network, slippage estimate, gross profit, net profit, ROI, liquidity, volume, deposit/withdrawal status, funding rate (if applicable), last update.

Calculator:
```
POST /api/v1/calculator/spread
```
Accepts investment amount + either an opportunity ID or manual buy/sell price + fee inputs; returns estimated gross/net profit and ROI. Add a standalone EJS calculator page (`views/tools/calculator.ejs`) usable without logging in (rate-limited), matching the "public utility tool" pattern common on arbitrage sites.

Clearly label everything as an estimate. Never imply guaranteed profit.

---

## PHASE 13 — History, Charts and Analytics
**COPY/PASTE INTO FREEBUFF**

Implement historical spread/opportunity/funding-rate analytics.

Provide: spread history, net-profit history, price history where available, volume history, funding-rate history, opportunity frequency, average spread, highest observed spread, time since update.

Support chart ranges 1h, 6h, 24h, 7d, 30d, custom where practical.

Use efficient time-series storage in MySQL (indexed, partitioned/aggregated tables — avoid one row per tick forever) and Chart.js (or similar) on the EJS analytics page. Avoid excessive duplicate high-frequency records — aggregate into candles/buckets.

---

## PHASE 14 — Favorites and Watchlists
**COPY/PASTE INTO FREEBUFF**

Implement favorite opportunities, favorite coins, favorite exchanges, watchlists, saved scanner filters (builds on Phase 11's saved preferences).

Authenticated CRUD endpoints + corresponding EJS pages.

Enforce Premium/plan limits server-side. Don't unnecessarily duplicate opportunity records — reference by ID.

---

## PHASE 15 — Alerts and Notifications
**COPY/PASTE INTO FREEBUFF**

Build an alert engine.

Alert conditions: min spread, min net profit, coin, pair, buy/sell exchange, volume/liquidity, network conditions, funding-rate threshold.

Create alert and notification models plus notification preferences.

Prepare channels: email (required for MVP), Telegram (bot integration), web push (optional/stub if time-constrained — don't fake it working).

Prevent duplicate notifications with configurable cooldown/deduplication.

Enforce plan limits server-side (e.g. Free = 1 active alert, Premium = unlimited — your own numbers, configurable in DB per Phase 3).

---

## PHASE 16 — Paystack
**COPY/PASTE INTO FREEBUFF**

Integrate Paystack securely in the Node.js backend using Paystack's official API.

Implement: transaction initialization, checkout/reference handling, server-side verification, webhook processing, idempotency, successful/failed payment handling, subscription activation/renewal/cancellation, payment history.

Store Paystack customer code, transaction reference/ID, subscription code where applicable, plan, amount, currency, status, timestamps — in MySQL.

Never expose `PAYSTACK_SECRET_KEY` to the frontend. Never unlock Premium because the browser reports payment success — only server-side verification/webhook confirmation unlocks it.

Add EJS pages: `views/billing/plans.ejs`, `views/billing/checkout-result.ejs`.

---

## PHASE 17 — Premium Enforcement
**COPY/PASTE INTO FREEBUFF**

Connect subscriptions to scanner feature gates.

Free: basic dashboard, limited opportunities/exchanges, basic filters, limited saved items, limited alerts, no funding/perp arbitrage view.

Premium/Pro: full exchange coverage, real-time scanner, advanced filters, detailed opportunity data, historical analytics, advanced calculator, favorites/watchlists, real-time alerts, funding/perp arbitrage engine, Telegram alerts.

Enterprise: higher limits, API access (own Crypto API — see Phase 22 roadmap note), advanced analytics.

These are your own product-entitlement design — do not present them as matching any specific commercial product's exact limits.

Write tests proving Free users cannot bypass Premium restrictions by calling APIs directly (not just hiding UI elements).

---

## PHASE 18 — Public Reference Pages *(NEW — gap fill)*
**COPY/PASTE INTO FREEBUFF**

Build the public (unauthenticated) marketing/reference pages as EJS views, backed by data your own app already has (don't hardcode duplicate data):

- `views/exchanges/index.ejs` — supported exchanges list, pulling live capability data from the Phase 4/5 exchange data model (fees, supported networks, spot/futures support).
- `views/pricing/plans.ejs` — public plans page rendering the Phase 3 plan/entitlement data.
- `views/home/index.ejs` — landing page describing your own product's features (write original copy — do not reuse another site's marketing text).

These are read-only, server-rendered, cacheable (short TTL via Redis) pages — no new business logic, just presentation over existing data.

---

## PHASE 19 — Admin API
**COPY/PASTE INTO FREEBUFF**

Build secure admin APIs for users, plans, subscriptions, payments, exchanges, coins, networks, scanner status, opportunities, alerts, notifications, settings, logs.

Role-based authorization + audit logs for sensitive admin actions.

---

## PHASE 20 — Admin Dashboard (EJS)
**COPY/PASTE INTO FREEBUFF**

Build a separate EJS-rendered admin section (`src/views/admin/`, mounted under `/admin`, separate auth middleware requiring `role=admin`).

Pages: Dashboard, Users, Plans, Subscriptions, Payments, Exchanges, Coins, Networks, Opportunities, Alerts, Notifications, Settings, Logs.

Admin can configure plan limits, Premium features, exchange enable/disable, scanner thresholds, alert limits, system settings — all writing to the same MySQL tables the main app reads, so changes take effect without redeploying.

Do not expose admin secrets in any rendered HTML or client-side JS.

---

## PHASE 21 — Security Hardening
**COPY/PASTE INTO FREEBUFF**

Full security review: authentication, JWT/refresh tokens, password storage, CORS, security headers, rate limiting, input validation, SQL injection protection (parameterized queries via Sequelize/Knex — no raw string concatenation), Paystack webhook signature verification, secret handling, admin authorization, IDOR/access control, WebSocket auth, subscription bypass attempts, EJS output escaping (prevent XSS — `<%= %>` not `<%- %>` for user-supplied data).

Do not log secrets or sensitive credentials.

Fix vulnerabilities, add regression tests.

---

## PHASE 22 — Testing
**COPY/PASTE INTO FREEBUFF**

Comprehensive automated tests: unit, service, repository, controller/API, authentication, subscription/feature gates, Paystack webhooks, exchange adapter mocks, spot arbitrage calculations, funding arbitrage calculations, order-book/liquidity, WebSockets, notifications, EJS route rendering (smoke tests).

Deterministic fixtures. No live exchange calls in CI.

Add lint, formatting, strict TypeScript checks.

---

## PHASE 23 — Performance and Scaling
**COPY/PASTE INTO FREEBUFF**

Review Redis usage, MySQL indexes/query performance, WebSocket throughput, exchange rate limits, memory/CPU, opportunity-calculation frequency, duplicate calculations.

Implement worker processes where useful, Redis pub/sub, batching, backpressure, connection pooling, reconnection handling, graceful shutdown.

Preserve calculation correctness while optimizing speed.

---

## PHASE 24 — Monitoring and Operations
**COPY/PASTE INTO FREEBUFF**

Add structured logs, exchange connection health, scanner health, Redis/MySQL health, Paystack webhook logs, job status, metrics-ready architecture (Prometheus-compatible endpoint is fine).

Add liveness/readiness endpoints.

Never log passwords, JWT secrets, Paystack secrets, exchange credentials.

---

## PHASE 25 — Deployment
**COPY/PASTE INTO FREEBUFF**

Docker-based production deployment for Node.js, MySQL, Redis.

Production env config, database migrations (run automatically or via documented command), secure HTTPS, health checks, graceful shutdown, logs, backups (MySQL dump strategy), rollback documentation.

Document free-tier hosting limitations that make a given service unsuitable for a continuously-running production scanner (e.g. sleeping dynos, connection limits).

---

## PHASE 26 — Final Integration and Acceptance
**COPY/PASTE INTO FREEBUFF**

Integrate all modules without rewriting working components.

Verify end-to-end: registration → login → Free account → scanner → live exchange data → spot arbitrage calculation → funding arbitrage calculation → opportunity display (EJS + API) → upgrade → Paystack payment → server verification → Premium activation → Premium features unlocked → alerts fire → subscription status correct.

Verify WebSocket updates/reconnection and Free/Premium access control (server-side, not just hidden UI).

Run all tests, backend build, validate migrations, review environment variables, produce a final architecture report + updated README with setup instructions.

---

## Future Roadmap (explicitly OUT of scope for Phases 1–26)

These are separate large subsystems seen on the reference site's public pages. Each deserves its own phase pack once V1 is stable — don't fold them into the phases above:

- **DEX / on-chain scanner** — needs DEX aggregator APIs (0x, 1inch, etc.) and multi-chain RPC access, different data model from CEX.
- **Wallet/address analytics + AI "similar wallet" search** — requires blockchain indexing infrastructure across many chains; a genuinely large, separate product.
- **NFT flipping scanner** — needs marketplace listing feeds (OpenSea, Blur, etc.) and rarity-scoring logic.
- **AI market assistant / AI agents** — LLM integration layer, its own prompt/orchestration design.
- **Telegram/Reddit news-and-chat monitoring bot** — scraping + keyword/anomaly detection pipeline, distinct from the arbitrage engine.
- **New-listings calendar, blog/CMS, public Crypto API product, white-label deployment tooling, affiliate program** — smaller, but still separate epics with their own data models and (for white-label) multi-tenancy concerns.

If you want, I can write a Phase 27+ pack for any one of these once V1 is running — trying to spec them all now would produce shallow, unusable prompts for infra this different from the core scanner.
