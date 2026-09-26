# --- Build stage: Yarn 4 (pinned by packageManager, via Corepack) + Vite build ---
FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

COPY . .

# Vite inlines VITE_* values into the bundle at build time, so changing one
# needs a rebuild, not a restart. They are all public configuration — never
# pass a secret here. Empty values fall back to the defaults in src/config.ts.
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_APP_LABEL
ARG VITE_DEFAULT_THEME
ARG VITE_DEFAULT_PHONE_COUNTRY
ARG VITE_DEFAULT_TIMEZONE
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_APP_LABEL=${VITE_APP_LABEL} \
    VITE_DEFAULT_THEME=${VITE_DEFAULT_THEME} \
    VITE_DEFAULT_PHONE_COUNTRY=${VITE_DEFAULT_PHONE_COUNTRY} \
    VITE_DEFAULT_TIMEZONE=${VITE_DEFAULT_TIMEZONE} \
    VITE_ENABLE_MOCK_API=false
RUN yarn build

# --- Production stage: Caddy serving the static bundle ---
FROM caddy:2-alpine AS production

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 80
