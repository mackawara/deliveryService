// A successful workflow must account for every skipped deployment explicitly.
import { appendFileSync, writeSync } from 'node:fs';

const needs = JSON.parse(process.env.RESULTS || '{}');
const rollback = process.env.ROLLBACK_TO || '';
const externalRequired = process.env.EXTERNAL_REQUIRED === 'true';
const errors = [];
function requireResult(job, expected) {
  const actual = needs[job]?.result;
  if (actual !== expected) errors.push(`${job}: expected ${expected}, got ${actual ?? 'missing'}`);
}

let outcome;
if (rollback) {
  requireResult('rollback', 'success');
  for (const job of ['ci', 'external-checks', 'plan', 'publish', 'release', 'guard', 'deploy']) {
    requireResult(job, 'skipped');
  }
  outcome = 'Manual rollback completed and accepted.';
} else {
  requireResult('rollback', 'skipped');
  for (const job of ['ci', 'plan', 'publish', 'guard']) requireResult(job, 'success');
  if (externalRequired || needs['external-checks']?.result !== 'skipped') {
    requireResult('external-checks', 'success');
  }
  const newRelease = needs.plan?.outputs?.new_release;
  if (!['true', 'false'].includes(newRelease))
    errors.push('plan: missing valid new_release output');
  requireResult('release', newRelease === 'true' ? 'success' : 'skipped');

  const proceed = needs.guard?.outputs?.proceed;
  if (proceed === 'false') {
    requireResult('deploy', 'skipped');
    outcome = 'Revision superseded by main; image published, deployment intentionally skipped.';
  } else {
    if (proceed !== 'true') errors.push('guard: missing explicit proceed output');
    requireResult('deploy', 'success');
    outcome = 'Deployment completed and accepted.';
  }
}

const message = errors.length
  ? `Deployment outcome failed:\n${errors.map((error) => `- ${error}`).join('\n')}\nInspect the required checks and deploy job; an expected deployment must not be silently skipped.`
  : outcome;
writeSync(1, `${message}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Deployment outcome\n\n${message}\n`);
}
if (errors.length) process.exitCode = 1;
