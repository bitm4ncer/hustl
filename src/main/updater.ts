import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { BuildVariant } from './variant'
import { updateChannel } from './variant'

const FOUR_HOURS = 4 * 60 * 60 * 1000
let timer: ReturnType<typeof setInterval> | null = null

export function setupAutoUpdater(options: {
  variant: BuildVariant
  isPackaged: boolean
  onStatus?: (status: string) => void
}): void {
  // macOS-Updates brauchen eine signierte App (Squirrel). Bis dahin manuell.
  if (!options.isPackaged || process.platform === 'darwin') return

  autoUpdater.channel = updateChannel(options.variant)
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) =>
    options.onStatus?.(`Update ${info.version} verfügbar`)
  )
  autoUpdater.on('update-not-available', () => options.onStatus?.('Aktuell'))
  autoUpdater.on('error', (error) => options.onStatus?.(`Update-Fehler: ${error.message}`))

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((error) => {
      options.onStatus?.(
        `Update-Fehler: ${error instanceof Error ? error.message : String(error)}`
      )
    })
  }

  check()
  if (timer) clearInterval(timer)
  timer = setInterval(check, FOUR_HOURS)
}

export async function checkForUpdatesNow(): Promise<void> {
  if (!app.isPackaged || process.platform === 'darwin') return
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result?.updateInfo) {
      await dialog.showMessageBox({ message: 'Keine Update-Informationen verfügbar.' })
    }
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      message: 'Update-Prüfung fehlgeschlagen',
      detail: error instanceof Error ? error.message : String(error)
    })
  }
}
