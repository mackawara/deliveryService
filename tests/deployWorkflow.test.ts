import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const workflow = readFileSync(resolve(root, '.github/workflows/deploy.yml'), 'utf8');
const api = workflow.includes('name: Deploy API');
const jobs = Object.fromEntries(
  [...workflow.matchAll(/^ {2}([\w-]+):\n([\s\S]*?)(?=^ {2}[\w-]+:\n|$(?![\s\S]))/gm)].map(
    (match) => [match[1], match[2]],
  ),
);
type Job = { result: string; outputs: Record<string, string> };
type Results = Record<string, Job>;
const normalJobs = ['ci', 'external-checks', 'plan', 'publish', 'release', 'guard', 'deploy'];

// Evaluate the expressions from the real YAML. Jobs with no status function
// receive Actions' implicit success(), including the skipped-ancestor behavior
// responsible for this regression. No substitute condition is tested here.
function condition(job: string, needs: Results, rollback = '', cancelled = false, enabled = false) {
  const expression = jobs[job].match(/ {4}if: \$\{\{ (.+) \}\}/)?.[1];
  const inheritedSuccess = Object.values(needs).every((value) => value.result === 'success');
  if (!expression) return inheritedSuccess;
  if (!/\b(always|cancelled|success|failure)\(/.test(expression) && !inheritedSuccess) return false;
  return Boolean(
    runInNewContext(expression.replace(/needs\.([\w-]+)/g, 'needs["$1"]'), {
      needs,
      inputs: { rollback_to: rollback },
      vars: { CODEQL_ENABLED: enabled ? 'true' : '', REQUIRED_STATUS_CHECKS: '' },
      cancelled: () => cancelled,
      always: () => true,
    }),
  );
}

function pipeline({
  ci = 'success',
  external = api ? 'skipped' : 'success',
  newRelease = 'true',
  proceed = 'true',
  rollback = '',
  cancelled = false,
  enabled = false,
} = {}): Results {
  const needs: Results = {};
  needs.ci = { result: rollback ? 'skipped' : ci, outputs: {} };
  needs['external-checks'] = { result: rollback ? 'skipped' : external, outputs: {} };
  // Include every ancestor when modeling default success(): a skipped optional
  // check must not suppress publish, nor a skipped release suppress deployment.
  for (const job of ['plan', 'publish', 'release', 'guard', 'deploy']) {
    const run = condition(job, needs, rollback, cancelled, enabled);
    needs[job] = {
      result: run ? 'success' : 'skipped',
      outputs: !run ? {} : job === 'plan' ? { new_release: newRelease } : {},
    };
    if (job === 'guard' && run) needs.guard.outputs.proceed = proceed;
  }
  needs.rollback = { result: rollback ? 'success' : 'skipped', outputs: {} };
  return needs;
}

function outcome(needs: Results, rollback = '', enabled = !api) {
  return spawnSync('node', [resolve(root, '.github/scripts/deploy-outcome.mjs')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      RESULTS: JSON.stringify(needs),
      ROLLBACK_TO: rollback,
      EXTERNAL_REQUIRED: String(enabled),
      GITHUB_STEP_SUMMARY: '',
    },
  });
}

describe('deployment job conditions and final outcome', () => {
  it.each(['true', 'false'])('publishes and deploys with new_release=%s', (newRelease) => {
    const needs = pipeline({ newRelease });
    expect(needs.publish.result).toBe('success');
    expect(needs.release.result).toBe(newRelease === 'true' ? 'success' : 'skipped');
    expect(needs.guard.result).toBe('success');
    expect(needs.deploy.result).toBe('success');
    expect(outcome(needs).status).toBe(0);
  });

  it('runs with enabled, passing external analysis', () => {
    const needs = pipeline({ enabled: true, external: 'success' });
    expect(needs.deploy.result).toBe('success');
    expect(outcome(needs, '', true).status).toBe(0);
  });

  it.each(['failure', 'cancelled', 'skipped'])('blocks required CI result %s', (ci) => {
    const needs = pipeline({ ci });
    expect(needs.publish.result).toBe('skipped');
    expect(needs.deploy.result).toBe('skipped');
    expect(outcome(needs).status).toBe(1);
  });

  it.each(['failure', 'cancelled', 'skipped'])('blocks enabled external result %s', (external) => {
    const needs = pipeline({ external, enabled: true });
    expect(needs.publish.result).toBe('skipped');
    expect(needs.deploy.result).toBe('skipped');
    expect(outcome(needs, '', true).status).toBe(1);
  });

  it('blocks publication and activation in a cancelled run', () => {
    const needs = pipeline({ cancelled: true });
    expect(needs.publish.result).toBe('skipped');
    expect(needs.deploy.result).toBe('skipped');
    expect(outcome(needs).status).toBe(1);
  });

  it('permits an explicit superseded revision', () => {
    const needs = pipeline({ proceed: 'false' });
    expect(needs.publish.result).toBe('success');
    expect(needs.deploy.result).toBe('skipped');
    const result = outcome(needs);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('superseded');
  });

  it('permits only a completed manual rollback', () => {
    const needs = pipeline({ rollback: 'verified-run' });
    for (const job of normalJobs) expect(needs[job].result).toBe('skipped');
    expect(outcome(needs, 'verified-run').status).toBe(0);
    for (const result of ['skipped', 'failure', 'cancelled']) {
      needs.rollback.result = result;
      expect(outcome(needs, 'verified-run').status).toBe(1);
    }
  });

  it.each(['plan', 'publish', 'release', 'guard', 'deploy'])(
    'rejects an unexpectedly skipped %s',
    (job) => {
      const needs = pipeline();
      needs[job].result = 'skipped';
      const result = outcome(needs);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(`${job}: expected success, got skipped`);
    },
  );

  it('does not allow a skipped or failed release to pass the guard', () => {
    const needs = pipeline();
    for (const result of ['skipped', 'failure', 'cancelled']) {
      needs.release.result = result;
      expect(condition('guard', needs)).toBe(false);
    }
  });

  it('requires an explicit guard output before accepting a skipped deploy', () => {
    const needs = pipeline({ proceed: 'false' });
    delete needs.guard.outputs.proceed;
    expect(outcome(needs).status).toBe(1);
    needs.guard.outputs.proceed = 'false';
    needs.guard.result = 'failure';
    expect(outcome(needs).status).toBe(1);
  });

  it('wires an unconditional final check to every job and its policy inputs', () => {
    expect(jobs.outcome).toContain('if: ${{ always() }}');
    expect(jobs.outcome).toContain(
      'needs: [ci, external-checks, plan, publish, release, guard, deploy, rollback]',
    );
    expect(jobs.outcome).toContain('RESULTS: ${{ toJSON(needs) }}');
    expect(jobs.outcome).toContain('ROLLBACK_TO: ${{ inputs.rollback_to }}');
    expect(jobs.outcome).toContain('EXTERNAL_REQUIRED:');
    expect(jobs.outcome).toContain('node .github/scripts/deploy-outcome.mjs');
  });
});
