FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.22.0 --activate
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/validation/package.json packages/validation/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm db:generate && pnpm build

FROM build AS api
ENV NODE_ENV=production
EXPOSE 3001
USER node
CMD ["pnpm", "--filter", "@vms/api", "start"]

FROM build AS web
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["pnpm", "--filter", "@vms/web", "start"]

FROM build AS worker
ENV NODE_ENV=production
USER node
CMD ["pnpm", "--filter", "@vms/worker", "start"]
