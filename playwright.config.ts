import {defineConfig} from '@playwright/test';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  timeout: 30_000,
  expect: {timeout: 7_500},
  reporter: [['line'], ['html', {outputFolder: 'playwright-report', open: 'never'}]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100',
    launchOptions: {executablePath: chromePath},
    permissions: ['clipboard-write'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {viewport: {width: 1440, height: 1000}},
    },
    {
      name: 'mobile-chrome',
      testIgnore: /resilience\.spec\.ts/,
      use: {
        viewport: {width: 375, height: 812},
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run start -- -p 3100',
    url: 'http://127.0.0.1:3100/api/health',
    env: {OPPORTUNITY_OS_TEST_MODE: '1'},
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
