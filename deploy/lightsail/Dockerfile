# Lifty backend — build from monorepo root:
#   docker build -f deploy/lightsail/Dockerfile -t lifty-api .
#
# Runtime: Bun + Elysia. DB = Supabase (external). Redis = compose service.

FROM oven/bun:1.3 AS deps
WORKDIR /app

# Copy the whole workspace graph so bun.lock stays consistent, then install
# only production deps for @lifty/backend.
COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY apps/mobile-passengers/package.json ./apps/mobile-passengers/package.json

RUN bun install --filter @lifty/backend --frozen-lockfile --production \
  && mkdir -p apps/backend/node_modules

FROM oven/bun:1.3-slim AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/package.json /app/bun.lock ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules

COPY apps/backend/tsconfig.json ./apps/backend/tsconfig.json
COPY apps/backend/src ./apps/backend/src
COPY apps/backend/scripts ./apps/backend/scripts

WORKDIR /app/apps/backend

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
