#!/usr/bin/env bash
# Decides the version of the commit being published, without creating
# anything. Writes GitHub Actions outputs (to $GITHUB_OUTPUT, or stdout):
#
#   version        SemVer stamped into the image and /api/v1/version
#   semver_tag     true when the image also gets an immutable <version> tag
#   new_release    true when `semantic-release` must still create the Git tag
#
# Cases (conventional commits since the last v* tag):
#   - HEAD already carries a v* tag  -> a rerun: reuse that version
#   - fix/perf/feat/breaking/build   -> next version, tag and release to create
#   - docs/ci/chore only             -> the previous version, commit image only
#   - nothing released yet           -> the first release is 1.0.0
#
# Needs a full-history checkout (fetch-depth: 0) and GITHUB_TOKEN.
set -euo pipefail

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

dry_run="$(npx --yes -p semantic-release@24.2.7 -p conventional-changelog-conventionalcommits@8.0.1 \
  semantic-release --dry-run --no-ci 2>&1 || true)"
echo "${dry_run}" | tail -20

next="$(grep -oE 'next release version is [0-9]+\.[0-9]+\.[0-9]+' <<<"${dry_run}" | tail -1 | awk '{print $NF}' || true)"
if [ -n "${next}" ]; then
  emit version "${next}"
  emit semver_tag true
  emit new_release true
  exit 0
fi

if grep -qiE 'ENOGHTOKEN|EGITNOPERMISSION|EINVALIDGITHUBTOKEN|ENOREPOURL|EBRANCHMISMATCH' <<<"${dry_run}"; then
  echo "::error::semantic-release could not run (token, permission or branch problem); refusing to guess a version." >&2
  exit 1
fi

previous="$(git tag --list 'v*' --merged HEAD | sort -V | tail -1)"
echo "No releasable commits since ${previous:-the start of history}; publishing a commit image only."
if [ -n "${previous}" ]; then emit version "${previous#v}"; else emit version 0.0.0; fi
emit semver_tag false
emit new_release false
