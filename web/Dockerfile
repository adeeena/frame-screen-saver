# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /build

# Install all dependencies (including devDependencies for Angular CLI)
COPY web/package*.json ./
RUN npm ci

# Copy source and compile
COPY web/ ./
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Install production dependencies only
# (node-ical is not bundled by Angular; sharp requires native bindings)
COPY web/package*.json ./
RUN npm ci --omit=dev

# Copy compiled application
COPY --from=builder /build/dist/frame-screen-saver/ dist/frame-screen-saver/

# Bake in the media folder
COPY media/ /media/

ENV NODE_ENV=production
ENV PORT=4000
ENV MEDIA_DIR=/media

EXPOSE 4000
CMD ["node", "dist/frame-screen-saver/server/server.mjs"]
