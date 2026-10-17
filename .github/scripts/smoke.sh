#!/usr/bin/env bash
# Non-mutating HTTPS acceptance of the deployed dashboard. It asserts what was
# deployed (version and revision), that the dashboard origin reaches the API,
# and that API failures stay API responses. It never logs in, sends WhatsApp
# messages, starts a payment or writes data.
#
#   smoke.sh <dashboard-origin> <expected-version> <expected-revision>
set -euo pipefail

BASE="${1:?usage: smoke.sh <dashboard-origin> <version> <revision>}"
BASE="${BASE%/}"
VERSION="${2:?}"
REVISION="${3:?}"
TIMEOUT="${SMOKE_TIMEOUT:-240}"

fail() { echo "::error::smoke: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

get() { curl -sS -m 15 -D "${tmp}/h" -o "$2" -w '%{http_code}' "$1" 2>/dev/null || echo 000; }
header() { grep -i "^$1:" "${tmp}/h" | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

check() {
  local description=$1; shift
  local deadline=$(($(date +%s) + TIMEOUT)) last=""
  while :; do
    if last="$("$@" 2>&1)"; then echo "ok: ${description}"; return 0; fi
    [ "$(date +%s)" -lt "${deadline}" ] || fail "${description}: ${last}"
    sleep 5
  done
}

shell_served() {
  [ "$(get "${BASE}/" "${tmp}/index")" = 200 ] || { echo "/ is not 200"; return 1; }
  grep -qi '<div id="root"' "${tmp}/index" || { echo "/ is not the app shell"; return 1; }
  [ "$(get "${BASE}/zones" "${tmp}/deep")" = 200 ] || { echo "SPA deep link is not 200"; return 1; }
  grep -qi '<div id="root"' "${tmp}/deep" || { echo "SPA deep link did not serve the shell"; return 1; }
  [ "$(get "${BASE}/assets/does-not-exist.js" "${tmp}/missing")" = 404 ] || { echo "a missing asset did not 404"; return 1; }
}

build_matches() {
  [ "$(get "${BASE}/version.json" "${tmp}/version")" = 200 ] || { echo "/version.json is not 200"; return 1; }
  [ "$(header cache-control)" = no-store ] || { echo "/version.json is cacheable"; return 1; }
  local v r
  v="$(jq -r .version "${tmp}/version")"; r="$(jq -r .revision "${tmp}/version")"
  [ "${v}" = "${VERSION}" ] && [ "${r}" = "${REVISION}" ] || { echo "running ${v}/${r}, expected ${VERSION}/${REVISION}"; return 1; }
}

api_reachable() {
  [ "$(get "${BASE}/readyz" "${tmp}/ready")" = 200 ] || { echo "${BASE}/readyz is not 200 (dashboard origin does not reach a ready API)"; return 1; }
  [ "$(jq -r .status "${tmp}/ready")" = ok ] || { echo "API readiness is not ok"; return 1; }
}

api_errors_stay_api() {
  local code
  code="$(get "${BASE}/api/v1/does-not-exist" "${tmp}/apierr")"
  [ "${code}" = 404 ] || [ "${code}" = 401 ] || { echo "unknown API path returned ${code}"; return 1; }
  jq -e . "${tmp}/apierr" >/dev/null 2>&1 || { echo "unknown API path did not return JSON (the SPA page leaked through)"; return 1; }
}

check "dashboard serves the app, deep links, and 404s missing assets" shell_served
check "dashboard reports ${VERSION}/${REVISION}" build_matches
check "dashboard origin reaches a ready API" api_reachable
check "API errors stay API responses" api_errors_stay_api
echo "Smoke checks passed."
