import { describe, expect, it } from 'vitest'
import { updateChannel } from '../../src/main/variant'

describe('updateChannel', () => {
  it('separates standalone and client metadata', () => {
    expect(updateChannel('standalone')).toBe('standalone')
    expect(updateChannel('client')).toBe('latest')
  })
})
