import { contextBridge, ipcRenderer } from 'electron'

export interface SetupApi {
  save: (url: string, options?: { force?: boolean }) => Promise<{ ok: boolean; error?: string }>
  close: () => void
}

const api: SetupApi = {
  save: (url, options) => ipcRenderer.invoke('hustl:setup:save', url, options),
  close: () => ipcRenderer.send('hustl:setup:close')
}

contextBridge.exposeInMainWorld('hustlSetup', api)
