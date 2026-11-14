import { defineConfig } from 'vite';

// base './' so the built game works from any folder or artifact URL.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
  test: { environment: 'node', include: ['tests/**/*.test.ts', 'src/**/*.test.ts'] },
} as never);
