import { describe, expect, it } from 'vitest'
import { resolveBuildVariant } from '../../src/main/variant'

describe('resolveBuildVariant', () => {
  it('prefers the environment', () => {
    expect(resolveBuildVariant({ envVariant: 'standalone', isPackaged: false })).toBe('standalone')
    expect(resolveBuildVariant({ envVariant: 'client', isPackaged: false })).toBe('client')
  })

  it('uses packaged metadata', () => {
    expect(resolveBuildVariant({ pkgVariant: 'standalone', isPackaged: true })).toBe('standalone')
  })

  it('ignores the env override in packaged builds', () => {
    expect(
      resolveBuildVariant({ envVariant: 'standalone', isPackaged: true, pkgVariant: 'client' })
    ).toBe('client')
  })

  it('defaults to client', () => {
    expect(resolveBuildVariant({ isPackaged: true })).toBe('client')
    expect(resolveBuildVariant({ isPackaged: false })).toBe('client')
  })
})
