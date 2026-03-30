import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['backend/**/*.test.js', 'backend/**/*.spec.js'],
    exclude: ['node_modules', 'backend/coverage', 'backend/agents/core/__tests__/**'],
    timeout: 30000,
    setupFiles: ['./backend/__tests__/setup.js']
  }
});
