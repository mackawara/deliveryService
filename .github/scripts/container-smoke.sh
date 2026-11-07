#!/usr/bin/env bash
# Runs the built dashboard image and checks what the deployed static server
# must do, beyond "it answers 200":
#   - public pages proxy to the API; dashboard entries serve the React shell
#   - proxy forwarding preserves the trusted edge's address, HTTPS and Host
#   - security headers and no-store on the entry points
#   - hashed assets are immutable; a missing asset or file is a real 404
#   - SPA deep links serve the shell
#   - a backend path reaching this server is an API-shaped error, never the shell
#   - /version.json is uncached and matches the build
#   - the browser mocks are not shipped
#
#   container-smoke.sh <image> <expected-version> <expected-revision>
set -euo pipefail

IMAGE="${1:?usage: container-smoke.sh <image> <version> <revision>}"
VERSION="${2:?}"
REVISION="${3:?}"
NAME="dashboard-smoke-$$"
UPSTREAM="${NAME}-api"
NETWORK="${NAME}-network"
PORT="${SMOKE_PORT:-18080}"
BASE="http://127.0.0.1:${PORT}"
tmp="$(mktemp -d)"

cleanup() {
  docker rm -f "${NAME}" "${UPSTREAM}" >/dev/null 2>&1 || true
  docker network rm "${NETWORK}" >/dev/null 2>&1 || true
  rm -rf "${tmp}"
}
trap cleanup EXIT

fail() { echo "::error::container smoke: $*" >&2; docker logs "${NAME}" 2>&1 | tail -20 >&2 || true; exit 1; }

# An isolated upstream proves this image actually forwards the requested path
# instead of answering with its SPA shell. No external service is contacted.
cat > "${tmp}/upstream.Caddyfile" <<'CADDY'
{
  admin off
}
:3000 {
  header {
    X-Served-By delivery-api
    X-Seen-Host {http.request.host}
    X-Seen-Client {http.request.header.X-Forwarded-For}
    X-Seen-Proto {http.request.header.X-Forwarded-Proto}
    X-Seen-Origin {http.request.header.Origin}
    Content-Type "text/html; charset=utf-8"
  }
  @unavailable query simulate=unavailable
  respond @unavailable "portal unavailable" 503
  respond "<!doctype html><main>Public delivery portal</main>" 200
}
CADDY
docker network create "${NETWORK}" >/dev/null
docker run -d --name "${UPSTREAM}" --network "${NETWORK}" \
  --cap-drop ALL --security-opt no-new-privileges:true \
  -v "${tmp}/upstream.Caddyfile:/etc/caddy/Caddyfile:ro" "${IMAGE}" >/dev/null

# Same hardening as the compose stack in deliveryBooking (deploy/docker-compose.yml).
docker run -d --name "${NAME}" --network "${NETWORK}" -p "127.0.0.1:${PORT}:80" \
  -e "API_UPSTREAM=${UPSTREAM}:3000" \
  --cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges:true \
  "${IMAGE}" >/dev/null
for _ in $(seq 1 30); do
  curl -fsS -m 2 -o /dev/null "${BASE}/" 2>/dev/null && break
  sleep 1
done

request() { # request PATH -> sets code, headers file ${tmp}/h, body ${tmp}/b
  local path=$1; shift
  code="$(curl -sS -m 10 -D "${tmp}/h" -o "${tmp}/b" -w '%{http_code}' "$@" "${BASE}${path}")"
}
header() { grep -i "^$1:" "${tmp}/h" | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

request /
[ "${code}" = 200 ] || fail "/ returned ${code}"
grep -q 'Public delivery portal' "${tmp}/b" || fail "/ was not proxied to the delivery API"
[ "$(header cache-control)" = no-store ] || fail "/ must be no-store, got '$(header cache-control)'"
for name in content-security-policy x-content-type-options strict-transport-security referrer-policy permissions-policy; do
  [ -n "$(header "${name}")" ] || fail "missing security header ${name}"
done
header content-security-policy | grep -q "frame-ancestors 'none'" || fail "frame-ancestors must be enforced by the HTTP header"
header server | grep -q . && fail "the Server header must be removed"

for path in /login /login/ /signup /signup/ /shop-signup /shop-signup/ /driver-signup /driver-signup/ /biker-terms /biker-terms/ /site/app.js /shop/dashboard /shop/dashboard/ /biker/dashboard /biker/dashboard/ /operations /operations/ /operations/applications '/?from=campaign' '/login/?returnTo=%2Fbookings' '/signup/?from=homepage' '/driver-signup/?from=homepage'; do
  request "${path}"
  [ "${code}" = 200 ] && grep -q 'Public delivery portal' "${tmp}/b" || fail "public ${path} was not proxied (${code})"
done
request '/login?simulate=unavailable'
[ "${code}" = 503 ] || fail "upstream failure became ${code}, expected 503"
grep -q 'portal unavailable' "${tmp}/b" || fail "upstream failure was replaced by the SPA shell"

request /login -H 'Host: delivery.example.test' -H 'X-Forwarded-For: 198.51.100.42' \
  -H 'X-Forwarded-Proto: https' -H 'Origin: https://delivery.example.test'
[ "$(header x-seen-client)" = 198.51.100.42 ] || fail "trusted client address was replaced by an internal hop"
[ "$(header x-seen-proto)" = https ] || fail "HTTPS was replaced by the internal HTTP scheme"
[ "$(header x-seen-host)" = delivery.example.test ] || fail "public Host was changed"
[ "$(header x-seen-origin)" = https://delivery.example.test ] || fail "login Origin was changed"

for path in /dashboard /bookings /configuration/towns /shop/login /shop/signup /shop/example/catalogue /login-extra /signup-extra /shop/dashboard-extra /operations-extra; do
  request "${path}"
  [ "${code}" = 200 ] && grep -qi '<div id="root"' "${tmp}/b" || fail "dashboard ${path} did not serve the app shell (${code})"
done

asset="$(grep -oE '/assets/[A-Za-z0-9._-]+\.js' "${tmp}/b" | head -1 || true)"
if [ -z "${asset}" ]; then
  request /dashboard; asset="$(grep -oE '/assets/[A-Za-z0-9._-]+\.js' "${tmp}/b" | head -1)"
fi
request "${asset}"
[ "${code}" = 200 ] || fail "${asset} returned ${code}"
header cache-control | grep -q immutable || fail "hashed asset is not immutable (got '$(header cache-control)')"

request /assets/does-not-exist.js
[ "${code}" = 404 ] || fail "missing asset returned ${code}, expected 404"
request /missing-image.png
[ "${code}" = 404 ] || fail "missing file returned ${code}, expected 404 (not the app shell)"

request /api/v1/auth/session
[ "${code}" = 502 ] || fail "backend path returned ${code}, expected the 502 misrouting error"
jq -e '.code == "BACKEND_ROUTE_MISROUTED"' "${tmp}/b" >/dev/null || fail "backend path did not return a JSON error"
request /media/anything
[ "${code}" = 502 ] || fail "/media returned ${code}, expected 502"

request /version.json
[ "${code}" = 200 ] || fail "/version.json returned ${code}"
[ "$(header cache-control)" = no-store ] || fail "/version.json must be no-store"
[ "$(jq -r .version "${tmp}/b")" = "${VERSION}" ] || fail "version.json version is $(jq -r .version "${tmp}/b"), expected ${VERSION}"
[ "$(jq -r .revision "${tmp}/b")" = "${REVISION}" ] || fail "version.json revision is $(jq -r .revision "${tmp}/b"), expected ${REVISION}"

request /mockServiceWorker.js
[ "${code}" = 404 ] || fail "the mock service worker script must not be served (${code})"

echo "Container smoke test passed for ${IMAGE} (${VERSION}, ${REVISION})."
