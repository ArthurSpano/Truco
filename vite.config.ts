import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The dev server runs inside Express (see server/index.ts), so only
// root/build settings live here.
export default defineConfig({
  root: fileURLToPath(new URL('./client', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
    emptyOutDir: true,
  },
});
