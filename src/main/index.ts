import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { initDatabase } from '../core/db/connection'
import { registerIpcHandlers } from './ipc/handlers'
import {
  normalizeServerUrl,
  readServerConfig,
  resolveStartupTarget,
  writeServerConfig
} from './startup'
import type { StartupTarget } from './startup'

// Linux/Wayland (e.g. niri): let Electron pick the Wayland backend when the
// session is Wayland and fall back to X11 otherwise, so we get native scaling
// and crisp rendering instead of blurry XWayland. Harmless on X11 sessions.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
}

// App icon for the window + taskbar. In dev it lives in the project's
// resources/; in the packaged app it is copied next to the app via
// electron-builder `extraResources` (→ process.resourcesPath).
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(app.getAppPath(), 'resources', 'icon.png')

const windowChrome =
  process.platform !== 'darwin'
    ? {
        titleBarStyle: 'hidden' as const,
        titleBarOverlay: { height: 38, color: '#00000000', symbolColor: '#888888' },
        autoHideMenuBar: true,
      }
    : { titleBarStyle: 'hiddenInset' as const }

let setupWindow: BrowserWindow | null = null
let shellWindow: BrowserWindow | null = null
let currentTarget: StartupTarget = { mode: 'local' }

/** Lokaler Dev-Betrieb: eigener DB-Pfad, IPC und gebündeltes UI. */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    show: false,
    icon: iconPath,
    ...windowChrome,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function offlinePage(url: string): string {
  const host = escapeHtml(new URL(url).host)
  const target = JSON.stringify(url)
  const shortcut = process.platform === 'darwin' ? '⌘⇧S' : 'Strg+Shift+S'

  return `<!doctype html><meta charset="utf-8">
<title>Hustl nicht erreichbar</title>
<style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
       font:15px/1.5 'Segoe UI',system-ui,sans-serif;background:#141416;color:#eee}
  .box{max-width:460px;text-align:center;padding:24px}
  h1{font-size:18px;font-weight:600;margin:0 0 8px}
  p{color:#9a9a9d;margin:0 0 18px}
  button{background:#ff8c66;color:#141416;border:0;border-radius:10px;padding:10px 16px;
         font-weight:600;cursor:pointer}
  small{display:block;margin-top:18px;color:#6f6f73}
</style>
<div class="box">
  <h1>Hustl ist gerade nicht erreichbar</h1>
  <p>Die App braucht eine Verbindung zu ${host}. Prüfe dein Netz und versuche es erneut.</p>
  <button id="retry">Erneut versuchen</button>
  <small>Anderer Server? ${shortcut} oder Menü „Hustl → Server-URL ändern…“</small>
</div>
<script>document.getElementById('retry').onclick = function () { location.href = ${target} }</script>`
}

/** Verpackt: eine schlanke Shell auf die gehostete Web-App. */
function createShellWindow(url: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    show: false,
    icon: iconPath,
    ...windowChrome,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Chromium rendert PDFs nur, wenn Plugins erlaubt sind. Ohne das würde
      // ein Klick auf "PDF öffnen" die Datei nur herunterladen.
      plugins: true
      // Kein Preload: die Shell hat keinen Zugriff auf den Rechner.
    }
  })

  shellWindow = win
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (shellWindow === win) shellWindow = null
  })

  const origin = new URL(url).origin

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    // Eigenes Origin im Shell-Fenster halten: die Session-Cookie lebt hier,
    // nicht im Systembrowser — dort wäre ein PDF-Link sofort 401.
    try {
      if (new URL(target).origin === origin) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, plugins: true }
          }
        }
      }
    } catch {
      // Kein gültiges URL-Objekt: unten als extern behandeln.
    }
    if (target.startsWith('http://') || target.startsWith('https://')) void shell.openExternal(target)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, target) => {
    let sameOrigin = false
    try {
      sameOrigin = new URL(target).origin === origin
    } catch {
      sameOrigin = false
    }
    if (!sameOrigin) {
      event.preventDefault()
      void shell.openExternal(target)
    }
  })

  win.webContents.on('did-fail-load', (_event, code, _description, validatedUrl) => {
    // Sub-Ressourcen-Fehler ignorieren; nur die Hauptseite ersetzt die Ansicht.
    let sameOrigin = false
    try {
      sameOrigin = new URL(validatedUrl).origin === origin
    } catch {
      sameOrigin = false
    }
    if (!sameOrigin) return
    if (code === -3) return // aborted, usually a redirect
    void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(offlinePage(url)))
  })

  void win.loadURL(url)
  return win
}

function setupPage(initialUrl: string): string {
  return `<!doctype html><meta charset="utf-8">
<title>Hustl verbinden</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       font:15px/1.5 'Segoe UI',system-ui,sans-serif;background:#141416;color:#eee;padding:28px}
  main{width:100%;max-width:440px}
  .mark{width:44px;height:44px;border-radius:12px;background:#ff8c66;color:#141416;
        display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;
        margin-bottom:20px}
  h1{font-size:22px;font-weight:650;margin:0 0 8px}
  p{color:#9a9a9d;margin:0 0 20px}
  label{display:block;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;
        color:#8a8a8e;margin-bottom:8px}
  input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #333338;
        background:#1c1c1f;color:#eee;font:inherit;outline:none}
  input:focus{border-color:#ff8c66;box-shadow:0 0 0 3px rgba(255,140,102,.15)}
  .actions{display:flex;gap:10px;align-items:center;margin-top:18px}
  button{border:0;border-radius:10px;padding:11px 18px;font:inherit;font-weight:650;cursor:pointer}
  #save{background:#ff8c66;color:#141416}
  #save:disabled{opacity:.55;cursor:default}
  #force{background:none;color:#9a9a9d;padding:11px 4px;font-weight:500}
  #force:hover{color:#eee}
  #error{min-height:22px;margin:14px 0 0;color:#ff7b72;font-size:13px}
  #hint{margin:10px 0 0;font-size:12px;color:#6f6f73}
</style>
<main>
  <div class="mark">H</div>
  <h1>Hustl verbinden</h1>
  <p>Gib die Adresse deiner Hustl-Instanz ein. Nach der Installation auf dem VPS steht sie im Terminal.</p>
  <label for="url">Server-URL</label>
  <input id="url" type="url" inputmode="url" autocomplete="url" spellcheck="false"
         placeholder="https://hustl.example.com" value="${escapeHtml(initialUrl)}" autofocus>
  <p id="hint">HTTPS ist Pflicht für Passkeys – Ausnahme: localhost beim Testen.</p>
  <div class="actions">
    <button id="save">Verbinden</button>
    <button id="force" type="button">Ohne Prüfung speichern</button>
  </div>
  <p id="error" role="alert"></p>
</main>
<script>
  const input = document.getElementById('url')
  const save = document.getElementById('save')
  const force = document.getElementById('force')
  const error = document.getElementById('error')

  async function submit(skipCheck) {
    error.textContent = ''
    save.disabled = true
    force.disabled = true
    let result
    try {
      result = await window.hustlSetup.save(input.value, { force: skipCheck })
    } catch {
      result = { ok: false, error: 'Der Einrichtungsdialog ist nicht erreichbar.' }
    }
    if (result.ok) return
    error.textContent = result.error || 'Verbindung fehlgeschlagen.'
    save.disabled = false
    force.disabled = false
    input.focus()
  }

  save.addEventListener('click', () => submit(false))
  force.addEventListener('click', () => submit(true))
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit(false)
  })
</script>`
}

async function healthError(url: string): Promise<string | null> {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return `Der Server antwortet mit HTTP ${response.status}.`
    const body = (await response.json()) as { ok?: boolean }
    return body.ok ? null : 'Der Server meldet einen Fehler.'
  } catch {
    return 'Der Server ist nicht erreichbar. Prüfe URL, DNS und HTTPS.'
  }
}

function openSetupWindow(): void {
  if (setupWindow) {
    setupWindow.focus()
    return
  }

  const stored = readServerConfig(app.getPath('userData')) ?? ''

  const win = new BrowserWindow({
    width: 540,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    title: 'Hustl verbinden',
    icon: iconPath,
    ...windowChrome,
    webPreferences: {
      preload: join(__dirname, '../preload/setup.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  setupWindow = win
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (setupWindow === win) setupWindow = null
    if (currentTarget.mode === 'setup' && !shellWindow && process.platform !== 'darwin') {
      app.quit()
    }
  })

  void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(setupPage(stored)))
}

function buildMenu(): void {
  const changeServer: MenuItemConstructorOptions = {
    label: 'Server-URL ändern…',
    accelerator: 'CmdOrCtrl+Shift+S',
    click: () => openSetupWindow()
  }

  const template: MenuItemConstructorOptions[] = []

  if (process.platform === 'darwin') {
    template.push({ role: 'appMenu' }, { label: 'Server', submenu: [changeServer] })
  } else {
    template.push({
      label: 'Hustl',
      submenu: [changeServer, { type: 'separator' }, { role: 'quit', label: 'Beenden' }]
    })
  }

  template.push({ role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerSetupIpc(): void {
  ipcMain.handle(
    'hustl:setup:save',
    async (_event, value: unknown, options?: { force?: boolean }) => {
      if (typeof value !== 'string') return { ok: false, error: 'Bitte eine URL eingeben.' }

      const url = normalizeServerUrl(value)
      if (!url) {
        return {
          ok: false,
          error: 'Das ist keine gültige URL. Beispiel: https://hustl.example.com'
        }
      }

      if (!options?.force) {
        const error = await healthError(url)
        if (error) return { ok: false, error }
      }

      try {
        writeServerConfig(app.getPath('userData'), url)
      } catch {
        return { ok: false, error: 'Die Server-URL konnte nicht gespeichert werden.' }
      }

      currentTarget = { mode: 'remote', url }
      // Erst das neue Fenster öffnen, dann das alte schließen: sonst kann
      // `window-all-closed` die App beenden, bevor die neue Shell da ist.
      const previous = shellWindow
      createShellWindow(url)
      previous?.close()
      setupWindow?.close()
      return { ok: true }
    }
  )

  ipcMain.on('hustl:setup:close', () => setupWindow?.close())
}

app.whenReady().then(() => {
  const storedUrl = readServerConfig(app.getPath('userData'))
  currentTarget = resolveStartupTarget({
    isPackaged: app.isPackaged,
    env: process.env,
    storedUrl
  })

  registerSetupIpc()
  buildMenu()

  if (currentTarget.mode === 'remote') {
    createShellWindow(currentTarget.url)
  } else if (currentTarget.mode === 'setup') {
    openSetupWindow()
  } else {
    initDatabase(app.getPath('userData'))
    registerIpcHandlers()
    createWindow()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return

    if (currentTarget.mode === 'remote') createShellWindow(currentTarget.url)
    else if (currentTarget.mode === 'setup') openSetupWindow()
    else createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
