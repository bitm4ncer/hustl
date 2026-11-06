import { defineConfig, devices } from '@playwright/test'

const PORT = 3411
const BASE = 'http://localhost:' + PORT

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    ...devices['iPhone 13'],
    // WebAuthn-Virtual-Authenticator gibt es nur über CDP in Chromium.
    browserName: 'chromium',
  },
  webServer: {
    command:
      'node -e "require(\'fs\').rmSync(\'.e2e-data\',{recursive:true,force:true})" && node dist/server/index.mjs > .e2e-server.log 2>&1',
    url: BASE + '/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      HUSTL_DATA_DIR: '.e2e-data',
      HUSTL_ORIGIN: BASE,
      HUSTL_RP_ID: 'localhost',
      PORT: String(PORT),
    },
  },
})
