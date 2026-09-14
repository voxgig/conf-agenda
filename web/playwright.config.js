// Headless-chrome E2E for the ConfAgenda SPA. The backend web runner (which
// serves the built SPA and the /seneca gateway) is started as the test
// webServer; Playwright waits for it, then drives the SPA.
import { defineConfig, devices } from '@playwright/test'

const PORT = 50510

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  // One worker: all specs share a single backend web runner with one
  // in-memory store and the same seeded users, so they must run serially to
  // avoid cross-spec contention on shared state.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Self-contained chromium (no system chrome / no desktop): install
        // with `npx playwright install chromium` (no --with-deps).
        //
        // PLAYWRIGHT_CHROMIUM_PATH is an escape hatch for a machine whose
        // cached browser build does not match the npm package's expected
        // revision (WSL, where the download is slow enough to be worth
        // reusing). Unset everywhere else, so CI is unaffected.
        launchOptions: {
          args: ['--no-sandbox'],
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
        },
      },
    },
  ],
  webServer: {
    command: `npm run build && cd ../backend && PORT=${PORT} SENECA_REPL=false node dist/env/web/web.js`,
    url: `http://localhost:${PORT}/`,
    timeout: 60000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
