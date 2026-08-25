# Dev-mode image: installs the whole workspace, runs via workspace scripts.
# A leaner multi-stage production build is a Phase 6 hardening item.
FROM node:20-bookworm-slim

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /workspace

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile=false

WORKDIR /workspace/apps/api

EXPOSE 4000

CMD ["pnpm", "dev"]
