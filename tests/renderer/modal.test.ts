import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { backdropCloseAllowed } from '../../src/renderer/components/Modal'

describe('modal backdrop', () => {
  it('schliesst nur, wenn die Geste komplett auf dem backdrop lag', () => {
    expect(backdropCloseAllowed(true, true, false)).toBe(true)
    expect(backdropCloseAllowed(true, false, false)).toBe(false)
    expect(backdropCloseAllowed(false, true, false)).toBe(false)
  })

  it('schliesst nie, solange gespeichert wird', () => {
    expect(backdropCloseAllowed(true, true, true)).toBe(false)
  })

  it('kein edit-dialog schliesst mehr per nacktem backdrop-onclick', () => {
    for (const file of [
      'src/renderer/pages/Projects.tsx',
      'src/renderer/pages/Clients.tsx',
      'src/renderer/components/ConfirmDialog.tsx'
    ]) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/onClick=\{\(\) => setEditing\(null\)\}/)
      expect(source).not.toMatch(/onClick=\{busy \? undefined : onCancel\}/)
    }
  })
})
