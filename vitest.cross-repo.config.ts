import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import dashboardConfig from './vite.config.ts';

export default defineConfig(async (env) => {
  const config = mergeConfig(await dashboardConfig(env), {
    resolve: {
      alias: {
        '@api-src': resolve(process.env.ORDER_FOOD_API_REPO ?? '../deliveryBooking-1', 'src'),
        '@api-test': resolve(
          process.env.ORDER_FOOD_API_REPO ?? '../deliveryBooking-1',
          'tests/helpers',
        ),
        vitest: fileURLToPath(new URL('./node_modules/vitest/dist/index.js', import.meta.url)),
      },
    },
  });
  config.test = {
    ...config.test,
    include: ['cross-repo/**/*.test.tsx'],
    pool: 'forks',
    maxWorkers: 1,
    testTimeout: 60000,
    hookTimeout: 30000,
  };
  return config;
});
