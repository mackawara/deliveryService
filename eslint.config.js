import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      '.yarn',
      'public/mockServiceWorker.js',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Components must not call fetch directly: every delivery-service request goes through RTK Query (specification section 6).',
        },
        {
          name: 'prompt',
          message: 'Use an MUI dialog instead of browser prompt() (specification section 4.2).',
        },
        {
          name: 'confirm',
          message:
            'Use ConfirmActionDialog instead of browser confirm() (specification section 4.2).',
        },
      ],
    },
  },
  {
    // The API layer and the mock server are the only places allowed to touch fetch.
    files: ['src/api/**/*.ts', 'src/mocks/**/*.ts', 'tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}', 'src/mocks/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['*.config.{js,ts}', 'playwright.config.ts', 'vite.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
