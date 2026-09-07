# ════════════════════════════════════════════════════════════════════════
# Stage 1: Build backend + frontend
# ════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS build
WORKDIR /app

# Backend dependencies + build
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Frontend dependencies + build
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# ════════════════════════════════════════════════════════════════════════
# Stage 2: Production — runtime only
# ════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS production
WORKDIR /app

# Security: non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser  -u 1001 -S appuser -G appgroup

# Backend production deps
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Backend compiled output
COPY --from=build /app/dist ./dist

# Static assets (views for admin, public)
COPY src/views ./dist/views
COPY src/public ./dist/public

# Frontend build output (served as static files)
COPY --from=build /app/client/dist ./dist/public/app

# Migrations
COPY migrations ./migrations

# Log directory
RUN mkdir -p /app/logs && chown -R appuser:appgroup /app

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

STOPSIGNAL SIGTERM
EXPOSE 3000

CMD ["node", "dist/server.js"]
