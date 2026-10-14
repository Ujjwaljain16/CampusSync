import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'threads',
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '.next/**', 'out/**'],
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      // Thresholds are intentionally NOT enforced yet; this only reports.
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        '.next/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        '**/__tests__',
      ],
    },
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      '@': r('./src'),
      '@/components': r('./src/components'),
      '@/lib': r('./src/lib'),
      '@/types': r('./src/types'),
      '@/contexts': r('./src/contexts'),
      '@/hooks': r('./src/hooks'),
      '@tests': r('./tests'),
    },
  },
});
