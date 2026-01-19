# Etapa 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Etapa 2: Runner (standalone)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copia apenas o necessário do standalone
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# CMD do standalone
CMD ["node", "server.js"]