import { describe, it, expect } from 'vitest'
import { de, en, setActiveLanguage, t } from '../../src/renderer/i18n'
import { translateBackendMessage } from '../../src/renderer/i18n/backend'
import { todoCategoryName } from '../../src/renderer/i18n/format'
import type { Dictionary } from '../../src/renderer/i18n'

/** All leaf paths of a dictionary, so a missing translation fails loudly. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('de dictionary', () => {
  it('exposes the core navigation and action labels', () => {
    expect(de.nav.invoices).toBe('Rechnungen')
    expect(de.nav.clients).toBe('Kunden')
    expect(de.nav.settings).toBe('Einstellungen')
    expect(de.actions.newInvoice).toBe('Neue Rechnung')
    expect(de.actions.finalize).toBe('Finalisieren & E-Rechnung')
    expect(de.invoice.status.draft).toBe('Entwurf')
  })

  it('keeps anglicisms out of the visible German navigation', () => {
    expect(de.nav.todos).toBe('Planer')
    expect(de.nav.timeline).toBe('Zeitstrahl')
    expect(de.finance.tabs.dashboard).toBe('Übersicht')
    expect(de.finance.basis.cash).toBe('Zahlungen')
    expect(de.template.tab).toBe('Vorlage')
    expect(de.settings.tabs.theme).toBe('Erscheinungsbild')
    expect(de.settings.tabs.mail).toBe('E-Mail')
    expect(de.finance.bank.statementUpload).toBe('Kontoauszug hochladen')
  })
})

describe('en dictionary', () => {
  it('exposes the same structure as German', () => {
    expect(leafPaths(en).sort()).toEqual(leafPaths(de).sort())
  })

  it('translates the core navigation and action labels', () => {
    expect(en.nav.invoices).toBe('Invoices')
    expect(en.nav.todos).toBe('Planner')
    expect(en.nav.clients).toBe('Clients')
    expect(en.nav.settings).toBe('Settings')
    expect(en.actions.newInvoice).toBe('New invoice')
    expect(en.actions.finalize).toBe('Finalize & e-invoice')
    expect(en.invoice.status.draft).toBe('Draft')
  })
})

describe('language switching', () => {
  it('switches the live dictionary and backend messages', () => {
    setActiveLanguage('en')
    expect(t.nav.invoices).toBe('Invoices')
    expect(todoCategoryName('Weeklys')).toBe('Weekly')
    expect(translateBackendMessage('Bitte zuerst einen Kunden wählen.')).toBe(
      'Please select a client first.',
    )
    setActiveLanguage('de')
    expect(t.nav.invoices).toBe('Rechnungen')
    expect(todoCategoryName('Weeklys')).toBe('Wöchentlich')
    expect(translateBackendMessage('Bitte zuerst einen Kunden wählen.')).toBe(
      'Bitte zuerst einen Kunden wählen.',
    )
  })
})

// Guard against an accidental cast that drops keys at runtime.
const _typecheck: Dictionary = en
void _typecheck
