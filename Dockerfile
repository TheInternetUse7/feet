FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:22-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist

RUN useradd --create-home appuser
USER appuser

VOLUME /app/data

CMD ["node", "--env-file=.env", "dist/index.js"]
