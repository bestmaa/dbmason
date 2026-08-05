FROM node:26.5.1-alpine3.23@sha256:2a633e101381371ba148c7c212bf447c00cd267d814b708a9fe52c4984204729 AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY scripts/collect-third-party-licenses.mjs ./scripts/collect-third-party-licenses.mjs
COPY legal/third-party ./legal/third-party

FROM deps AS builder
COPY . .
RUN pnpm check:third-party-provenance
RUN PAYLOAD_SECRET=build-only-payload-secret-00000000000000000000000000000000 \
  CONNECTION_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
  DBMASON_PUBLIC_URL=http://localhost:3000 \
  pnpm build
RUN pnpm check:runtime
RUN pnpm --config.optional=false licenses list --prod --json \
  | node scripts/collect-third-party-licenses.mjs \
  node_modules /third-party-licenses .next/standalone/node_modules /dev/stdin

FROM node:26.5.1-alpine3.23@sha256:2a633e101381371ba148c7c212bf447c00cd267d814b708a9fe52c4984204729 AS runner
LABEL org.opencontainers.image.licenses="AGPL-3.0-only" \
  org.opencontainers.image.source="https://github.com/bestmaa/dbmason" \
  org.opencontainers.image.title="DBMason"
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/data \
  && chown nextjs:nodejs /app/data

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs \
  /app/LICENSE /app/NOTICE /app/TRADEMARKS.md /app/THIRD_PARTY_NOTICES.md \
  ./licenses/
COPY --from=builder --chown=nextjs:nodejs /third-party-licenses ./licenses/third-party/

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
