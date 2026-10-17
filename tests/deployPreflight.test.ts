import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let root: string;
let stack: string;
const contract = {
  interface: 'delivery-deploy',
  interface_version: 1,
  bundle_schema: 1,
  commands: ['activate', 'accept', 'rollback', 'rollback-to', 'record', 'status'],
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dashboard-preflight-'));
  stack = join(root, 'stack with spaces');
  mkdirSync(stack);
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(stack, '.stack-name'), 'delivery\n');
  writeFileSync(join(stack, '.env'), 'API_DIGEST=sha256:existing\n');
  writeFileSync(join(stack, 'api.env'), 'EXISTING_SETTINGS=preserved\n');
  // Execute the real remote stdin script locally, with SSH's remote shell
  // parsing, so quoting and ownership behavior are covered without a VM.
  writeFileSync(join(root, 'bin/ssh'), '#!/bin/bash\nshift\nexec bash -c "$*"\n');
  chmodSync(join(root, 'bin/ssh'), 0o755);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function installed(output: unknown = contract) {
  writeFileSync(
    join(stack, 'deploy.sh'),
    `#!/bin/bash\n[ "$1" = compatibility ] || exit 99\nprintf '%s\\n' '${JSON.stringify(output)}'\n`,
  );
}

function preflight() {
  const files = readdirSync(stack);
  const result = spawnSync(
    'bash',
    [resolve('.github/scripts/check-deploy-bundle.sh'), stack, '1'],
    { encoding: 'utf8', env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` } },
  );
  expect(readFileSync(join(stack, '.env'), 'utf8')).toBe('API_DIGEST=sha256:existing\n');
  expect(readFileSync(join(stack, 'api.env'), 'utf8')).toBe('EXISTING_SETTINGS=preserved\n');
  expect(readdirSync(stack)).toEqual(files);
  return result;
}

describe('shared deployment bundle preflight', () => {
  it('accepts the agreed API contract without changing settings or stack files', () => {
    installed();
    const result = preflight();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('compatible');
  });

  it('rejects the legacy positional script with recovery instructions', () => {
    writeFileSync(
      join(stack, 'deploy.sh'),
      '#!/bin/bash\necho "ERROR: unknown service $1 (expected api or dashboard)" >&2\nexit 1\n',
    );
    const result = preflight();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('outdated or incompatible');
    expect(result.stderr).toContain('deliveryBooking Deploy API workflow first');
    expect(result.stderr).toContain('then rerun Deploy Dashboard');
  });

  it.each([
    { ...contract, bundle_schema: 2 },
    { ...contract, interface_version: 2 },
    { ...contract, interface: 'another-stack' },
    { ...contract, commands: ['status'] },
    { ...contract, commands: null },
    null,
  ])('rejects an incompatible contract: %j', (value) => {
    installed(value);
    expect(preflight().status).toBe(1);
  });

  it('rejects malformed output even when the probe exits successfully', () => {
    writeFileSync(join(stack, 'deploy.sh'), '#!/bin/bash\necho legacy-status\n');
    expect(preflight().status).toBe(1);
  });

  it('refuses a foreign ownership marker before running its script', () => {
    writeFileSync(join(stack, '.stack-name'), 'grocery\n');
    writeFileSync(join(stack, 'deploy.sh'), '#!/bin/bash\ntouch must-not-run\n');
    expect(preflight().status).toBe(1);
  });

  it('rejects a missing installed bundle', () => {
    expect(preflight().status).toBe(1);
  });

  it('checks compatibility before activation and before manual rollback', () => {
    const workflow = readFileSync(resolve('.github/workflows/deploy.yml'), 'utf8');
    const deploy = workflow.slice(workflow.indexOf('  deploy:'), workflow.indexOf('  rollback:'));
    const rollback = workflow.slice(workflow.indexOf('  rollback:'));
    expect(deploy.indexOf('check-deploy-bundle.sh')).toBeLessThan(deploy.indexOf('id: activate'));
    expect(deploy).toContain("if: ${{ always() && steps.preflight.outcome == 'success' }}");
    expect(rollback.indexOf('check-deploy-bundle.sh')).toBeLessThan(
      rollback.indexOf('Read the verified record'),
    );
  });
});
