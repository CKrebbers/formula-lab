// Browser test suite (ADR 001 phase 2): GLSL↔reference parity on real GPU
// renders, OfflineAudioContext safety through the real worklet, and e2e.
// Run: npm run test:browser

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    headless: true,
    launchOptions: {
      args: [
        // software WebGL2 must work on CI runners without a GPU
        '--enable-unsafe-swiftshader',
        // the dropout spec starts an AudioContext without a click
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
  },
});
