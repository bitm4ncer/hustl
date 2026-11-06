import { app, BrowserWindow } from 'electron'
import type { Platform } from './types'

/**
 * Electron-Implementierung der Plattform. Sie lebt außerhalb von `src/core`,
 * weil dort kein electron-Import erlaubt ist.
 */
export const electronPlatform: Platform = {
  kind: 'electron',
  get dataDir(): string {
    return app.getPath('userData')
  },
  renderPdf: async (html, options) => {
    const win = new BrowserWindow({ show: false })
    try {
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      return await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: {
          marginType: 'custom',
          top: options?.margins?.top ?? 0.79,
          bottom: options?.margins?.bottom ?? 0.79,
          left: options?.margins?.left ?? 0.59,
          right: options?.margins?.right ?? 0.59
        },
        displayHeaderFooter: options?.displayHeaderFooter ?? false,
        headerTemplate: options?.headerTemplate ?? '<span></span>',
        footerTemplate: options?.footerTemplate ?? '<span></span>'
      })
    } finally {
      win.destroy()
    }
  }
}
