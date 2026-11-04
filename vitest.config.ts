import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{engine,server,shared}/**/*.test.ts'],
    environment: 'node',
  },
});
