import { describe, it, expect } from 'vitest'
import { getTabs, getOverflow, isOverflowView } from '../../src/renderer/navigation'

describe('navigation', () => {
  it('zeigt fuenf tabs mit daily und ohne kunden', () => {
    const tabs = getTabs()
    expect(tabs).toHaveLength(5)
    expect(tabs.map((tab) => tab.view)).toEqual([
      'todos',
      'projects',
      'invoices',
      'finance',
      'more',
    ])
  })

  it('legt kunden, angebote, timeline und settings in den overflow', () => {
    expect(getOverflow().map((i) => i.view)).toEqual(['clients', 'offers', 'timeline', 'settings'])
    expect(isOverflowView('offers')).toBe(true)
    expect(isOverflowView('clients')).toBe(true)
  })

  it('nutzt fuer mehr die drei punkte statt eines zahnrads', () => {
    expect(getTabs().find((tab) => tab.view === 'more')?.icon).toBe('dots')
  })
})
