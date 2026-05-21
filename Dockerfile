# syntax=docker/dockerfile:1.7

# ---------- Stage 1: deps ----------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# package.json hat einen "postinstall": "prisma generate", daher braucht es das schema.
# Falls eine package-lock.json existiert, wird "npm ci" benutzt (reproduzierbar),
# sonst faellt es auf "npm install" zurueck.
RUN if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund; \
    else \
      npm install --no-audit --no-fund; \
    fi

# ---------- Stage 2: build ----------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma-Client neu generieren (sicher) und Next.js standalone build
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
# Sicherstellen, dass public/ existiert (auch wenn leer)
RUN mkdir -p public
RUN npm run build

# ---------- Stage 3: runner ----------
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl curl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root User
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Standalone-Output (enthaelt node_modules-Subset, server.js)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma-Schema + komplette Prisma-Pakete (CLI braucht @prisma/engines, @prisma/debug, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs
# pdfkit (PDF-Erzeugung fuer Anwesenheitslisten) laedt seine AFM-Fonts
# ueber __dirname zur Laufzeit. Standalone-Tracing erfasst die Binaer-
# Daten nicht zuverlaessig - daher das gesamte Paket samt transitiven
# Laufzeit-Abhaengigkeiten kopieren. Pakete mit '@' in zwei COPYs.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@noble ./node_modules/@noble
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pdfkit ./node_modules/pdfkit
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/fontkit ./node_modules/fontkit
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/png-js ./node_modules/png-js
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/linebreak ./node_modules/linebreak
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/unicode-properties ./node_modules/unicode-properties
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/unicode-trie ./node_modules/unicode-trie
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/clone ./node_modules/clone
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dfa ./node_modules/dfa
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/restructure ./node_modules/restructure
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tiny-inflate ./node_modules/tiny-inflate
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/brotli ./node_modules/brotli
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/base64-js ./node_modules/base64-js
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pako ./node_modules/pako
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/browserify-zlib ./node_modules/browserify-zlib
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/fast-deep-equal ./node_modules/fast-deep-equal
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/js-md5 ./node_modules/js-md5
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tslib ./node_modules/tslib
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Entrypoint: erst migrate deploy, dann Server starten
COPY --chown=nextjs:nodejs docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/login || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
