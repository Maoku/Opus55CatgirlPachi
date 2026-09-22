import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // Rapier の WASM を base64 で内包しているため、チャンクが大きくなる
    chunkSizeWarningLimit: 4096,
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/physics/**/*.test.ts'],
    environment: 'node',
  },
});
