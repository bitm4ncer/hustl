import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

describe('core ist electron-frei', () => {
  it('importiert nirgends electron', () => {
    const hits = walk('src/core')
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => /from ['"]electron['"]/.test(readFileSync(file, 'utf8')))
    expect(hits).toEqual([])
  })
})
