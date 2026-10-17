#!/usr/bin/env bash
# Runs on the Actions runner. Only the ownership check and read-only probe run
# on the VM; JSON validation uses the runner's Node, with no new VM dependency.
set -euo pipefail
root="${1:?deploy path required}"
schema="${2:?bundle schema required}"
recovery='The shared delivery deployment bundle is outdated or incompatible. Complete the corrected deliveryBooking Deploy API workflow first, verify deploy.sh compatibility, then rerun Deploy Dashboard. Check DEPLOY_PATH if this is not the delivery stack.'

# %q quotes the local path for SSH's remote command parser.
# shellcheck disable=SC2029
if ! report="$(timeout 30s ssh deploy-host bash -s -- "$(printf '%q' "${root}")" <<'REMOTE'
set -euo pipefail
cd "$1" 2>/dev/null
[ "$(cat .stack-name 2>/dev/null)" = delivery ]
[ -f deploy.sh ]
bash ./deploy.sh compatibility 2>/dev/null
REMOTE
)"; then
  echo "::error::${recovery}" >&2
  exit 1
fi

if ! REPORT="${report}" SCHEMA="${schema}" node --input-type=module <<'NODE'
let contract;
try { contract = JSON.parse(process.env.REPORT); } catch { process.exit(1); }
const commands = ['activate', 'accept', 'rollback', 'rollback-to', 'record', 'status'];
if (!contract || contract.interface !== 'delivery-deploy' || contract.interface_version !== 1 ||
    String(contract.bundle_schema) !== process.env.SCHEMA ||
    !Array.isArray(contract.commands) || !commands.every((command) => contract.commands.includes(command))) {
  process.exit(1);
}
NODE
then
  echo "::error::${recovery}" >&2
  exit 1
fi
echo "Shared delivery deployment interface 1, bundle schema ${schema}: compatible."
