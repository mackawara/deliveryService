#!/usr/bin/env bash
# Waits until every named check has SUCCEEDED for one exact commit.
#
#   require-checks.sh <owner/repo> <sha> <timeout-seconds> <check-name>...
#
# A check counts only when its head SHA is the one given, so a green result
# from another commit (an older run, a PR head) can never release this one.
# A failed, cancelled, timed-out or missing check fails the script. Names
# match both check runs (GitHub Actions, CodeQL) and commit statuses (Codacy).
set -euo pipefail

REPO="${1:?usage: require-checks.sh <owner/repo> <sha> <timeout> <check>...}"
SHA="${2:?}"
TIMEOUT="${3:?}"
shift 3
[ $# -gt 0 ] || { echo "no checks required"; exit 0; }

deadline=$(($(date +%s) + TIMEOUT))
while :; do
  runs="$(gh api --paginate "repos/${REPO}/commits/${SHA}/check-runs?per_page=100" --jq '.check_runs[] | [.name, .status, (.conclusion // ""), .head_sha] | @tsv')"
  statuses="$(gh api --paginate "repos/${REPO}/commits/${SHA}/statuses?per_page=100" --jq '.[] | [.context, .state] | @tsv')"
  pending=()
  for name in "$@"; do
    outcome=missing
    # Latest status per context wins (the API lists newest first).
    state="$(awk -F'\t' -v n="${name}" '$1==n {print $2; exit}' <<<"${statuses}")"
    if [ -n "${state}" ]; then
      case "${state}" in success) outcome=success ;; pending) outcome=pending ;; *) outcome=failed ;; esac
    fi
    while IFS=$'\t' read -r run_name run_status conclusion head; do
      [ "${run_name}" = "${name}" ] && [ "${head}" = "${SHA}" ] || continue
      if [ "${run_status}" != completed ]; then outcome=pending
      elif [ "${conclusion}" = success ]; then outcome=success
      else outcome=failed; fi
      break
    done <<<"${runs}"
    case "${outcome}" in
      failed) echo "::error::Required check '${name}' did not succeed for ${SHA}." >&2; exit 1 ;;
      success) ;;
      *) pending+=("${name} (${outcome})") ;;
    esac
  done
  if [ ${#pending[@]} -eq 0 ]; then echo "All required checks succeeded for ${SHA}."; exit 0; fi
  if [ "$(date +%s)" -ge "${deadline}" ]; then
    echo "::error::Timed out waiting for: ${pending[*]} on ${SHA}." >&2
    exit 1
  fi
  echo "Waiting for: ${pending[*]}"
  sleep 20
done
