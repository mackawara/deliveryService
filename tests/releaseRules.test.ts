import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { describe, expect, it } from 'vitest';

/**
 * Runs the REAL commit analyzer and conventional-commits preset (pinned as dev
 * dependencies, the same versions the release job installs) against the rules
 * in .releaserc.json. The analyzer takes the first matching rule, so a rule
 * order mistake silently downgrades a breaking change; these cases pin the
 * agreed SemVer policy.
 */
const config = JSON.parse(readFileSync(resolve(__dirname, '../.releaserc.json'), 'utf8')) as {
  plugins: unknown[];
};
const analyzer = config.plugins.find(
  (plugin): plugin is [string, Record<string, unknown>] =>
    Array.isArray(plugin) && plugin[0] === '@semantic-release/commit-analyzer',
)?.[1];

async function bump(message: string): Promise<string | null> {
  const result = await analyzeCommits(analyzer ?? {}, {
    cwd: process.cwd(),
    commits: [{ hash: 'abc1234', message }],
    logger: { log: () => undefined },
  } as never);
  return (result as string | null) ?? null;
}

describe('release rules (SemVer policy)', () => {
  it.each([
    ['feat!: remove legacy endpoint', 'major'],
    ['fix!: change authentication contract', 'major'],
    ['refactor!: replace payload format', 'major'],
    ['chore!: drop an old runtime', 'major'],
    ['feat: add parcel presets\n\nBREAKING CHANGE: presets are town scoped', 'major'],
    ['feat: add a feature', 'minor'],
    ['fix: correct a total', 'patch'],
    ['perf: speed up a lookup', 'patch'],
    ['revert: undo a change', 'patch'],
    ['build: bump the base image', 'patch'],
    ['build(docker): pin the runtime image', 'patch'],
    ['chore(deps): upgrade a runtime dependency', 'patch'],
    ['fix(deps): bump express', 'patch'],
    ['docs: explain the runbook', null],
    ['ci: tweak a workflow', null],
    ['chore: tidy', null],
    ['test: add a case', null],
    ['style: format', null],
    ['refactor: split a module', null],
  ])('%j bumps %s', async (message, expected) => {
    expect(await bump(message)).toBe(expected);
  });

  it('takes the highest bump when a release mixes commit kinds', async () => {
    const result = await analyzeCommits(analyzer ?? {}, {
      cwd: process.cwd(),
      commits: [
        { hash: 'a', message: 'docs: words' },
        { hash: 'b', message: 'fix: a bug' },
        { hash: 'c', message: 'feat!: a break' },
      ],
      logger: { log: () => undefined },
    } as never);
    expect(result).toBe('major');
  });
});
