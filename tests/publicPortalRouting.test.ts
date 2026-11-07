import { createServer as createHttpServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { http, passthrough } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, preview, type PreviewServer, type ViteDevServer } from 'vite';

import { mockServer } from '@/mocks/server';

const upstreamRequests: string[] = [];
let upstream: Server;
let development: ViteDevServer;
let builtPreview: PreviewServer;
let previewDirectory: string;
const origins: Record<string, string> = {};

function originOf(server: Pick<Server, 'address'>): string {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP listener.');
  return `http://127.0.0.1:${address.port}`;
}

function closeServer(server: Server | PreviewServer['httpServer']): Promise<void> {
  if ('closeAllConnections' in server) server.closeAllConnections();
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

beforeAll(async () => {
  upstream = createHttpServer((request, response) => {
    const url = request.url ?? '/';
    upstreamRequests.push(url);
    response.setHeader('x-served-by', 'delivery-api');
    if (url === '/login?simulate=unavailable') {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ code: 'PORTAL_UNAVAILABLE' }));
      return;
    }
    if (url.startsWith('/site/')) {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end('window.deliveryPortal = true;');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      '<!doctype html><title>Delivery service</title><main>Public delivery portal</main>',
    );
  });
  await new Promise<void>((resolveListen) => upstream.listen(0, '127.0.0.1', resolveListen));

  previewDirectory = await mkdtemp(join(tmpdir(), 'delivery-portal-preview-'));
  await writeFile(
    join(previewDirectory, 'index.html'),
    '<!doctype html><title>Dashboard</title><div id="root">Existing dashboard shell</div>',
  );

  const previousTarget = process.env.VITE_DEV_API_PROXY_TARGET;
  const previousMockApi = process.env.VITE_ENABLE_MOCK_API;
  process.env.VITE_DEV_API_PROXY_TARGET = originOf(upstream);
  process.env.VITE_ENABLE_MOCK_API = 'false';
  try {
    development = await createServer({
      configFile: resolve('vite.config.ts'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
    });
    await development.listen();
    origins.development = originOf(development.httpServer!);
    builtPreview = await preview({
      configFile: resolve('vite.config.ts'),
      logLevel: 'silent',
      build: { outDir: previewDirectory },
      preview: { host: '127.0.0.1', port: 0 },
    });
    origins.preview = originOf(builtPreview.httpServer);
  } finally {
    if (previousTarget === undefined) delete process.env.VITE_DEV_API_PROXY_TARGET;
    else process.env.VITE_DEV_API_PROXY_TARGET = previousTarget;
    if (previousMockApi === undefined) delete process.env.VITE_ENABLE_MOCK_API;
    else process.env.VITE_ENABLE_MOCK_API = previousMockApi;
  }
}, 30_000);

beforeEach(() => {
  // These exercise real HTTP listeners; the normal component suite's mock API
  // must not answer them or intercept the proxy's connection to its upstream.
  mockServer.use(http.all('*', () => passthrough()));
  upstreamRequests.length = 0;
});

afterAll(async () => {
  await development?.close();
  if (builtPreview) await closeServer(builtPreview.httpServer);
  if (upstream) await closeServer(upstream);
  if (previewDirectory) await rm(previewDirectory, { recursive: true, force: true });
});

describe.each(['development', 'preview'])('%s public portal routing', (server) => {
  it.each([
    '/',
    '/login',
    '/login/',
    '/signup',
    '/signup/',
    '/shop-signup',
    '/shop-signup/',
    '/driver-signup',
    '/driver-signup/',
    '/biker-terms',
    '/biker-terms/',
    '/shop/dashboard',
    '/shop/dashboard/',
    '/biker/dashboard',
    '/biker/dashboard/',
    '/operations',
    '/operations/',
    '/operations/applications',
  ])('serves %s from the delivery API instead of the React shell', async (path) => {
    const response = await fetch(`${origins[server]}${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-served-by')).toBe('delivery-api');
    expect(await response.text()).toContain('Public delivery portal');
    expect(upstreamRequests).toContain(path);
  });

  it.each([
    '/?from=campaign',
    '/login?returnTo=%2Fbookings%3Fstatus%3DCONFIRMED',
    '/login/?returnTo=%2Fbookings',
    '/signup/?from=homepage',
    '/driver-signup/?from=homepage',
    '/shop/dashboard/?from=signup',
    '/operations/?tab=applications',
  ])('preserves the public page query for %s', async (path) => {
    const response = await fetch(`${origins[server]}${path}`);
    expect(response.status).toBe(200);
    expect(upstreamRequests).toContain(path);
  });

  it('serves the portal script from the same upstream', async () => {
    const response = await fetch(`${origins[server]}/site/app.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/javascript');
    expect(await response.text()).toContain('window.deliveryPortal');
  });

  it.each([
    '/dashboard',
    '/bookings',
    '/configuration/towns',
    '/shop/login',
    '/shop/signup',
    '/shop/example/catalogue',
    '/login-extra',
    '/signup-extra',
    '/shop/dashboard-extra',
    '/operations-extra',
  ])('keeps %s in the React dashboard', async (path) => {
    const response = await fetch(`${origins[server]}${path}`, {
      headers: { accept: 'text/html' },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<div id="root">');
    expect(response.headers.get('x-served-by')).toBeNull();
    expect(upstreamRequests).not.toContain(path);
  });

  it('preserves an upstream failure without falling through to the dashboard shell', async () => {
    const response = await fetch(`${origins[server]}/login?simulate=unavailable`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'PORTAL_UNAVAILABLE' });
  });
});
