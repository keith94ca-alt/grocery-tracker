# Stage 1: Build
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy files first
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY . .

# Install dependencies (--include=dev ensures TypeScript + Prisma CLI are available for build)
RUN npm ci --include=dev

# Generate Prisma client
RUN npx prisma generate

# Build Next.js directly (skip npm run build to avoid duplicate prisma generate)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build

# Stage 2: Runtime
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl wget
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=7800
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL="file:/data/prices.db"

# Auth secret — MUST be overridden in production via Portainer env vars
# ENV JWT_SECRET="change-me-in-production"

# Optional first-boot seed — creates admin user + backfills existing data to a family
# ENV SEED_EMAIL="your@email.com"
# ENV SEED_PASSWORD="yourpassword"
# ENV SEED_NAME="Your Name"

# Copy all necessary files from builder
COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public

# Add entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 7800

ENTRYPOINT ["/docker-entrypoint.sh"]
