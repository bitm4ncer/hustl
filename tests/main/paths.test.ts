import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { standaloneDataDir } from '../../src/main/paths'

describe('standaloneDataDir', () => {
  it('separates app data from the Chromium profile', () => {
    expect(standaloneDataDir('C:\\Users\\me\\AppData\\Roaming\\Hustl Standalone')).toBe(
      join('C:\\Users\\me\\AppData\\Roaming\\Hustl Standalone', 'data')
    )
  })
})
