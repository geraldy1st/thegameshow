import { defineConfig } from '@playwright/test';

// Mobile first (GS-CA19): the default viewport is 360x640, touch enabled.
export default defineConfig({
  testDir: 'e2e',
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4180/thegameshow/',
    viewport: { width: 360, height: 640 },
    hasTouch: true,
    isMobile: true,
    // Only so the test can inject axe-core; the app's own CSP is unchanged.
    bypassCSP: true,
  },
  projects: [{ name: 'chromium-mobile', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run build && npx vite preview --port 4180 --strictPort',
    url: 'http://localhost:4180/thegameshow/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
