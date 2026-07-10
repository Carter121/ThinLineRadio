# ThinLine Radio - Multi-stage Docker Build
# This Dockerfile builds both the Angular client and Go server in separate stages
# and creates a minimal production image with only the necessary runtime dependencies

# =============================================================================
# Stage 1: Build Angular Client
# =============================================================================
FROM node:18-alpine AS client-builder

WORKDIR /build

# Copy package files first for better caching
COPY client/package*.json ./client/

# Install dependencies
WORKDIR /build/client
RUN npm install --legacy-peer-deps

# Copy client source code
COPY client/ ./

# Build production bundle (outputs to /build/server/webapp/)
RUN npm run build

# Verify build output
RUN ls -la /build/server/webapp/ && echo "Webapp build successful"

# =============================================================================
# Stage 1b: Build Svelte Client (client-v2, served at the site root)
# =============================================================================
FROM node:22-alpine AS client-v2-builder

RUN corepack enable pnpm

WORKDIR /build/client-v2

# Copy package files first for better caching
COPY client-v2/package.json client-v2/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy client source code
COPY client-v2/ ./

# Build static SPA (adapter-static outputs to /build/server/webapp-v2/)
RUN pnpm build

# Verify build output
RUN ls -la /build/server/webapp-v2/ && echo "Webapp-v2 build successful"

# =============================================================================
# Stage 2: Build Go Server
# =============================================================================
FROM golang:1.24-alpine AS server-builder

# BuildKit sets these per --platform (e.g. linux/arm64); defaults suit plain `docker build`.
ARG TARGETOS=linux
ARG TARGETARCH=amd64

WORKDIR /build/server

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files first for better caching
COPY server/go.mod server/go.sum ./
RUN go mod download

# Copy server source code
COPY server/ ./

# Copy built Angular webapp (served under /old-site) from previous stage
COPY --from=client-builder /build/server/webapp ./webapp/

# Copy built Svelte webapp (served at the site root) from previous stage
COPY --from=client-v2-builder /build/server/webapp-v2 ./webapp-v2/

# Verify webapps were copied
RUN ls -la ./webapp/ ./webapp-v2/ && echo "Webapp files copied"

# Pure Go binary: CGO_ENABLED=0 already produces a static executable (no libc link).
# Omit -extldflags '-static' — it forces an external linker path that often fails on
# Alpine + buildx even when CGO is off, and is unnecessary for this build.
ENV CGO_ENABLED=0 \
    GOOS=${TARGETOS} \
    GOARCH=${TARGETARCH}

RUN go build -ldflags="-s -w" -o thinline-radio .

# Verify binary was created
RUN ls -lh thinline-radio

# =============================================================================
# Stage 3: Production Runtime Image
# =============================================================================
FROM alpine:3.19

# Install runtime dependencies
# - ffmpeg: Required for audio processing, transcription, tone detection
# - ffprobe: Required for audio duration calculation
# - ca-certificates: Required for HTTPS API calls (transcription services, etc.)
# - tzdata: Required for proper timezone handling
# - curl: Required for healthcheck (avoids BusyBox wget ssl_client zombie bug)
RUN apk add --no-cache \
    ffmpeg \
    ca-certificates \
    tzdata \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1000 thinline && \
    adduser -D -u 1000 -G thinline thinline

# Create application directories
RUN mkdir -p /app/data /app/config /app/logs && \
    chown -R thinline:thinline /app

WORKDIR /app

# Copy binary from builder stage
COPY --from=server-builder /build/server/thinline-radio .

# Copy Docker entrypoint script
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

# Copy documentation (only essential files, optional ones can fail)
COPY LICENSE README.md ./

# Ensure binary is executable
RUN chmod +x thinline-radio && \
    chown thinline:thinline thinline-radio

# Switch to non-root user
USER thinline

# Expose ports
# 3000: HTTP server (default)
# 3443: HTTPS server (optional, if SSL configured)
EXPOSE 3000 3443

# Health check
# Checks if the server is responding on the main port
# Using curl instead of wget to avoid BusyBox wget ssl_client zombie process bug
# (https://bugs.busybox.net/show_bug.cgi?id=15967)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Environment variables (can be overridden)
ENV DB_TYPE=postgresql \
    DB_HOST=localhost \
    DB_PORT=5432 \
    DB_NAME=thinline_radio \
    DB_USER="" \
    DB_PASS="" \
    LISTEN=0.0.0.0:3000

# Default entrypoint
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Default command (empty, handled by entrypoint)
CMD []

# Labels for image metadata
LABEL maintainer="Thinline Dynamic Solutions" \
      description="ThinLine Radio - Comprehensive radio scanner platform" \
      version="7.0.0" \
      org.opencontainers.image.source="https://github.com/Thinline-Dynamic-Solutions/ThinLineRadio" \
      org.opencontainers.image.licenses="GPL-3.0"
