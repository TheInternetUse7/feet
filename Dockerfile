FROM node:24-slim AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

FROM node:24-slim

WORKDIR /app

ARG GIT_COMMIT=dev
ENV GIT_COMMIT=$GIT_COMMIT

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN useradd --create-home appuser && mkdir -p /app/data && chown appuser:appuser /app/data
USER appuser

VOLUME /app/data

CMD ["node", "--env-file=.env", "dist/index.js"]
