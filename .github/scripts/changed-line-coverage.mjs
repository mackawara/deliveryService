#!/usr/bin/env node
// Reports (and optionally enforces) line coverage of the lines a change adds.
//
//   changed-line-coverage.mjs <lcov.info> <base-ref> [--min 80] [--enforce]
//
// Only executable source lines count: a line the coverage tool never
// instrumented (comments, types, blank lines) is not "uncovered". A change
// with no executable source lines, such as a documentation-only PR, passes
// with an explicit message instead of failing on an empty denominator, so
// required checks cannot deadlock on it.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** @returns {Map<string, Map<number, number>>} file -> line -> hit count */
export function parseLcov(text) {
  const files = new Map();
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('SF:')) {
      current = new Map();
      files.set(line.slice(3), current);
    } else if (line.startsWith('DA:') && current) {
      const [number, hits] = line.slice(3).split(',');
      current.set(Number(number), Number(hits));
    } else if (line === 'end_of_record') {
      current = null;
    }
  }
  return files;
}

/** @returns {Map<string, Set<number>>} file -> added line numbers (new side) */
export function parseAddedLines(diff) {
  const added = new Map();
  let file = null;
  let next = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.startsWith('+++ b/') ? line.slice(6) : null;
      if (file) added.set(file, new Set());
    } else if (line.startsWith('@@')) {
      const match = /\+(\d+)(?:,(\d+))?/.exec(line);
      next = match ? Number(match[1]) : 0;
    } else if (file && line.startsWith('+') && !line.startsWith('+++')) {
      added.get(file).add(next);
      next += 1;
    } else if (file && !line.startsWith('-') && !line.startsWith('\\')) {
      next += 1;
    }
  }
  return added;
}

export function changedLineCoverage(
  coverage,
  added,
  isSource = (file) => /^src\/.*\.tsx?$/.test(file),
) {
  let covered = 0;
  let total = 0;
  const uncovered = [];
  for (const [file, lines] of added) {
    if (!isSource(file)) continue;
    const hits = [...coverage.entries()].find(
      ([path]) => path === file || path.endsWith(`/${file}`),
    )?.[1];
    for (const lineNumber of lines) {
      const count = hits?.get(lineNumber);
      if (count === undefined) continue; // not an executable line
      total += 1;
      if (count > 0) covered += 1;
      else uncovered.push(`${file}:${lineNumber}`);
    }
  }
  return { covered, total, uncovered, percent: total === 0 ? null : (covered / total) * 100 };
}

export function evaluate(result, minimum, enforce) {
  if (result.total === 0) {
    return {
      ok: true,
      message: 'No executable source lines changed; changed-line coverage does not apply.',
    };
  }
  const summary = `Changed-line coverage: ${result.percent.toFixed(1)}% (${result.covered}/${result.total}), minimum ${minimum}%.`;
  const meets = result.percent >= minimum;
  if (meets) return { ok: true, message: summary };
  const detail = `${summary}\nUncovered: ${result.uncovered.slice(0, 30).join(', ')}`;
  return enforce
    ? { ok: false, message: detail }
    : {
        ok: true,
        message: `${detail}\n(report only; set ENFORCE_CHANGED_LINE_COVERAGE=true to enforce)`,
      };
}

function main(argv) {
  const [lcovPath, baseRef, ...rest] = argv;
  if (!lcovPath || !baseRef) {
    console.error('usage: changed-line-coverage.mjs <lcov.info> <base-ref> [--min N] [--enforce]');
    process.exit(2);
  }
  const minIndex = rest.indexOf('--min');
  const minimum = minIndex >= 0 ? Number(rest[minIndex + 1]) : 80;
  const enforce = rest.includes('--enforce');
  const diff = execFileSync(
    'git',
    ['diff', '--unified=0', '--no-color', `${baseRef}...HEAD`, '--', 'src'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const result = changedLineCoverage(
    parseLcov(readFileSync(lcovPath, 'utf8')),
    parseAddedLines(diff),
  );
  const verdict = evaluate(result, minimum, enforce);
  console.log(verdict.message);
  process.exit(verdict.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
