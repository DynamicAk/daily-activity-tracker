import { defineConfig, devices } from '@playwright/test';
const live = process.env.TRACKER_TEST_URL;
const url = live || 'http://127.0.0.1:4220/daily-activity-tracker/';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  use: { baseURL: url, ...devices['Pixel 7'], defaultBrowserType: 'chromium' },
  webServer: live ? undefined : { command: 'npm start', url, reuseExistingServer: !process.env.CI },
  reporter: 'list'
});
