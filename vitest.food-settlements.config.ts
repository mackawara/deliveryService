import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import dashboardConfig from './vite.config.ts';

/** Opt-in paired contract checks. The API checkout must match the deployed contract. */
export default defineConfig(async (env) => {
  const apiRepository = process.env.ORDER_FOOD_API_REPO ?? '../deliveryBooking-settlements';
  const config = mergeConfig(await dashboardConfig(env), {
    resolve: {
      alias: {
        '@api-src': resolve(apiRepository, 'src'),
        '@api-test': resolve(apiRepository, 'tests/helpers'),
        vitest: fileURLToPath(new URL('./node_modules/vitest/dist/index.js', import.meta.url)),
      },
    },
  });
  config.test = {
    ...config.test,
    include: ['cross-repo/foodSettlementsJourney.test.ts'],
    pool: 'forks',
    maxWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 30_000,
  };
  return config;
});
