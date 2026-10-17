import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error plain ES module shared with the Dockerfile
import { checkDist } from '../scripts/check-dist.mjs';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function bundle(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'dist-'));
  directories.push(directory);
  mkdirSync(join(directory, 'assets'));
  const base = {
    'index.html': '<div id="root"></div>',
    'version.json': JSON.stringify({ version: '1.0.0', revision: 'abc1234', buildTime: 'now' }),
    'assets/app.js': 'console.log("app")',
  };
  for (const [name, content] of Object.entries({ ...base, ...files })) {
    writeFileSync(join(directory, name), content);
  }
  return directory;
}

describe('production bundle check', () => {
  it('accepts a clean bundle that matches the build', () => {
    const dist = bundle({});
    expect(checkDist(dist, { version: '1.0.0', revision: 'abc1234' })).toEqual([]);
  });

  it('rejects a version or revision that is not the one being built', () => {
    const dist = bundle({});
    expect(checkDist(dist, { version: '2.0.0' })[0]).toContain('expected 2.0.0');
    expect(checkDist(dist, { revision: 'zzz' })[0]).toContain('expected zzz');
  });

  it('requires a build time only for release builds', () => {
    const dist = bundle({
      'version.json': JSON.stringify({ version: '1', revision: 'a', buildTime: 'unknown' }),
    });
    expect(checkDist(dist, {})).toEqual([]);
    expect(checkDist(dist, { requireBuildTime: true })[0]).toContain('build time');
  });

  it('rejects the browser API mocks', () => {
    expect(checkDist(bundle({ 'mockServiceWorker.js': '// worker' }), {}).join()).toContain(
      'mockServiceWorker.js',
    );
    expect(checkDist(bundle({ 'assets/app.js': 'setupWorker(handlers)' }), {}).join()).toContain(
      'setupWorker',
    );
  });

  it('rejects any server-side secret setting name', () => {
    const problems = checkDist(
      bundle({ 'assets/app.js': 'const k = "PAYNOW_INTEGRATION_KEY"' }),
      {},
    );
    expect(problems.join()).toContain('PAYNOW_INTEGRATION_KEY');
  });

  it('expects the restricted browser Maps key only when one was configured', () => {
    expect(checkDist(bundle({}), { mapsKey: 'AIzaKEY' }).join()).toContain('Maps browser key');
    expect(checkDist(bundle({ 'assets/app.js': 'key="AIzaKEY"' }), { mapsKey: 'AIzaKEY' })).toEqual(
      [],
    );
  });

  it('rejects a bundle without its entry points', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dist-'));
    directories.push(directory);
    expect(checkDist(directory, {}).join()).toContain('index.html');
  });
});
