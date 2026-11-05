import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{engine,server,shared,scripts}/**/*.test.ts'],
    environment: 'node',
  },
});
