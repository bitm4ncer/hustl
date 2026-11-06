import { describe, it, expect } from 'vitest'
import { DEFAULT_TEMPLATE } from '../../src/shared/template-defaults'

describe('DEFAULT_TEMPLATE', () => {
  it('is maximally neutral', () => {
    expect(DEFAULT_TEMPLATE.logoPath).toBeNull()
    expect(DEFAULT_TEMPLATE.accentColor).toBe('#666666')
    expect(DEFAULT_TEMPLATE.fontFamily).toBe('Inter')
    expect(DEFAULT_TEMPLATE.fontSource).toBe('local')
    expect(DEFAULT_TEMPLATE.fontFiles).toEqual([])
    expect(DEFAULT_TEMPLATE.metaRows).toEqual([])
    expect(DEFAULT_TEMPLATE.showBankDetails).toBe(true)
  })
})
