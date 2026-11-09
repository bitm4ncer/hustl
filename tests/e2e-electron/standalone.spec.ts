import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function rpc(page: any, method: string, args: unknown[]): Promise<any> {
  return page.evaluate(
    async ({ method, args }) => {
      const response = await fetch(`/api/rpc/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hustl-client': 'web' },
        body: JSON.stringify({ args })
      })
      return response.json()
    },
    { method, args }
  )
}

const client = {
  notionId: null,
  name: 'E2E-Kunde',
  contactPerson: '',
  addressExtra: '',
  address: '',
  street: '',
  zip: '',
  city: '',
  country: '',
  countryCode: 'DE',
  currency: 'EUR',
  language: 'de',
  taxMode: 'standard',
  email: '',
  hourlyRate: 0,
  noTax: false,
  vatId: '',
  notes: ''
}

test('keeps data after a restart', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'hustl-e2e-'))

  const launch = () =>
    electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        HUSTL_VARIANT: 'standalone',
        HUSTL_USER_DATA_DIR: userData,
        HUSTL_SKIP_LEGACY_IMPORT: '1'
      }
    })

  const first = await launch()
  const page = await first.firstWindow()
  await expect(page.locator('body')).toBeVisible()
  const saved = await rpc(page, 'saveClient', [client])
  expect(saved.ok, JSON.stringify(saved)).toBe(true)
  await first.close()

  const second = await launch()
  const secondPage = await second.firstWindow()
  const list = await rpc(secondPage, 'listClients', [])
  expect(JSON.stringify(list.data)).toContain('E2E-Kunde')
  await second.close()
})
