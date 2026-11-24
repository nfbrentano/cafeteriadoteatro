import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Em checkouts limpos (ex.: CI), testes pos-build (CAF-000118/121/122) esperam dist/ gerado.
const distVersionPath = resolve(import.meta.dirname, 'dist/version.json');
if (!process.env.VITEST_WORKER_ID && !existsSync(distVersionPath)) {
  execFileSync(
    process.execPath,
    [resolve(import.meta.dirname, 'node_modules/vite/bin/vite.js'), 'build'],
    { cwd: import.meta.dirname, stdio: 'ignore' }
  );
}

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    hookTimeout: 30000,
    testTimeout: 30000,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'json-summary'],
      include: ['js/**/*.js'],
      exclude: [
        'js/libs/**',
        'js/vendor/**',
        'js/curtain.js',
        'js/pix-brcode.js'
      ],
      thresholds: {
        'js/utils/**': {
          lines: 85,
          branches: 65,
          functions: 85,
          statements: 85
        },
        'js/pdv/**': {
          lines: 58,
          branches: 42,
          functions: 54,
          statements: 56
        },
        'js/admin/**': {
          lines: 35,
          branches: 18,
          functions: 29,
          statements: 33
        },
        'js/*.js': {
          lines: 35,
          branches: 20,
          functions: 30,
          statements: 33
        }
      }
    }
  }
});
