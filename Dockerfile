#
# Multi-stage build: full toolchain in the build stage, only the self-
# contained nitro output + drizzle migrations in the runtime image. The app
# holds no local persistent state in production (external Postgres + object
# storage), so the container is disposable.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY project.inlang ./project.inlang
COPY messages ./messages
# Dev deps are required for the build; NODE_ENV is set by the build script
# itself, not here, so pnpm doesn't skip them.
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# Release identifier (git SHA in CI) — tags error-tracker events.
ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
# Nitro output is self-contained (deps inlined); pglite wasm assets are
# restored next to the bundle by scripts/copy-pglite-assets.mjs during build.
COPY --from=build /app/.output ./.output
# Startup migrations read drizzle/ from the working directory.
COPY --from=build /app/drizzle ./drizzle
USER node
EXPOSE 3000
# Liveness only — readiness (/health/ready) is for the orchestrator/LB.
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
