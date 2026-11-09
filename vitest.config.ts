import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    passWithNoTests: true,
    environment: 'node',
    // Don't scan git worktrees nested under the repo (e.g. .claude/worktrees/*),
    // which carry their own copies of these test files.
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/.claude/**', '**/.worktrees/**', '**/worktrees/**', '**/tests/e2e/**', '**/tests/e2e-local/**', '**/tests/e2e-electron/**']
  }
})
