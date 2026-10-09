import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:5178",
    headless: true,
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: [{
    command: "npm run dev:demo -- --port 5178",
    url: "http://127.0.0.1:5178",
    reuseExistingServer: !process.env.CI,
  },{command:"npm run dev -- --port 5183",url:"http://127.0.0.1:5183",reuseExistingServer:!process.env.CI}],
});
