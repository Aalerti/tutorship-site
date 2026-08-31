FROM node:22-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json* ./
RUN npm ci

FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY backend .
COPY static /static
RUN npm run prisma:generate
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /static /static

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/server.js"]
