import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, '../.github/scripts/publish-image.sh');
const SHA = 'a'.repeat(40);
const DIGEST = `sha256:${'b'.repeat(64)}`;
let dir: string;
let bin: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'publish-image-'));
  bin = join(dir, 'bin');
  mkdirSync(bin);
  mkdirSync(join(dir, '.github/scripts'), { recursive: true });
  writeFileSync(join(dir, 'calls'), '');
  writeFileSync(join(dir, 'output'), '');
  writeFileSync(
    join(bin, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$CALLS"
if [ "$1 $2" = 'buildx imagetools' ]; then
  result="$COMMIT_LOOKUP"
  [ "$4" != "$IMAGE:$VERSION" ] || result="$VERSION_LOOKUP"
  case "$result" in
    missing) echo "ERROR: $4: not found" >&2; exit 1 ;;
    manifest) echo 'manifest unknown: manifest unknown' >&2; exit 1 ;;
    network) echo 'failed to do request: connection reset by peer' >&2; exit 1 ;;
    auth) echo 'unauthorized: authentication required' >&2; exit 1 ;;
    rate) echo 'toomanyrequests: rate limit exceeded' >&2; exit 1 ;;
    invalid) echo '<nil>' ;;
    *) echo "$DIGEST" ;;
  esac
elif [ "$1" = inspect ]; then
  case "$*" in
    *image.revision*) echo "$SHA" ;;
    *image.version*) echo "$IMAGE_VERSION" ;;
    *RepoDigests*) echo "$IMAGE@$DIGEST" ;;
  esac
fi
`,
  );
  chmodSync(join(bin, 'docker'), 0o755);
  writeFileSync(join(dir, '.github/scripts/container-smoke.sh'), '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(join(dir, '.github/scripts/container-smoke.sh'), 0o755);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function publish(overrides: Record<string, string> = {}) {
  const result = spawnSync('bash', [SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      IMAGE: 'example/delivery',
      SHA,
      VERSION: '1.2.3',
      IMAGE_VERSION: '1.2.3',
      BUILD_TIME: '2026-10-18T00:00:00Z',
      SEMVER_TAG: 'true',
      DIGEST,
      CALLS: join(dir, 'calls'),
      GITHUB_OUTPUT: join(dir, 'output'),
      COMMIT_LOOKUP: 'existing',
      VERSION_LOOKUP: 'existing',
      ...overrides,
    },
  });
  return {
    result,
    calls: readFileSync(join(dir, 'calls'), 'utf8'),
    output: readFileSync(join(dir, 'output'), 'utf8'),
  };
}

describe('immutable image publication', () => {
  it.each(['network', 'auth', 'rate', 'invalid'])(
    'stops before building or pushing when a commit lookup fails: %s',
    (failure) => {
      const { result, calls, output } = publish({ COMMIT_LOOKUP: failure });
      expect(result.status).not.toBe(0);
      expect(calls).not.toMatch(/^(build |push |tag )/m);
      expect(output).toBe('');
    },
  );

  it('does not replace a semver tag when its lookup fails', () => {
    const { result, calls } = publish({ VERSION_LOOKUP: 'network' });
    expect(result.status).not.toBe(0);
    expect(calls).not.toMatch(/^(build |push |tag )/m);
  });

  it.each(['missing', 'manifest'])(
    'publishes when the registry explicitly reports a missing manifest: %s',
    (missing) => {
      const { result, calls, output } = publish({
        COMMIT_LOOKUP: missing,
        VERSION_LOOKUP: missing,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(calls).toContain(`push example/delivery:${SHA}`);
      expect(calls).toContain('push example/delivery:1.2.3');
      expect(output).toContain(`digest=${DIGEST}`);
      expect(output).toContain('reused=false');
    },
  );

  it('reuses a matching commit image without building or pushing', () => {
    const { result, calls, output } = publish();
    expect(result.status, result.stderr).toBe(0);
    expect(calls).not.toMatch(/^(build |push |tag )/m);
    expect(output).toContain('reused=true');
  });

  it('refuses to reuse an image whose baked version differs from the release plan', () => {
    const { result, calls, output } = publish({ IMAGE_VERSION: '1.2.2' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("was built as version '1.2.2', not '1.2.3'");
    expect(calls).not.toMatch(/^(build |push |tag )/m);
    expect(output).toBe('');
  });
});
