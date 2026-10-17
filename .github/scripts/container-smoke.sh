#!/usr/bin/env bash
# Runs the built dashboard image and checks what the deployed static server
# must do, beyond "it answers 200":
#   - the app shell, security headers, and no-store on the entry points
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
PORT="${SMOKE_PORT:-18080}"
BASE="http://127.0.0.1:${PORT}"

cleanup() { docker rm -f "${NAME}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { echo "::error::container smoke: $*" >&2; docker logs "${NAME}" 2>&1 | tail -20 >&2 || true; exit 1; }

# Same hardening as the compose stack in deliveryBooking (deploy/docker-compose.yml).
docker run -d --name "${NAME}" -p "127.0.0.1:${PORT}:80" \
  --cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges:true \
  "${IMAGE}" >/dev/null
for _ in $(seq 1 30); do
  curl -fsS -m 2 -o /dev/null "${BASE}/" 2>/dev/null && break
  sleep 1
done

tmp="$(mktemp -d)"
trap 'cleanup; rm -rf "${tmp}"' EXIT

request() { # request PATH -> sets code, headers file ${tmp}/h, body ${tmp}/b
  code="$(curl -sS -m 10 -D "${tmp}/h" -o "${tmp}/b" -w '%{http_code}' "${BASE}$1")"
}
header() { grep -i "^$1:" "${tmp}/h" | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

request /
[ "${code}" = 200 ] || fail "/ returned ${code}"
grep -qi '<div id="root"' "${tmp}/b" || fail "/ is not the app shell"
[ "$(header cache-control)" = no-store ] || fail "/ must be no-store, got '$(header cache-control)'"
for name in content-security-policy x-content-type-options strict-transport-security referrer-policy permissions-policy; do
  [ -n "$(header "${name}")" ] || fail "missing security header ${name}"
done
header server | grep -q . && fail "the Server header must be removed"

request /zones
[ "${code}" = 200 ] && grep -qi '<div id="root"' "${tmp}/b" || fail "deep link /zones did not serve the app shell (${code})"

asset="$(grep -oE '/assets/[A-Za-z0-9._-]+\.js' "${tmp}/b" | head -1 || true)"
if [ -z "${asset}" ]; then
  request /; asset="$(grep -oE '/assets/[A-Za-z0-9._-]+\.js' "${tmp}/b" | head -1)"
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
