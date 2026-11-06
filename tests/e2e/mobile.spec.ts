import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('erste einrichtung per passkey, mobile navigation und session-reload', async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })

  const token = readFileSync('.e2e-data/bootstrap-token.txt', 'utf8').trim()

  await page.goto(`/setup?token=${encodeURIComponent(token)}`)
  await expect(page.getByRole('button', { name: 'Passkey anlegen' })).toBeVisible()
  await page.getByRole('button', { name: 'Passkey anlegen' }).click()

  await expect(page.getByRole('button', { name: 'Ich habe sie gesichert' })).toBeVisible({
    timeout: 30_000,
  })
  await page.getByRole('button', { name: 'Ich habe sie gesichert' }).click()

  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Projekte' })).toBeVisible()

  await page.getByRole('button', { name: 'Mehr' }).click()
  await expect(page.getByRole('dialog', { name: 'Mehr' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kunden' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Session-Cookie überlebt einen Reload (PWA-Neustart).
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible()
})
