import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const port = new URL(baseURL).port || "3100";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "pnpm start:production",
    url: `${baseURL}/health`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      // Browser tests use HTTP locally; public production still forces Secure cookies.
      NODE_ENV: process.env.PLAYWRIGHT_NODE_ENV ?? "development",
      PORT: port,
      PUBLIC_BASE_URL: baseURL,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://test:test@127.0.0.1:5432/mini_ecommerce_test",
      DIRECT_URL:
        process.env.DIRECT_URL ??
        "postgresql://test:test@127.0.0.1:5432/mini_ecommerce_test",
      COOKIE_SECRET: process.env.COOKIE_SECRET ?? "playwright-cookie-secret",
      FAKE_PAYMENT_WEBHOOK_SECRET:
        process.env.FAKE_PAYMENT_WEBHOOK_SECRET ?? "playwright-webhook-secret",
    },
  },
});
