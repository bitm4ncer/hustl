import { test, expect } from '@playwright/test'

test('offers archive restore in the data tab', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Einstellungen' })).toBeVisible()

  await page.getByRole('button', { name: 'Einstellungen' }).click()
  await page.getByText('Daten', { exact: true }).first().click()

  await expect(page.getByText('Archiv wiederherstellen')).toBeVisible()
  await expect(page.getByText('Archiv prüfen und wiederherstellen')).toBeVisible()
})
