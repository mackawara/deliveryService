#!/usr/bin/env bash
# Decides the version of the commit being published, without creating
# anything. Writes GitHub Actions outputs (to $GITHUB_OUTPUT, or stdout):
#
#   version        SemVer stamped into the image and the served metadata
#   semver_tag     true when the image also gets an immutable <version> tag
#   new_release    true when `semantic-release` must still create the Git tag
#
# Cases (conventional commits since the last v* tag):
#   - HEAD already carries a v* tag  -> a rerun: reuse that version
#   - fix/perf/feat/breaking/build   -> next version, tag and release to create
#   - nothing releasable (docs/ci/chore only) -> the previous version, commit image only
#   - nothing released yet           -> the first release is 1.0.0
#
# The no-release path is taken ONLY when semantic-release ran successfully and
# said so explicitly. A failed install, a registry error, a wrong branch or any
# output this script does not recognise fails the job: guessing a version would
# publish an unversioned or wrongly versioned image.
#
# Needs a full-history checkout (fetch-depth: 0) and GITHUB_TOKEN.
set -euo pipefail

# The ONE place the release tool versions are pinned for planning. The release
# job in the workflow uses the same two pins; a test keeps them identical to
# each other and to the dev dependency the release-rule tests run against.
SEMANTIC_RELEASE_VERSION="${SEMANTIC_RELEASE_VERSION:-24.2.7}"
PRESET_VERSION="${PRESET_VERSION:-8.0.0}"

OUT="${GITHUB_OUTPUT:-/dev/stdout}"
emit() { printf '%s=%s\n' "$1" "$2" >>"${OUT}"; }

tag_at_head="$(git tag --points-at HEAD --list 'v*' | sort -V | tail -1)"
if [ -n "${tag_at_head}" ]; then
  echo "HEAD is already released as ${tag_at_head}."
  emit version "${tag_at_head#v}"
  emit semver_tag true
  emit new_release false
  exit 0
fi

if ! analysis="$(npx --yes -p "semantic-release@${SEMANTIC_RELEASE_VERSION}" \
  -p "conventional-changelog-conventionalcommits@${PRESET_VERSION}" \
  semantic-release --dry-run --no-ci 2>&1)"; then
  echo "${analysis}" | tail -30 >&2
  echo "::error::Release analysis failed (see the output above); refusing to guess a version." >&2
  exit 1
fi
echo "${analysis}" | tail -20

next="$(grep -oE 'next release version is [0-9]+\.[0-9]+\.[0-9]+' <<<"${analysis}" | tail -1 | awk '{print $NF}' || true)"
if [ -n "${next}" ]; then
  emit version "${next}"
  emit semver_tag true
  emit new_release true
  exit 0
fi

if grep -qiE 'no relevant changes|no new version is released' <<<"${analysis}"; then
  previous="$(git tag --list 'v*' --merged HEAD | sort -V | tail -1)"
  echo "No releasable commits since ${previous:-the start of history}; publishing a commit image only."
  if [ -n "${previous}" ]; then emit version "${previous#v}"; else emit version 0.0.0; fi
  emit semver_tag false
  emit new_release false
  exit 0
fi

echo "::error::semantic-release finished but reported neither a next version nor 'no new version'. Not guessing; check the output above (wrong branch, or a changed message?)." >&2
exit 1
