import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// React selects its production vs development build from NODE_ENV. An ambient
// NODE_ENV=production loads react-dom's production test-utils build, where
// React.act does not exist, breaking every render-based test
// (testing-library/react#1392). Pin the runner to test mode here, in the
// config process, so workers inherit it and the suite is immune to the
// caller's environment.
process.env.NODE_ENV = 'test';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          setupFiles: './src/setupTests.ts',
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
  },
});
