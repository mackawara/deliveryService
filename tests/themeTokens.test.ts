import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = join(process.cwd(), 'src');
const THEME_ROOT = join(SOURCE_ROOT, 'theme');
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/**
 * Colours are defined only in the theme layer (specification section 7), so adding a
 * third preset is a registry change rather than a change to feature components.
 */
describe('brand colours stay in the theme layer', () => {
  it('has no hex colour literals outside src/theme', () => {
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((path) => !path.startsWith(THEME_ROOT))
      .flatMap((path) => {
        const lines = readFileSync(path, 'utf8').split('\n');
        return lines.flatMap((line, index) =>
          HEX_COLOUR.test(line)
            ? [`${path.replace(`${process.cwd()}/`, '')}:${index + 1}: ${line.trim()}`]
            : [],
        );
      });

    expect(offenders).toEqual([]);
  });
});
