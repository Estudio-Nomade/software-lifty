# Prefer monorepo deploy image:
#   docker build -f deploy/lightsail/Dockerfile -t lifty-api .
#
# This file remains for local `apps/backend` context builds.
# It expects a bun.lock beside package.json — in this monorepo the lockfile
# lives at the repo root, so production deploys should use deploy/lightsail/.

FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json ./
# Optional local lock; monorepo root lock is used by deploy/lightsail/Dockerfile
COPY bun.lock* ./
RUN bun install --frozen-lockfile --production || bun install --production

FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json tsconfig.json ./
COPY bun.lock* ./
COPY src ./src
COPY scripts ./scripts
RUN bun install --frozen-lockfile || bun install

FROM oven/bun:1.3-slim AS production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json /app/tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
