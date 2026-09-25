/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Prints where `/api/v1` is forwarded under the dev server's own URLs, and names that
 * target when a forwarded request fails, so a port mismatch with the backend is visible
 * without reading this file.
 */
function announceApiProxy(target: string, source: string): Plugin {
  return {
    name: 'announce-api-proxy',
    apply: 'serve',
    configureServer(server) {
      const printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        printUrls();
        server.config.logger.info(`  ➜  API:     /api/v1 → ${target} (${source})`);
      };
    },
  };
}

/**
 * The deployment baseline is the frontend origin with a reverse-proxied `/api/v1`
 * (specification section 10), so the dev server proxies the same path to a local
 * backend instead of relying on cross-site cookies.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const proxyTarget = env.VITE_DEV_API_PROXY_TARGET ?? 'http://localhost:4400';
  const proxySource = env.VITE_DEV_API_PROXY_TARGET
    ? 'VITE_DEV_API_PROXY_TARGET'
    : 'default; set VITE_DEV_API_PROXY_TARGET to change it';
  let lastProxyHint = 0;

  return {
    plugins: [react(), announceApiProxy(proxyTarget, proxySource)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api/v1': {
          target: proxyTarget,
          changeOrigin: false,
          secure: false,
          configure: (proxy) => {
            // Vite logs each failure itself; this adds where it was going, at most every
            // few seconds so a burst of failed requests prints one hint.
            proxy.on('error', () => {
              if (Date.now() - lastProxyHint < 5000) return;
              lastProxyHint = Date.now();
              console.warn(
                `[api proxy] Could not reach ${proxyTarget} (${proxySource}). Is the backend running on that port?`,
              );
            });
          },
        },
      },
    },
    preview: {
      port: 4173,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          // Keep the vendor libraries in stable chunks so a feature change does not
          // invalidate the whole bundle for returning staff.
          manualChunks: (id: string) => {
            if (!id.includes('node_modules')) return undefined;
            if (
              /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id)
            )
              return 'react';
            if (/[\\/]node_modules[\\/]@mui[\\/]/.test(id)) return 'mui';
            if (/[\\/]node_modules[\\/](@reduxjs|react-redux|redux)[\\/]/.test(id)) return 'redux';
            return undefined;
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: false,
      // Node's fetch has no document base, so tests address the mock API absolutely at
      // the jsdom origin. MSW matches the same path patterns either way.
      env: { VITE_API_BASE_URL: 'http://localhost:3000/api/v1' },
      setupFiles: ['./tests/setup.ts'],
      // Integration tests mount the whole application; the default five seconds is tight
      // when several jsdom environments run in parallel on a loaded CI machine.
      testTimeout: 20_000,
      // Several of these suites mount the whole application; capping the worker count
      // keeps them off each other's CPU and makes timings predictable.
      maxWorkers: 4,
      include: ['tests/**/*.test.{ts,tsx}'],
      css: false,
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        reportsDirectory: 'coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.d.ts', 'src/mocks/**'],
      },
    },
  };
});
