import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1280, height: 900 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173",
    port: 4173,
    env: {
      VITE_FIREBASE_CONFIG: JSON.stringify({
        projectId: "demo-multisport420",
        databaseURL: "https://demo-multisport420-default-rtdb.firebaseio.com",
        apiKey: "demo-key", appId: "demo-app",
      }),
      VITE_FIREBASE_DATABASE_EMULATOR: "127.0.0.1:9000",
    },
  },
});
