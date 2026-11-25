import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 20000,
    environmentMatchGlobs: [
      ['tests/unit/**/*.test.tsx', 'jsdom'],
      ['tests/unit/**/*.test.ts', 'node'],
      ['tests/db/**/*.test.ts', 'node'],
    ],
  },
});
