#!/usr/bin/env bash
# Builds, verifies and publishes the dashboard image, idempotently.
#
# Environment:
#   IMAGE        Docker Hub repository, e.g. user/delivery-dashboard
#   SHA          commit being published (full)
#   VERSION      SemVer stamped into the build
#   SEMVER_TAG   true to also publish the immutable <VERSION> tag
#   BUILD_TIME   ISO-8601 build time
#   VITE_*       public build configuration (see the Dockerfile)
#
# Outputs (GITHUB_OUTPUT): digest (resolved linux/arm64 image digest) and reused.
#
# Public build configuration (the restricted Maps key, API base URL) is part of
# the immutable image. Changing it needs a new commit and image: an existing
# tag is never rebuilt or overwritten. The image is exercised before any tag is
# pushed, and reruns reuse what exists.
set -euo pipefail

: "${IMAGE:?}" "${SHA:?}" "${VERSION:?}" "${BUILD_TIME:?}"
SEMVER_TAG="${SEMVER_TAG:-false}"
OUT="${GITHUB_OUTPUT:-/dev/stdout}"

registry_digest() { # registry_digest REF -> digest, or empty only for a missing manifest
  local digest errors
  errors="$(mktemp)"
  if digest="$(docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}' 2>"${errors}")"; then
    rm -f "${errors}"
    if [[ ! "${digest}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
      echo "::error::Registry returned an invalid digest for $1; refusing to publish." >&2
      return 1
    fi
    printf '%s\n' "${digest}"
  elif grep -qiE 'manifest unknown|no such manifest|: not found$' "${errors}"; then
    rm -f "${errors}"
  else
    cat "${errors}" >&2
    rm -f "${errors}"
    echo "::error::Could not inspect $1; refusing to assume the immutable tag is absent." >&2
    return 1
  fi
}

commit_digest="$(registry_digest "${IMAGE}:${SHA}")"
reused=false
if [ -n "${commit_digest}" ]; then
  docker pull "${IMAGE}@${commit_digest}" >/dev/null
  label="$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${IMAGE}@${commit_digest}")"
  if [ "${label}" != "${SHA}" ]; then
    echo "::error::${IMAGE}:${SHA} exists but was built from revision '${label}'. Refusing to reuse or overwrite it." >&2
    exit 1
  fi
  version_label="$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "${IMAGE}@${commit_digest}")"
  if [ "${version_label}" != "${VERSION}" ]; then
    echo "::error::${IMAGE}:${SHA} was built as version '${version_label}', not '${VERSION}'. Refusing to reuse or overwrite it." >&2
    exit 1
  fi
  echo "${IMAGE}:${SHA} is already published (${commit_digest}); reusing it."
  reused=true
else
  docker build \
    --platform linux/arm64 \
    --build-arg "APP_VERSION=${VERSION}" \
    --build-arg "APP_REVISION=${SHA}" \
    --build-arg "APP_BUILD_TIME=${BUILD_TIME}" \
    --build-arg "VITE_API_BASE_URL=${VITE_API_BASE_URL:-/api/v1}" \
    --build-arg "VITE_APP_LABEL=${VITE_APP_LABEL:-}" \
    --build-arg "VITE_DEFAULT_THEME=${VITE_DEFAULT_THEME:-}" \
    --build-arg "VITE_DEFAULT_PHONE_COUNTRY=${VITE_DEFAULT_PHONE_COUNTRY:-}" \
    --build-arg "VITE_DEFAULT_TIMEZONE=${VITE_DEFAULT_TIMEZONE:-}" \
    --build-arg "VITE_ENABLE_FOOD_SETTLEMENTS=${VITE_ENABLE_FOOD_SETTLEMENTS:-false}" \
    --build-arg "VITE_ENABLE_FOOD_ECOCASH=${VITE_ENABLE_FOOD_ECOCASH:-false}" \
    --build-arg "VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY:-}" \
    -t "${IMAGE}:${SHA}" .
  .github/scripts/container-smoke.sh "${IMAGE}:${SHA}" "${VERSION}" "${SHA}"
  docker push "${IMAGE}:${SHA}"
  commit_digest="$(docker inspect --format '{{index .RepoDigests 0}}' "${IMAGE}:${SHA}" | sed 's/.*@//')"
  [ -n "${commit_digest}" ] || { echo "::error::could not resolve the pushed digest" >&2; exit 1; }
fi

if [ "${SEMVER_TAG}" = true ]; then
  semver_digest="$(registry_digest "${IMAGE}:${VERSION}")"
  if [ -z "${semver_digest}" ]; then
    docker pull "${IMAGE}@${commit_digest}" >/dev/null
    docker tag "${IMAGE}@${commit_digest}" "${IMAGE}:${VERSION}"
    docker push "${IMAGE}:${VERSION}"
  elif [ "${semver_digest}" != "${commit_digest}" ]; then
    echo "::error::${IMAGE}:${VERSION} already points at ${semver_digest}, not ${commit_digest} (commit ${SHA}). SemVer tags are immutable; refusing to move it." >&2
    exit 1
  fi
fi

{ echo "digest=${commit_digest}"; echo "reused=${reused}"; } >>"${OUT}"
echo "Published ${IMAGE}@${commit_digest} (${VERSION}, ${SHA})."
