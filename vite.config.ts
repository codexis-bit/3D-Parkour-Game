import { defineConfig } from 'vitest/config';

// Relative Basis, damit der Build sowohl lokal als auch unter
// https://<user>.github.io/<repo>/ (GitHub Pages) funktioniert.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // Rapier bringt sein WASM als Base64 im JS mit – das Bundle ist dadurch bewusst groß.
    chunkSizeWarningLimit: 6000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
