import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const SCRIPT = join(ROOT, '.github/scripts/plan-release.sh');

let dir: string;
let bin: string;
let repo: string;
let out: string;

function git(...args: string[]) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plan-release-'));
  bin = join(dir, 'bin');
  repo = join(dir, 'repo');
  out = join(dir, 'github-output');
  for (const path of [bin, repo]) spawnSync('mkdir', ['-p', path]);
  writeFileSync(out, '');
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'ci@example.test');
  git('config', 'user.name', 'CI');
  writeFileSync(join(repo, 'a.txt'), 'a');
  git('add', '.');
  git('commit', '-q', '-m', 'feat: first');
  // A stand-in `npx`: records its arguments and plays back a scripted outcome.
  writeFileSync(
    join(bin, 'npx'),
    `#!/usr/bin/env bash
echo "$@" >> "${dir}/npx-calls"
if [ -f "${dir}/npx-output" ]; then cat "${dir}/npx-output"; fi
exit "$(cat "${dir}/npx-exit" 2>/dev/null || echo 0)"
`,
  );
  chmodSync(join(bin, 'npx'), 0o755);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function plan(npx: { output?: string; exit?: number } = {}) {
  if (npx.output !== undefined) writeFileSync(join(dir, 'npx-output'), npx.output);
  if (npx.exit !== undefined) writeFileSync(join(dir, 'npx-exit'), String(npx.exit));
  const result = spawnSync('bash', [SCRIPT], {
    cwd: repo,
    encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH}`, HOME: dir, GITHUB_OUTPUT: out },
  });
  const outputs = Object.fromEntries(
    readFileSync(out, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
  return { result, outputs };
}

const calls = () =>
  readdirSync(dir).includes('npx-calls') ? readFileSync(join(dir, 'npx-calls'), 'utf8') : '';

describe('release planning', () => {
  it('plans the first release as 1.0.0 and asks for the tag', () => {
    const { result, outputs } = plan({
      output: '[semantic-release] › ℹ  The next release version is 1.0.0\n',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(outputs).toEqual({ version: '1.0.0', semver_tag: 'true', new_release: 'true' });
  });

  it('plans a later release from the analyzer result', () => {
    git('tag', 'v1.0.0');
    writeFileSync(join(repo, 'b.txt'), 'b');
    git('add', '.');
    git('commit', '-q', '-m', 'feat: second');
    const { outputs } = plan({ output: 'The next release version is 1.1.0\n' });
    expect(outputs).toEqual({ version: '1.1.0', semver_tag: 'true', new_release: 'true' });
  });

  it('keeps the previous version and publishes only a commit image for a docs-only change', () => {
    git('tag', 'v1.2.0');
    writeFileSync(join(repo, 'README.md'), 'docs');
    git('add', '.');
    git('commit', '-q', '-m', 'docs: explain');
    const { result, outputs } = plan({
      output:
        '[semantic-release] › ℹ  There are no relevant changes, so no new version is released.\n',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(outputs).toEqual({ version: '1.2.0', semver_tag: 'false', new_release: 'false' });
  });

  it('reuses the tag on HEAD for a rerun without running the analyzer again', () => {
    git('tag', 'v1.3.0');
    const { outputs } = plan();
    expect(outputs).toEqual({ version: '1.3.0', semver_tag: 'true', new_release: 'false' });
    expect(calls()).toBe('');
  });

  it('fails when the package install or analysis fails, instead of falling back', () => {
    const { result, outputs } = plan({
      output: 'npm error code ETARGET\nnpm error notarget No matching version found\n',
      exit: 1,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Release analysis failed');
    expect(outputs).toEqual({});
  });

  it('fails on output it does not recognise rather than guessing a version', () => {
    const { result, outputs } = plan({
      output:
        'This test run was triggered on the branch feature, while semantic-release is configured to only publish from main\n',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('neither a next version');
    expect(outputs).toEqual({});
  });

  it('installs the verified, published tool versions', () => {
    plan({ output: 'The next release version is 1.0.0\n' });
    expect(calls()).toContain('semantic-release@24.2.7');
    expect(calls()).toContain('conventional-changelog-conventionalcommits@8.0.0');
  });
});

describe('release tool pins', () => {
  it('are the same everywhere and match the dev dependency the rules are tested against', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    const script = readFileSync(SCRIPT, 'utf8');
    const workflow = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
    const preset = pkg.devDependencies['conventional-changelog-conventionalcommits'];
    expect(preset).toBe('8.0.0');
    expect(script).toContain(`PRESET_VERSION="\${PRESET_VERSION:-${preset}}"`);
    const pins = [
      ...workflow.matchAll(/conventional-changelog-conventionalcommits@([0-9.]+)/g),
    ].map((match) => match[1]);
    expect(pins.length).toBeGreaterThan(0);
    expect(new Set(pins)).toEqual(new Set([preset]));
    const releasers = [...workflow.matchAll(/semantic-release@([0-9.]+)/g)].map(
      (match) => match[1],
    );
    expect(new Set(releasers)).toEqual(new Set(['24.2.7']));
    expect(script).toContain('SEMANTIC_RELEASE_VERSION="${SEMANTIC_RELEASE_VERSION:-24.2.7}"');
  });
});
