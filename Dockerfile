# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: Build React frontend
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency manifests and install (cache layer)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime (Python + nginx + supervisor)
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.10-slim

WORKDIR /app

# Install nginx and supervisor
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        nginx \
        supervisor \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

# ── Frontend build (from Stage 1) ──
COPY --from=build /app/build /usr/share/nginx/html

# ── Backend ──
COPY api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY api/ ./api/

# ── Config files ──
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# ── Create log dir for supervisor ──
RUN mkdir -p /var/log/supervisor

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
