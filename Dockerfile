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
ARG VITE_ENABLE_FOOD_SETTLEMENTS=false
ARG VITE_ENABLE_FOOD_ECOCASH=false
# Browser Maps key: public by nature, so it must be restricted to the dashboard
# origin and the Maps JavaScript API in Google Cloud. Loaded only when an
# administrator opens the Zones boundary editor.
ARG VITE_GOOGLE_MAPS_API_KEY
# Release identity, shown in the UI and served at /version.json.
ARG APP_VERSION=0.0.0-dev
ARG APP_REVISION=unknown
ARG APP_BUILD_TIME=unknown
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_APP_LABEL=${VITE_APP_LABEL} \
    VITE_DEFAULT_THEME=${VITE_DEFAULT_THEME} \
    VITE_DEFAULT_PHONE_COUNTRY=${VITE_DEFAULT_PHONE_COUNTRY} \
    VITE_DEFAULT_TIMEZONE=${VITE_DEFAULT_TIMEZONE} \
    VITE_ENABLE_FOOD_SETTLEMENTS=${VITE_ENABLE_FOOD_SETTLEMENTS} \
    VITE_ENABLE_FOOD_ECOCASH=${VITE_ENABLE_FOOD_ECOCASH} \
    VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY} \
    VITE_ENABLE_MOCK_API=false \
    APP_VERSION=${APP_VERSION} \
    APP_REVISION=${APP_REVISION} \
    APP_BUILD_TIME=${APP_BUILD_TIME}
RUN yarn build \
 # The image is not produced if the bundle carries mocks, a server secret name,
 # or a version that disagrees with what is being built.
 && node scripts/check-dist.mjs dist --version "${APP_VERSION}" --revision "${APP_REVISION}" --require-build-time \
    $([ -n "${VITE_GOOGLE_MAPS_API_KEY}" ] && printf -- '--maps-key %s' "${VITE_GOOGLE_MAPS_API_KEY}")

# --- Production stage: Caddy serving the static bundle ---
FROM caddy:2-alpine AS production

ARG APP_VERSION=0.0.0-dev
ARG APP_REVISION=unknown
ARG APP_BUILD_TIME=unknown
LABEL org.opencontainers.image.title="delivery-dashboard" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${APP_REVISION}" \
      org.opencontainers.image.created="${APP_BUILD_TIME}" \
      org.opencontainers.image.source="https://github.com/mackawara/deliveryService"

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 80
