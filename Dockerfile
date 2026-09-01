FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy source
COPY dist ./dist
COPY src/views ./dist/views
COPY src/public ./dist/public

# Set production environment
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/server.js"]
