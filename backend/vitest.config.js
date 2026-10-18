import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/preparar-entorno.js'],
    // En serie: las pruebas comparten el usuario de prueba y las bases remotas.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
