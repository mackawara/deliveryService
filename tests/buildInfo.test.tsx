import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { routes } from '@/app/router';
import { buildInfo } from '@/config';
import { resetMockState } from '@/mocks/handlers';
import { renderRoutes } from './testUtils';

import { readBuildInfo } from '../vite.config';

describe('build identity', () => {
  it('shows the running version and revision in the navigation', async () => {
    resetMockState({ authenticated: true });
    renderRoutes({ routes, initialEntries: ['/'] });

    const info = await screen.findByTestId('build-info');
    expect(info).toHaveTextContent(`Version ${buildInfo.version}`);
    expect(info).toHaveTextContent(buildInfo.revision.slice(0, 7));
  });

  it('reads the stamped values and falls back to an obvious development identity', () => {
    expect(
      readBuildInfo({ APP_VERSION: '1.4.0', APP_REVISION: 'abc1234', APP_BUILD_TIME: 'now' }),
    ).toEqual({ version: '1.4.0', revision: 'abc1234', buildTime: 'now' });
    expect(readBuildInfo({})).toEqual({
      version: '0.0.0-dev',
      revision: 'unknown',
      buildTime: 'unknown',
    });
  });
});
