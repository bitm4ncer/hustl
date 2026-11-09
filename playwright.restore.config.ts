import { defineConfig, devices } from '@playwright/test'

const PORT = 3412
const BASE = 'http://localhost:' + PORT

export default defineConfig({
  testDir: 'tests/e2e-local',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    ...devices['Desktop Chrome']
  },
  webServer: {
    command:
      "node -e \"require('fs').rmSync('.e2e-restore-data',{recursive:true,force:true})\" && node dist/server/index.mjs > .e2e-restore.log 2>&1",
    url: BASE + '/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      HUSTL_DATA_DIR: '.e2e-restore-data',
      HUSTL_ORIGIN: BASE,
      HUSTL_RP_ID: 'localhost',
      HUSTL_LOCAL: '1',
      PORT: String(PORT)
    }
  }
})
