# Production image for the NestJS API (also runs all BullMQ processors
# in-process — see worker.main.ts for the separate-process option used
# once traffic justifies scaling workers independently).
FROM node:20-bookworm-slim

# Prisma's engine needs libssl at both generate-time (to detect the right
# binary target) and runtime; bookworm-slim doesn't ship it by default.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /workspace

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile=false

RUN pnpm --filter @starpos-crm/shared build
RUN pnpm --filter @starpos-crm/db generate
RUN pnpm --filter @starpos-crm/api build

WORKDIR /workspace/apps/api

ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
