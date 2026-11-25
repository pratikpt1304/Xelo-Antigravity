import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'public/vendor/**',
      'public/models/**',
      'node_modules/**',
      'supabase/functions/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'tests/e2e/server.mjs', 'tests/db/harness.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
    },
  },
);
