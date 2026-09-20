import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';

import { createAppRouter } from '@/app/router';
import { createAppStore } from '@/app/store';
import { appConfig } from '@/config';
import { ThemeController } from '@/theme/ThemeController';

async function bootstrap(): Promise<void> {
  // `import.meta.env.DEV` is replaced with `false` in a production build, so the mock
  // API and its dependency are dropped from the bundle entirely rather than merely
  // being unreachable at runtime.
  if (import.meta.env.DEV && appConfig.enableMockApi) {
    const { startMockWorker } = await import('@/mocks/browser');
    await startMockWorker();
  }

  const container = document.getElementById('root');
  if (!container) throw new Error('Root container is missing from index.html');

  const store = createAppStore();
  const router = createAppRouter();

  document.title = appConfig.appLabel;

  createRoot(container).render(
    <StrictMode>
      <Provider store={store}>
        <ThemeController>
          <RouterProvider router={router} />
        </ThemeController>
      </Provider>
    </StrictMode>,
  );
}

void bootstrap();
