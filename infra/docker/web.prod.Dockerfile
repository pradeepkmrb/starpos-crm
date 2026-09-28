# Production image for the Next.js dashboard. NEXT_PUBLIC_API_URL must be
# supplied as a build-time variable (Next.js inlines NEXT_PUBLIC_* at build,
# not at runtime) — Railway passes service variables as build args for
# Dockerfile-based services, which is what this ARG picks up.
FROM node:20-bookworm-slim

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /workspace

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile=false

RUN pnpm --filter @starpos-crm/shared build

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN pnpm --filter @starpos-crm/web build

WORKDIR /workspace/apps/web

ENV NODE_ENV=production

CMD ["pnpm", "start"]
