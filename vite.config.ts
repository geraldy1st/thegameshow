/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Hosting is fixed to https://geraldy1st.github.io/thegameshow/ (SPEC-ADDENDUM RES-9).
export default defineConfig({
  base: '/thegameshow/',
  plugins: [react()],
  // Keep fonts as same-origin files (CSP font-src 'self', GS-CA18).
  build: { assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined) },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.ts'],
  },
});
