import { defineConfig, devices } from '@playwright/test';

const port = 19006;
const baseURL = `http://127.0.0.1:${port}`;
const appApiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:65535';

export default defineConfig({
  testDir: './e2e-web',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['dot'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm exec expo start --web --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      BROWSER: 'none',
      EAS_BUILD: 'false',
      EXPO_PUBLIC_APP_ENV: 'development',
      EXPO_PUBLIC_APP_DISPLAY_NAME: 'Happickle',
      EXPO_PUBLIC_APP_SLUG: 'happickle-mobile',
      EXPO_PUBLIC_APP_SCHEME: 'happickle',
      EXPO_PUBLIC_API_URL: appApiUrl,
      EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER: 'com.template.mobile',
      EXPO_PUBLIC_ANDROID_PACKAGE: 'com.template.mobile',
    },
  },
});
