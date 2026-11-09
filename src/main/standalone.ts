import { app, BrowserWindow, dialog, session, shell } from 'electron'
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildServer } from '../server'
import { electronPlatform } from '../platform/electron'
import { findFreePort } from './free-port'
import { standaloneDataDir } from './paths'

const LEGACY_DIRS = ['invoices', 'offers', 'expenses', 'statements', 'template', 'files']
const LEGACY_FILES = ['hustl.db', 'hustl.db-wal', 'hustl.db-shm']

/**
 * Bietet einmalig die Übernahme der alten lokalen Desktop-Daten an. Die Quelle
 * bleibt unverändert; kopiert wird nur, wenn der neue Datenordner noch leer ist.
 */
export async function maybeImportLegacyData(): Promise<void> {
  if (process.env.HUSTL_SKIP_LEGACY_IMPORT === '1') return

  const dataDir = standaloneDataDir(app.getPath('userData'))
  if (existsSync(join(dataDir, 'hustl.db'))) return

  const appData = app.getPath('appData')
  const legacyDir = ['hustl', 'Hustl']
    .map((name) => join(appData, name))
    .find((dir) => existsSync(join(dir, 'hustl.db')))
  if (!legacyDir) return

  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Daten übernehmen', 'Neu starten'],
    defaultId: 0,
    cancelId: 1,
    message: 'Alte lokale Hustl-Daten gefunden',
    detail:
      'Möchtest du Datenbank und Dateien aus der früheren Desktop-App übernehmen? ' +
      'Die Originale bleiben unverändert erhalten.'
  })
  if (response !== 0) return

  mkdirSync(dataDir, { recursive: true })
  for (const name of LEGACY_FILES) {
    const source = join(legacyDir, name)
    if (existsSync(source)) copyFileSync(source, join(dataDir, name))
  }
  for (const name of LEGACY_DIRS) {
    const source = join(legacyDir, name)
    if (existsSync(source)) cpSync(source, join(dataDir, name), { recursive: true })
  }
}

export async function startStandaloneServer(): Promise<{
  origin: string
  close: () => Promise<void>
}> {
  const dataDir = standaloneDataDir(app.getPath('userData'))
  mkdirSync(dataDir, { recursive: true })

  const webRoot = app.isPackaged
    ? join(process.resourcesPath, 'web')
    : join(process.cwd(), 'dist', 'web')

  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const port = await findFreePort('127.0.0.1', 3987)
    const origin = `http://127.0.0.1:${port}`
    const server = await buildServer(
      {
        dataDir,
        origin,
        rpId: 'localhost',
        port,
        secureCookies: false,
        local: true,
        trustProxy: false,
        webRoot
      },
      {
        platform: electronPlatform,
        webRoot,
        onRestart: () => {
          void server.close().finally(() => {
            app.relaunch()
            app.exit(0)
          })
        }
      }
    )
    try {
      await server.listen({ host: '127.0.0.1', port })
      return { origin, close: () => server.close() }
    } catch (error) {
      lastError = error
      await server.close().catch(() => undefined)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Kein freier Port')
}

export async function createStandaloneWindow(origin: string): Promise<BrowserWindow> {
  const expectedOrigin = new URL(origin).origin

  // Nach einem App-Update nie ein altes Service-Worker-Bundle ausliefern.
  await session.defaultSession.clearStorageData({ storages: ['serviceworkers'] })

  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png')

  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    show: false,
    icon: iconPath,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin'
      ? {}
      : { titleBarOverlay: { height: 38, color: '#00000000', symbolColor: '#888888' } }),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      plugins: true
    }
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).origin === expectedOrigin) return { action: 'allow' }
    } catch {
      // Kein gültiges URL-Objekt: unten als extern behandeln.
    }
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, target) => {
    let sameOrigin = false
    try {
      sameOrigin = new URL(target).origin === expectedOrigin
    } catch {
      sameOrigin = false
    }
    if (sameOrigin) return
    event.preventDefault()
    if (target.startsWith('http://') || target.startsWith('https://')) void shell.openExternal(target)
  })

  await win.loadURL(origin)
  return win
}
