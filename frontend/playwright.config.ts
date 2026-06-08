import { defineConfig, devices } from "@playwright/test";

// E2E гоняются против ПОДНЯТОГО стека (docker compose up) через nginx.
// База берётся из E2E_BASE_URL, по умолчанию — локальный nginx на 80 порту.
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost";

export default defineConfig({
  testDir: "./e2e",
  // Тесты делят один стек и одну БД — гоняем последовательно, без параллелизма.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  // Сид/очистка тестового товара (см. e2e/global-*.ts).
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
