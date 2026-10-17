#!/usr/bin/env node
// Verifies a production bundle before it can become an image.
//
//   node scripts/check-dist.mjs [dist] [--version X] [--revision SHA] [--maps-key KEY]
//                               [--require-build-time]
//
// A bundle fails when it
//   - lacks index.html or version.json, or version.json disagrees with the
//     version/revision it was supposed to be built as;
//   - carries the browser API mocks (MSW worker script or its runtime);
//   - mentions a server-side secret setting. Only public VITE_* configuration
//     and the restricted browser Maps key may reach the browser.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Names of settings that belong to the API and must never be in a frontend build. */
export const SERVER_SECRET_NAMES = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_FLOW_PRIVATE_KEY',
  'PAYNOW_INTEGRATION_KEY',
  'MEDIA_SIGNING_SECRET',
  'ADAPTER_API_KEY',
  'BOOTSTRAP_ADMIN_API_KEY',
  'AUTH_SECRET',
  'MONGODB_URI',
  'DOCKERHUB_TOKEN',
  'SSH_PRIVATE_KEY',
];

/** Markers of the in-browser mock API in a built bundle. */
export const MOCK_MARKERS = ['setupWorker', 'mockServiceWorker', 'MOCK_SERVICE_WORKER'];

function* walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

export function checkDist(directory, { version, revision, mapsKey, requireBuildTime } = {}) {
  const problems = [];
  if (!existsSync(join(directory, 'index.html'))) problems.push('index.html is missing.');
  const versionPath = join(directory, 'version.json');
  if (!existsSync(versionPath)) {
    problems.push('version.json is missing.');
  } else {
    const info = JSON.parse(readFileSync(versionPath, 'utf8'));
    if (version && info.version !== version)
      problems.push(`version.json says ${info.version}, expected ${version}.`);
    if (revision && info.revision !== revision)
      problems.push(`version.json says revision ${info.revision}, expected ${revision}.`);
    if (requireBuildTime && (!info.buildTime || info.buildTime === 'unknown'))
      problems.push('version.json has no build time.');
  }
  if (existsSync(join(directory, 'mockServiceWorker.js'))) {
    problems.push('mockServiceWorker.js is in the bundle: browser API mocks must not ship.');
  }
  let mapsKeySeen = false;
  for (const file of walk(directory)) {
    if (!/\.(js|html|json|css)$/.test(file) || file.endsWith('version.json')) continue;
    const text = readFileSync(file, 'utf8');
    for (const marker of MOCK_MARKERS) {
      if (text.includes(marker)) problems.push(`${file} contains the mock API marker "${marker}".`);
    }
    for (const name of SERVER_SECRET_NAMES) {
      if (text.includes(name)) problems.push(`${file} mentions the server-side setting ${name}.`);
    }
    if (mapsKey && text.includes(mapsKey)) mapsKeySeen = true;
  }
  if (mapsKey && !mapsKeySeen)
    problems.push('The Google Maps browser key was expected in the bundle but is absent.');
  return problems;
}

function main(argv) {
  const option = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const directory =
    argv.find(
      (arg) =>
        !arg.startsWith('--') &&
        arg !== option('--version') &&
        arg !== option('--revision') &&
        arg !== option('--maps-key'),
    ) ?? 'dist';
  const problems = checkDist(directory, {
    version: option('--version'),
    revision: option('--revision'),
    mapsKey: option('--maps-key'),
    requireBuildTime: argv.includes('--require-build-time'),
  });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAILED: ${problem}`);
    process.exit(1);
  }
  console.log(`${directory} is a valid production bundle.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
