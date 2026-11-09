import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e-electron',
  timeout: 180_000,
  fullyParallel: false,
  reporter: [['list']]
})
