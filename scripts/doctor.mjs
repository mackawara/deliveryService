#!/usr/bin/env node
// Runs the pinned React Doctor CLI and turns its report into a CI verdict.
//
//   node scripts/doctor.mjs            advisory: print everything, never fail on findings
//   node scripts/doctor.mjs --check    blocking: fail when any finding is an error
//
// Whatever the mode, a scanner that could not run or produced no readable
// report fails: "no findings" must never mean "nothing was scanned".
// Warnings stay visible in both modes and there is no score threshold.
// Optional telemetry, score sharing and the supply-chain service are off.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPORT_DIR = 'doctor-report';
export const EXPECTED_VERSION = '0.9.18';

/** Pure: decides the outcome of a parsed report. */
export function evaluateReport(report, { check }) {
  const problems = [];
  if (!report || typeof report !== 'object') {
    return {
      ok: false,
      problems: ['React Doctor produced no readable report.'],
      errors: [],
      warnings: [],
    };
  }
  if (report.error) problems.push(`React Doctor reported a failure: ${String(report.error)}`);
  if (report.reactDetected !== true)
    problems.push('React was not detected, so nothing was scanned.');
  if (!Array.isArray(report.diagnostics)) problems.push('The report has no diagnostics list.');
  const diagnostics = Array.isArray(report.diagnostics) ? report.diagnostics : [];
  const errors = diagnostics.filter((entry) => entry.severity === 'error');
  const warnings = diagnostics.filter((entry) => entry.severity !== 'error');
  if (check && errors.length > 0) {
    problems.push(
      `${errors.length} error-level finding(s) must be fixed (or narrowly documented in doctor.config.json).`,
    );
  }
  return { ok: problems.length === 0, problems, errors, warnings };
}

const format = (entry) =>
  `  ${entry.severity.padEnd(7)} ${entry.rule}  ${entry.filePath}:${entry.line}\n          ${entry.title}`;

export function describe(result, { check }) {
  const lines = [];
  if (result.errors.length > 0) {
    lines.push(`Errors (${result.errors.length}):`, ...result.errors.map(format));
  }
  if (result.warnings.length > 0) {
    lines.push(`Warnings (${result.warnings.length}, advisory):`, ...result.warnings.map(format));
  }
  lines.push(
    `React Doctor (${check ? 'blocking on errors' : 'advisory'}): ${result.errors.length} error(s), ${result.warnings.length} warning(s).`,
  );
  for (const problem of result.problems) lines.push(`FAILED: ${problem}`);
  return lines.join('\n');
}

function main(argv) {
  const check = argv.includes('--check');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const pinned = JSON.parse(
    readFileSync(join(root, 'node_modules', 'react-doctor', 'package.json'), 'utf8'),
  ).version;
  if (pinned !== EXPECTED_VERSION) {
    console.error(
      `FAILED: react-doctor ${pinned} is installed, but ${EXPECTED_VERSION} is the pinned, validated version.`,
    );
    process.exit(1);
  }
  const binary = join(root, 'node_modules', '.bin', 'react-doctor');
  rmSync(join(root, REPORT_DIR), { recursive: true, force: true });
  mkdirSync(join(root, REPORT_DIR), { recursive: true });
  const reportPath = join(root, REPORT_DIR, 'report.json');
  const run = spawnSync(
    binary,
    [
      '--json',
      '--json-out',
      reportPath,
      '--output-dir',
      join(root, REPORT_DIR, 'details'),
      // No score API, share URL, crash reporting or supply-chain lookups.
      '--no-score',
      '--no-telemetry',
      '--no-supply-chain',
      // Findings are judged from the report below, not from the exit code.
      '--blocking',
      'none',
    ],
    { cwd: root, encoding: 'utf8', env: { ...process.env, CI: 'true' } },
  );
  if (run.error || run.status === null) {
    console.error(`FAILED: could not run react-doctor: ${run.error?.message ?? run.signal}`);
    process.exit(1);
  }
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    console.error(`FAILED: no readable report at ${reportPath} (${error.message}).\n${run.stderr}`);
    process.exit(1);
  }
  const result = evaluateReport(report, { check });
  console.log(describe(result, { check }));
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
