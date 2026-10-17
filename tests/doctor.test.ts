import { describe, expect, it } from 'vitest';

// @ts-expect-error plain ES module shared with the CI workflow
import * as doctor from '../scripts/doctor.mjs';

const finding = (severity: string) => ({
  severity,
  rule: 'effect-needs-cleanup',
  filePath: 'src/a.tsx',
  line: 3,
  title: 'Something',
});

const report = (overrides: Record<string, unknown> = {}) => ({
  error: null,
  reactDetected: true,
  diagnostics: [],
  ...overrides,
});

describe('React Doctor verdict', () => {
  it('passes a clean report', () => {
    expect(doctor.evaluateReport(report(), { check: true }).ok).toBe(true);
  });

  it('blocks on errors in check mode but only reports them in advisory mode', () => {
    const withError = report({ diagnostics: [finding('error')] });
    expect(doctor.evaluateReport(withError, { check: true }).ok).toBe(false);
    expect(doctor.evaluateReport(withError, { check: false }).ok).toBe(true);
  });

  it('keeps warnings visible and passing', () => {
    const result = doctor.evaluateReport(report({ diagnostics: [finding('warning')] }), {
      check: true,
    });
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(doctor.describe(result, { check: true })).toContain('src/a.tsx:3');
  });

  it.each([
    ['a scanner error', report({ error: 'boom' })],
    ['an undetected React project', report({ reactDetected: false })],
    ['a report with no diagnostics list', report({ diagnostics: undefined })],
    ['no report at all', null],
  ])('fails on %s even in advisory mode', (_name, input) => {
    expect(doctor.evaluateReport(input, { check: false }).ok).toBe(false);
  });
});
