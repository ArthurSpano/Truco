import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{engine,server,shared,scripts,client}/**/*.test.ts'],
    environment: 'node',
  },
});
