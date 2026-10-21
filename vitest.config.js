import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
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
        }
      }
    }
  }
});
