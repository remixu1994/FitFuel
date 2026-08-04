# ---- Stage 1: Production dependencies ----
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++ vips-dev
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev --legacy-peer-deps

# ---- Stage 2: Build ----
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++ vips-dev
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Build Next.js (prebuild hook runs `prisma generate` first)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Stage 3: Production runner ----
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Pre-create the upload directories owned by the runtime user:
#   /app/.private — default path (PRIVATE_UPLOAD_DIR unset / bare metal)
#   /app/uploads  — docker-compose bind mount target
# Without these, `nextjs` (uid 1001) cannot mkdir the path itself,
# and a fresh named volume mounted there would otherwise be root-owned.
RUN mkdir -p /app/.private /app/uploads && chown -R nextjs:nodejs /app/.private /app/uploads

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy Prisma client (generated engine binaries + schema)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/infra/database/prisma ./infra/database/prisma

# Copy built Next.js standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy database migrations & scripts for manual operations
COPY --from=builder /app/infra/database ./infra/database
COPY --from=builder /app/tools ./tools

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
