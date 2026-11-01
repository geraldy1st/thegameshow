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
  projects: [
    { name: 'chromium-mobile', use: { browserName: 'chromium' } },
    // GS-V5-13 / GS-V5-14: the lot 2 suite and the lot 3 suite also run on WebKit.
    // isMobile is a Chromium-only option, so WebKit keeps the same viewport and touch only.
    { name: 'webkit-mobile', use: { browserName: 'webkit', isMobile: false } },
    // GS-V5-17 T17-5 and GS-V5-11: lot 3 journeys and axe at 390x844.
    {
      name: 'chromium-390',
      testMatch: /lot3\.spec\.ts/,
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 4180 --strictPort',
      url: 'http://localhost:4180/thegameshow/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    // Lot 4 (QA §2.4): the harness build (never deployed) for the tests that need __TGS_TEST__.
    {
      command:
        'npx vite build --mode test-harness --outDir dist-test && npx vite preview --outDir dist-test --port 4181 --strictPort',
      url: 'http://localhost:4181/thegameshow/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
